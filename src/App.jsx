import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { emptyMeasurements, evaluateCompatibility, formatMm } from './compatibility';
import { loadPhones } from './loadPhones';
import Modal from './components/Modal';
import PhoneImage from './components/PhoneImage';
import SpecTable from './components/SpecTable';

function App() {
  const [phones, setPhones] = useState([]);
  const [glassModel, updateGlassModel] = useState(null);
  const [measurements, setMeasurements] = useState(emptyMeasurements);
  const setGlassModel = phone => { updateGlassModel(phone); setMeasurements(emptyMeasurements()); setResult(null); };
  const [deviceModel, updateDeviceModel] = useState(null);
  const setDeviceModel = phone => { updateDeviceModel(phone); setResult(null); };
  const [glassQuery, setGlassQuery] = useState('');
  const [deviceQuery, setDeviceQuery] = useState('');
  const [result, setResult] = useState(null);

  const [glassType, setGlassType] = useState('Type A');
  const [brandFilter, setBrandFilter] = useState('All'); // Brand filter state
  const [toast, setToast] = useState(null); // { msg, type: 'success'|'error' }

  const [loading, setLoading] = useState(false);
  const [catalogueState, setCatalogueState] = useState('loading');
  const [onlineQuery, setOnlineQuery] = useState('');
  const closeManual = useCallback(() => setShowManualForm(false), []);
  const closeOnline = useCallback(() => setShowOnlineSearchForm(false), []);
  const closeZoom = useCallback(() => setShowZoom(false), []);
  const close360 = useCallback(() => setShow360(false), []);
  const [editQuery, setEditQuery] = useState('');
  const [showZoom, setShowZoom] = useState(false);
  const [show360, setShow360] = useState(false);
  const [show360Source, setShow360Source] = useState('device'); // 'glass' | 'device'

  // Manual Entry State
  const [showManualForm, setShowManualForm] = useState(false);
  const [showOnlineSearchForm, setShowOnlineSearchForm] = useState(false);
  const [manualForm, setManualForm] = useState({
    model: '',
    brand: '',
    height_mm: '',
    width_mm: '',
    screen_size: '',
    resolution: '',
    screen_type: 'Flat',
    notch_type: 'Punch Hole',
    image_url: ''
  });

  const handleManualChange = (e) => {
    const { name, value } = e.target;
    setManualForm(prev => ({ ...prev, [name]: value }));
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const API_BASE = '';
      const res = await fetch(`${API_BASE}/api/manual-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualForm)
      });
      const data = await res.json();
      if (data.success) {
        setPhones(prev => {
          // Replace if exists, else add
          const idx = prev.findIndex(p => p.model === data.phone.model);
          if (idx !== -1) {
            const newPhones = [...prev];
            newPhones[idx] = data.phone;
            return newPhones;
          }
          return [...prev, data.phone];
        });
        showToast(`✓ Saved: ${data.phone.model}`);
        if (glassModel?.model === data.phone.model) setGlassModel(data.phone);
        if (deviceModel?.model === data.phone.model) setDeviceModel(data.phone);
        setShowManualForm(false);
        setManualForm({
          model: '', brand: '', height_mm: '', width_mm: '', screen_size: '', resolution: '', screen_type: 'Flat', notch_type: 'Punch Hole', image_url: '', view360_url: ''
        });
      } else {
        showToast('Error saving: ' + data.error, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to save manual entry.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    loadPhones(supabase).then(({ phones: loaded, offline }) => {
      if (!active) return;
      setPhones(loaded);
      setCatalogueState(offline ? 'bundled' : 'online');
    }).catch(error => { if (active) { setCatalogueState('error'); setToast({ msg: error.message, type: 'error' }); } });
    return () => { active = false; };
  }, []);

  // Toast helper — auto-dismiss after five seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
  };

  // History — last 5 checks, persisted to localStorage
  const [history, setHistory] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('glassCheckerHistory') || '[]'); return Array.isArray(saved) ? saved.filter(h => h?.glass?.model && h?.device?.model).slice(0, 5) : []; }
    catch { return []; }
  });

  const saveToHistory = (glass, device, result) => {
    const entry = {
      glass: { model: glass.model, brand: glass.brand },
      device: { model: device.model, brand: device.brand },
      glassType,
      measurements: { ...measurements },
      status: result.compatibility_status,
      color: result.color_code,
      ts: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
    setHistory(prev => {
      const next = [entry, ...prev.filter(h => !(h.glass.model === entry.glass.model && h.device.model === entry.device.model))].slice(0, 5);
      try { localStorage.setItem('glassCheckerHistory', JSON.stringify(next)); } catch { /* History remains available in memory. */ }
      return next;
    });
  };

  const copyResult = async () => {
    if (!result || !glassModel || !deviceModel) return;
    const text = [
      'Glass Compatibility Check', 'Glass source: ' + glassModel.model, 'Target: ' + deviceModel.model, 'Mode: ' + glassType,
      'Physical glass (H × W): ' + formatMm(result.physical.height_mm) + ' × ' + formatMm(result.physical.width_mm),
      'Thickness: ' + formatMm(result.physical.thickness_mm),
      'Body clearance per edge (top/bottom, left/right): ' + formatMm(result.vertical_clearance) + ', ' + formatMm(result.horizontal_clearance),
      'Glass minus display (H, W): ' + formatMm(result.display_height_margin) + ', ' + formatMm(result.display_width_margin),
      'Result: ' + result.compatibility_status, result.reason_message,
    ].join('\n');
    try { await navigator.clipboard.writeText(text); showToast('Result copied to clipboard!'); }
    catch { showToast('Clipboard unavailable. Select and copy the result text instead.', 'error'); }
  };

  // Derive unique sorted brand list from local DB
  const brandList = ['All', ...Array.from(new Set(phones.map(p => p.brand).filter(Boolean))).sort()];
  // Per-brand counts for stats
  const brandCounts = phones.reduce((acc, p) => { acc[p.brand] = (acc[p.brand] || 0) + 1; return acc; }, {});

  const searchOnline = async (query, setModel, setQuery) => {
    if (!query) return;
    setLoading(true);
    try {
      // Same-origin API works through Vite's development proxy and in production.
      const API_BASE = '';
      const res = await fetch(`${API_BASE}/api/search?model=${encodeURIComponent(query)}`);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Online search failed');
      }
      const newPhone = await res.json();

      // Update local state
      setPhones(prev => {
        const exists = prev.find(p => p.model === newPhone.model);
        if (exists) return prev.map(p => p.model === newPhone.model ? newPhone : p);
        return [...prev, newPhone];
      });
      setModel(newPhone);
      setQuery('');
      setLoading(false);
      setShowOnlineSearchForm(false);
      setOnlineQuery('');
      showToast(`✓ Loaded: ${newPhone.model}`);
    } catch (err) {
      console.error(err);
      setLoading(false);
      showToast(err.message || 'Online search failed.', 'error');
    }
  };



  const childModels = glassModel ? phones.filter(p => evaluateCompatibility(glassModel, p, glassType, measurements).isCompatible) : [];

  const checkCompatibility = () => {
    if (!glassModel || !deviceModel) return;
    const resultObj = evaluateCompatibility(glassModel, deviceModel, glassType, measurements);
    setResult(resultObj);
    saveToHistory(glassModel, deviceModel, resultObj);
  };

  const filteredGlassOptions = glassQuery === '' ? [] : phones.filter(p => {
    const matchesQuery = p.model.toLowerCase().includes(glassQuery.toLowerCase()) ||
      (p.brand || '').toLowerCase().includes(glassQuery.toLowerCase());
    const matchesBrand = brandFilter === 'All' || p.brand === brandFilter;
    return matchesQuery && matchesBrand;
  });

  const filteredDeviceOptions = deviceQuery === '' ? [] : phones.filter(p => {
    const matchesQuery = p.model.toLowerCase().includes(deviceQuery.toLowerCase()) ||
      (p.brand || '').toLowerCase().includes(deviceQuery.toLowerCase());
    const matchesBrand = brandFilter === 'All' || p.brand === brandFilter;
    return matchesQuery && matchesBrand;
  });

  return (
    <div className="min-h-screen py-6 sm:py-10 px-3 sm:px-6 lg:px-8 flex flex-col items-center app-shell">

      {/* Toast Notification */}
      {toast && (
        <div role={toast.type === 'error' ? 'alert' : 'status'} className={`fixed top-4 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-md z-[100] px-5 py-3 rounded-xl shadow-2xl text-white text-sm font-semibold flex items-center gap-3 animate-fade-in transition-all ${toast.type === 'error' ? 'bg-red-600/90 border border-red-400/40' : 'bg-green-600/90 border border-green-400/40'
          } backdrop-blur-md`}>
          <span>{toast.type === 'error' ? '❌' : '✅'}</span>
          <span className="min-w-0 break-words">{toast.msg}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)} className="shrink-0 px-2 py-1">✕</button>
        </div>
      )}

      <div className="w-full min-w-0 max-w-2xl lg:max-w-6xl space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="text-center px-2">
          <h1 className="text-3xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-300 mb-2 drop-shadow-sm">
            Tempered Glass Fit Checker
          </h1>
          <p className="text-slate-300 tracking-wide font-light text-sm sm:text-base">
            Compare your measured protector with a target phone.
          </p>
          <p className="text-xs text-slate-300 mt-3" role="status">
            {catalogueState === 'loading' ? 'Loading phone models…' : catalogueState === 'error' ? 'Catalogue unavailable. Reload the page to retry.' : phones.length + ' models · ' + (catalogueState === 'bundled' ? 'Bundled catalogue' : 'Online catalogue')}
          </p>
        </div>

        {/* Brand Filter Bar */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Filter by Brand</p>
          <p className="text-xs text-slate-400 mb-3">Applies to both model searches. Choose All to compare across brands.</p>
          <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 custom-scrollbar snap-x">
            {brandList.map(brand => (
              <button
                key={brand}
                aria-pressed={brandFilter === brand}
                onClick={() => setBrandFilter(brand)}
                className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 ${brandFilter === brand
                  ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-500/30'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:border-purple-500/50 hover:text-white'
                  }`}
              >
                {brand}
                {brand !== 'All' && brandCounts[brand] && (
                  <span className={`text-[9px] px-1 rounded-full ${brandFilter === brand ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-500'}`}>
                    {brandCounts[brand]}
                  </span>
                )}
                {brand === 'All' && (
                  <span className={`text-[9px] px-1 rounded-full ${brandFilter === brand ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-500'}`}>
                    {phones.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>



        {/* CARDS GRID (Desktop mode) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-start w-full">

          {/* STEP 1: GLASS SELECTION CARD */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl min-w-0 relative group flex flex-col">
          <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-6xl text-purple-500 pointer-events-none select-none">1</div>
          <h2 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="bg-purple-500 rounded-lg p-1.5 shadow-lg shadow-purple-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            </span>
            Select Glass
          </h2>

          {/* Glass Type Selector */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Compatibility Mode</label>
            <div className="grid grid-cols-3 gap-1 sm:gap-2 bg-slate-900/50 p-1.5 rounded-xl border border-white/5">
              {['Type A', 'Type B', 'Type C'].map((type) => (
                <button
                  key={type}
                  aria-pressed={glassType === type}
                  onClick={() => { setGlassType(type); setResult(null); }}
                  className={`py-2 px-2 rounded-lg text-xs font-bold transition-all duration-300 ${glassType === type
                    ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25 scale-[1.02]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {type === 'Type A' && 'Type A (Clear)'}
                  {type === 'Type B' && 'Type B (Full)'}
                  {type === 'Type C' && 'Type C (Curved)'}
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-slate-300 mt-3 px-1">
              {glassType === 'Type A' && "Clear glass: checks measured size, display coverage and camera / notch type."}
              {glassType === 'Type B' && "Full cover: check dimensions, then verify black borders and camera openings physically."}
              {glassType === 'Type C' && "Curved glass: requires an exact model match and a physical curve check."}
            </p>
          </div>

          {/* Glass Model Input */}
          <div className="mb-4">
            <label htmlFor="glass-model" className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Search Glass Model</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-500 pointer-events-none">🔍</span>
              <input
                type="text"
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-9 pr-10 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500/50 focus:border-transparent outline-none transition-all"
                id="glass-model"
                disabled={catalogueState === 'loading'}
                placeholder="e.g. Realme 12 5G"
                value={glassModel ? glassModel.model : glassQuery}
                onChange={(e) => { setGlassQuery(e.target.value); setGlassModel(null); setResult(null); }}
              />
              {(glassModel || glassQuery) && (
                <button aria-label="Clear glass model" onClick={() => { setGlassModel(null); setGlassQuery(''); setResult(null); }} className="absolute right-3 text-slate-400 hover:text-white text-lg leading-none">✕</button>
              )}
            </div>

            {/* Inline Results Panel */}
            {glassQuery && !glassModel && (
              <div className="mt-3 rounded-xl border border-white/10 overflow-hidden">
                {filteredGlassOptions.length > 0 ? (
                  <div className="divide-y divide-white/5 max-h-64 overflow-y-auto custom-scrollbar">
                    {filteredGlassOptions.slice(0, 8).map(phone => (
                      <button
                        key={phone.model}
                        onClick={() => { setGlassModel(phone); setGlassQuery(''); }}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/60 hover:bg-purple-600/20 transition-colors text-left group"
                      >
                        <PhoneImage phone={phone} compact className="w-9 h-11 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white truncate group-hover:text-purple-200">{phone.model}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">{phone.brand}</span>
                            <span className="text-[10px] text-slate-500">{phone.screen_size}"</span>
                            <span className="text-[10px] text-slate-500">{phone.screen_type}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">Select ›</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-5 bg-slate-900/60 flex flex-col items-center gap-3">
                    <p className="text-slate-400 text-sm">No local results for <span className="text-white font-semibold">"{glassQuery}"</span></p>
                    <button
                      onClick={() => searchOnline(glassQuery, setGlassModel, setGlassQuery)}
                      disabled={loading}
                      className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs px-5 py-2 rounded-lg transition-colors font-semibold"
                    >
                      {loading ? '⏳ Searching GSMArena...' : '🌐 Search Online'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <fieldset className="mt-2 min-w-0 rounded-xl border border-purple-500/30 bg-slate-900/50 p-4">
            <legend className="px-2 text-sm font-semibold text-purple-200">Physical tempered glass measurements</legend>
            <p className="mb-3 text-xs text-slate-400">Measure the actual protector edge to edge in portrait orientation. Height and width are needed for a dimension check; thickness is optional. Saved with recent checks on this browser.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[['height_mm', 'Height (mm)', '155.50'], ['width_mm', 'Width (mm)', '71.00'], ['thickness_mm', 'Thickness (mm)', '0.33']].map(([key, label, placeholder]) => (
                <label key={key} className="text-xs text-slate-300">{label}
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder={placeholder}
                    value={measurements[key]} onChange={e => { setMeasurements(prev => ({ ...prev, [key]: e.target.value })); setResult(null); }}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800 p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </label>
              ))}
            </div>
          </fieldset>

          {glassModel && <p className="mt-3 text-sm text-purple-200 break-words">Selected source: <strong>{glassModel.model}</strong></p>}
          {/* Child Models (Compatible List) */}
          {
            glassModel && (
              <div className="mt-4 p-4 bg-purple-500/5 rounded-xl border border-purple-500/10 flex-1 flex flex-col">
                <h3 className="text-purple-300 font-bold mb-3 text-xs uppercase tracking-wide flex items-center gap-2">
                  <span>✨</span> Dimension matches ({childModels.length})
                </h3>

                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                  {childModels.length > 0 ? (
                    childModels.map(p => {
                      const activeClass = 'bg-slate-800 text-slate-300 border-white/5';
                      return (
                        <button
                          key={p.model}
                          className={`text-[10px] px-2 py-1 rounded border transition-all hover:bg-white/10 ${activeClass}`}
                          onClick={() => setDeviceModel(p)}
                          title={`Click to select as Device`}
                        >
                          {p.model}
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-slate-500 italic text-xs">Enter physical measurements to find dimension matches. Full-cover and curved glass require a physical check.</span>
                  )}
                </div>
              </div>
            )
          }
        </div>

        {/* STEP 2: DEVICE SELECTION CARD */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl min-w-0 relative flex flex-col">
          <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-6xl text-blue-500 pointer-events-none select-none">2</div>
          <h2 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="bg-blue-500 rounded-lg p-1.5 shadow-lg shadow-blue-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            </span>
            Target Device
          </h2>

          <div className="mb-6">
            <label htmlFor="device-model" className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Search Device Model</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-500 pointer-events-none">🔍</span>
              <input
                type="text"
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-9 pr-10 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none transition-all"
                id="device-model"
                disabled={catalogueState === 'loading'}
                placeholder="e.g. Samsung Galaxy A55"
                value={deviceModel ? deviceModel.model : deviceQuery}
                onChange={(e) => { setDeviceQuery(e.target.value); setDeviceModel(null); setResult(null); }}
              />
              {(deviceModel || deviceQuery) && (
                <button aria-label="Clear target device" onClick={() => { setDeviceModel(null); setDeviceQuery(''); setResult(null); }} className="absolute right-3 text-slate-400 hover:text-white text-lg leading-none">✕</button>
              )}
            </div>

            {/* Inline Results Panel */}
            {deviceQuery && !deviceModel && (
              <div className="mt-3 rounded-xl border border-white/10 overflow-hidden">
                {filteredDeviceOptions.length > 0 ? (
                  <div className="divide-y divide-white/5 max-h-64 overflow-y-auto custom-scrollbar">
                    {filteredDeviceOptions.slice(0, 8).map(phone => (
                      <button
                        key={phone.model}
                        onClick={() => { setDeviceModel(phone); setDeviceQuery(''); }}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/60 hover:bg-blue-600/20 transition-colors text-left group"
                      >
                        <PhoneImage phone={phone} compact className="w-9 h-11 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white truncate group-hover:text-blue-200">{phone.model}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">{phone.brand}</span>
                            <span className="text-[10px] text-slate-500">{phone.screen_size}"</span>
                            <span className="text-[10px] text-slate-500">{phone.screen_type}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">Select ›</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-5 bg-slate-900/60 flex flex-col items-center gap-3">
                    <p className="text-slate-400 text-sm">No local results for <span className="text-white font-semibold">"{deviceQuery}"</span></p>
                    <button
                      onClick={() => searchOnline(deviceQuery, setDeviceModel, setDeviceQuery)}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-5 py-2 rounded-lg transition-colors font-semibold"
                    >
                      {loading ? '⏳ Searching GSMArena...' : '🌐 Search Online'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {deviceModel ? (
            <div className="flex gap-4 rounded-xl bg-blue-500/5 border border-blue-500/20 p-4">
              <PhoneImage phone={deviceModel} className="w-16 h-24 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-blue-200 break-words">{deviceModel.model}</p>
                <p className="text-sm text-slate-300 mt-1">{formatMm(Number(deviceModel.height_mm) || null)} × {formatMm(Number(deviceModel.width_mm) || null)}</p>
                <p className="text-xs text-slate-400 mt-2">{deviceModel.screen_type || 'Unknown screen shape'} · {deviceModel.notch_type || 'Unknown camera / notch'}</p>
              </div>
            </div>
          ) : <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm leading-relaxed text-slate-400">Select the phone you want to protect. Its body and display sizes will be compared with your glass measurements.</p>}
        </div > {/* End of Step 2 Card */}

        </div> {/* End Cards Grid */}

          {(glassModel || deviceModel) && (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
              <h2 className="font-semibold text-white">Phone reference images</h2>
              <p className="text-xs text-slate-400 mt-1">Model photos are for reference and are not shown to scale.</p>
              <div className="grid grid-cols-2 gap-4 mt-4">
                {[['Source phone', glassModel, 'glass'], ['Target device', deviceModel, 'device']].map(([label, phone, source]) => (
                  <div key={label} className="min-w-0 text-center">
                    <button disabled={!phone} onClick={() => setShowZoom(true)} aria-label={'Enlarge ' + label.toLowerCase() + ' image'} className="w-full rounded-xl p-2 hover:bg-white/5 disabled:cursor-default">
                      <PhoneImage phone={phone} className="w-full h-32 sm:h-44" />
                    </button>
                    <p className="mt-2 text-xs text-slate-400">{label}</p>
                    <p className="text-sm font-semibold text-white break-words mt-1">{phone?.model || 'Select a model'}</p>
                    {phone && <button className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/10" onClick={() => {
                      if (phone.view360_url) { setShow360Source(source); setShow360(true); }
                      else window.open('https://www.google.com/search?q=' + encodeURIComponent(phone.model + ' 360 degree view'), '_blank', 'noopener,noreferrer');
                    }}>{phone.view360_url ? 'Open 360° view' : 'Search 360° view'}</button>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {showZoom && <Modal title="Phone reference images" onClose={closeZoom} wide>
            <div className="grid grid-cols-2 gap-4 p-4 sm:p-6">
              {[['Source phone', glassModel], ['Target device', deviceModel]].map(([label, phone]) => <div key={label} className="min-w-0 text-center">
                <p className="text-xs text-slate-400">{label}</p>
                <h3 className="font-semibold text-sm sm:text-lg break-words mt-1 mb-4">{phone?.model || 'No model selected'}</h3>
                <PhoneImage phone={phone} className="w-full h-[45dvh] sm:h-[60dvh]" />
              </div>)}
            </div>
          </Modal>}

          {show360 && <Modal title="360° model view" onClose={close360} wide>
            <div className="p-4">
              <iframe src={(show360Source === 'glass' ? glassModel : deviceModel)?.view360_url} title="360 degree phone view" className="w-full h-[60dvh] rounded-xl border-0 bg-white" allowFullScreen />
              <a className="inline-block mt-4 text-sm text-blue-300 underline" href={(show360Source === 'glass' ? glassModel : deviceModel)?.view360_url} target="_blank" rel="noreferrer">Open in a new tab</a>
            </div>
          </Modal>}

      {/* Check Button */}
      < button
        onClick={checkCompatibility}
        disabled={!glassModel || !deviceModel
        }
        className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-size-200 hover:bg-pos-100 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed text-white font-black py-5 rounded-2xl shadow-xl shadow-purple-900/40 transform active:scale-[0.98] transition-all duration-300 text-base sm:text-xl tracking-wide uppercase mt-8 border border-white/10"
      >
        Check Compatibility
      </button >

      {/* RESULT CARD */}
      {
        result && (
          <div className="mt-8 sm:mt-12 w-full rounded-3xl overflow-hidden shadow-2xl animate-fade-in bg-slate-900/80 border border-white/10" role="status">
            <div className="relative p-4 sm:p-8">
              {/* Header Status */}
              <div className="text-center mb-8">
                <div className={`inline-flex px-4 py-1.5 rounded-full text-xs font-bold text-white mb-4 ${result.colorClass}`}>
                  <span>{glassType} Evaluation</span>
                </div>
                <h2 className={`text-2xl sm:text-4xl font-black mb-4 break-words ${result.color_code === 'RED' ? 'text-red-300' : result.color_code === 'YELLOW' ? 'text-yellow-300' : 'text-green-300'}`}>
                  {result.compatibility_status}
                </h2>
                <p className="text-sm sm:text-base text-slate-200 max-w-2xl mx-auto leading-relaxed opacity-90">
                  {result.reason_message}
                </p>
              </div>

              <div className="mb-6 rounded-2xl bg-black/20 p-4 border border-white/10">
                <h3 className="font-semibold text-white mb-3">Physical measurement result</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-300">
                  {[
                    ['Glass height × width', formatMm(result.physical.height_mm) + ' × ' + formatMm(result.physical.width_mm)],
                    ['Glass thickness (recorded only)', formatMm(result.physical.thickness_mm)],
                    ['Top / bottom body clearance per edge', formatMm(result.vertical_clearance)],
                    ['Left / right body clearance per edge', formatMm(result.horizontal_clearance)],
                    ['Glass minus display height (total)', formatMm(result.display_height_margin)],
                    ['Glass minus display width (total)', formatMm(result.display_width_margin)],
                  ].map(([label, value]) => <div key={label} className="min-w-0 break-words"><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
                </dl>
                <p className="mt-3 text-xs text-slate-400">Clearance assumes centred placement against the outer phone body. Negative clearance means overhang; a negative display margin means incomplete coverage. Display dimensions may be estimates. Thickness alone cannot confirm touch or fingerprint performance.</p>
              </div>

              <SpecTable glass={glassModel} device={deviceModel} />
              <div>
                {/* Copy Result + New Check */}
                <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
                  <button onClick={copyResult} className="flex justify-center items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-semibold text-white border border-white/10 transition-all">
                    📋 Copy Result
                  </button>
                  <button onClick={() => { setResult(null); setGlassModel(null); setDeviceModel(null); setGlassQuery(''); setDeviceQuery(''); }} className="flex justify-center items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-semibold text-slate-300 hover:text-white border border-white/10 transition-all">
                    🔄 New Check
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Recent History */}
      {
        history.length > 0 && (
          <div className="mt-8 bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">🗓️ Recent Checks</p>
              <button onClick={() => { setHistory([]); try { localStorage.removeItem('glassCheckerHistory'); } catch { /* Storage may be unavailable. */ } }} className="px-3 py-2 text-xs text-slate-300 hover:text-red-300 transition-colors">Clear</button>
            </div>
            <div className="space-y-2">
              {history.map((h, i) => {
                const colorMap = { GREEN: 'bg-green-500/20 text-green-300 border-green-500/30', TEAL: 'bg-teal-500/20 text-teal-300 border-teal-500/30', YELLOW: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', RED: 'bg-red-500/20 text-red-300 border-red-500/30' };
                return (
                  <button type="button" key={i} className="w-full text-left flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 rounded-xl bg-slate-900/40 hover:bg-slate-900/60 transition-colors cursor-pointer group"
                    onClick={() => {
                      const g = phones.find(p => p.model === h.glass.model);
                      const d = phones.find(p => p.model === h.device.model);
                      if (g && d) {
                        setGlassModel(g); setDeviceModel(d);
                        setGlassType(h.glassType || 'Type A');
                        setMeasurements({ ...emptyMeasurements(), ...h.measurements });
                        setResult(null);
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        <span className="text-purple-300">{h.glass.model}</span>
                        <span className="text-slate-500 mx-1">→</span>
                        <span className="text-blue-300">{h.device.model}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">{h.ts}</div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full border shrink-0 ${colorMap[h.color] || 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                      {{ 'NOT COMPATIBLE': 'Not compatible', 'COMPATIBLE': 'Compatible', 'DIMENSIONS FIT': 'Dimensions fit', 'NEEDS VERIFICATION': 'Verify fit', 'CAUTION: CHECK BEZELS': 'Check bezels', 'PERFECT FIT': 'Model match' }[h.status] || h.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      }
      </div>


      {/* === FIXED FABs === */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center gap-3 border-t border-white/10 bg-slate-950/95 p-3 pb-safe backdrop-blur-md sm:bottom-5 sm:left-auto sm:right-5 sm:rounded-2xl sm:border sm:p-3">
        <button
          aria-label="Search phone models online"
          onClick={() => setShowOnlineSearchForm(true)}
          className="flex flex-1 sm:flex-none min-w-0 justify-center items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-full shadow-2xl shadow-blue-900/50 transition-all active:scale-95 py-3 px-3 border border-blue-400/30"
        >
          <span className="text-lg leading-none">🌐</span>
          <span className="text-sm">Search Online</span>
        </button>
        <button
          onClick={() => setShowManualForm(true)}
          title="Add or Edit a Phone Model"
          className="flex flex-1 sm:flex-none min-w-0 justify-center items-center gap-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-bold rounded-full shadow-2xl shadow-purple-900/50 transition-all active:scale-95 py-3 px-3 border border-purple-400/30"
        >
          <span className="text-lg leading-none">✏️</span>
          <span className="text-sm sm:hidden">Add / Edit</span>
          <span className="text-sm hidden sm:inline">Add / Edit Model</span>
        </button>
      </div>

      {showOnlineSearchForm && <Modal title="Search online" onClose={closeOnline}>
        <form className="p-4 sm:p-6 space-y-4" onSubmit={async e => {
          e.preventDefault();
          if (!onlineQuery.trim() || loading) return;
          await searchOnline(onlineQuery.trim(), setDeviceModel, setDeviceQuery);
        }}>
          <p className="text-sm text-slate-400">Find a phone model to use as the target device.</p>
          <label className="block text-sm text-slate-200">Phone model
            <input data-autofocus required value={onlineQuery} onChange={e => setOnlineQuery(e.target.value)} placeholder="e.g. POCO C85, Vivo T3" className="mt-2 w-full rounded-xl border border-white/15 bg-slate-800 px-4 py-3 text-white" />
          </label>
          <button type="submit" disabled={loading || !onlineQuery.trim()} className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 font-semibold disabled:opacity-50">{loading ? 'Searching…' : 'Search and select device'}</button>
        </form>
      </Modal>}

  {/* === SLIDE-UP MODAL DRAWER === */ }
  {
    showManualForm && (
      <Modal title="Add / Edit Model" onClose={closeManual}>
          {/* Form Body */}
          <form onSubmit={handleManualSubmit} className="p-5 space-y-4">

            {/* Load Existing */}
            <div className="relative">
              <label htmlFor="edit-model" className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Load Existing Data to Edit</label>
              <input
                type="text"
                id="edit-model"
                placeholder="Search model to edit..."
                className="w-full bg-slate-800 border border-purple-500/30 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none placeholder-slate-500"
                value={editQuery}
                onChange={(e) => setEditQuery(e.target.value)}
              />
              {editQuery && (
                <div className="absolute w-full bg-slate-800 border border-slate-600 max-h-40 overflow-y-auto rounded-xl shadow-xl left-0 top-full mt-1 z-50">
                  {phones.filter(p => p.model.toLowerCase().includes(editQuery.toLowerCase())).slice(0, 10).map(p => (
                    <button type="button"
                      key={p.model}
                      className="w-full text-left p-3 text-sm text-slate-300 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0"
                      onClick={() => {
                        setManualForm({
                          model: p.model,
                          brand: p.brand,
                          height_mm: p.height_mm || '',
                          width_mm: p.width_mm || '',
                          screen_size: p.screen_size || '',
                          resolution: p.resolution || '',
                          screen_type: p.screen_type || 'Flat',
                          notch_type: p.notch_type || 'Punch Hole',
                          image_url: p.image_url || '',
                          view360_url: p.view360_url || ''
                        });
                        setEditQuery('');
                      }}
                    >
                      <span className="font-bold text-white">{p.brand}</span> {p.model}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Model + Brand */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="manual-model" className="block text-xs font-medium text-slate-400 mb-1.5">Model Name *</label>
                <input id="manual-model" required name="model" value={manualForm.model} onChange={handleManualChange} placeholder="e.g. My Phone Pro" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
              <div>
                <label htmlFor="manual-brand" className="block text-xs font-medium text-slate-400 mb-1.5">Brand *</label>
                <input id="manual-brand" required name="brand" value={manualForm.brand} onChange={handleManualChange} placeholder="e.g. Samsung" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
            </div>

            {/* Height + Width + Screen */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="manual-height_mm" className="block text-xs font-medium text-slate-400 mb-1.5">Height (mm) *</label>
                <input id="manual-height_mm" required type="number" min="0.01" step="0.01" name="height_mm" value={manualForm.height_mm} onChange={handleManualChange} placeholder="160.5" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
              <div>
                <label htmlFor="manual-width_mm" className="block text-xs font-medium text-slate-400 mb-1.5">Width (mm) *</label>
                <input id="manual-width_mm" required type="number" min="0.01" step="0.01" name="width_mm" value={manualForm.width_mm} onChange={handleManualChange} placeholder="75.2" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="manual-screen_size" className="block text-xs font-medium text-slate-400 mb-1.5">Screen (inch) *</label>
                <input id="manual-screen_size" required type="number" min="0.01" step="0.01" name="screen_size" value={manualForm.screen_size} onChange={handleManualChange} placeholder="6.7" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
            </div>

            {/* Resolution + Image */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="manual-resolution" className="block text-xs font-medium text-slate-400 mb-1.5">Resolution</label>
                <input id="manual-resolution" name="resolution" value={manualForm.resolution} onChange={handleManualChange} placeholder="1080 x 2400" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
              <div>
                <label htmlFor="manual-image_url" className="block text-xs font-medium text-slate-400 mb-1.5">Image URL</label>
                <input id="manual-image_url" name="image_url" value={manualForm.image_url} onChange={handleManualChange} placeholder="https://..." className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
            </div>

            {/* 360 URL */}
            <div>
              <label htmlFor="manual-view360_url" className="block text-xs font-medium text-slate-400 mb-1.5">360° View URL <span className="text-slate-600">(Optional)</span></label>
              <input id="manual-view360_url" name="view360_url" value={manualForm.view360_url || ''} onChange={handleManualChange} placeholder="https://... (YouTube/Sketchfab)" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
            </div>

            {/* Screen Type + Notch */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="manual-screen_type" className="block text-xs font-medium text-slate-400 mb-1.5">Screen Type</label>
                <select id="manual-screen_type" name="screen_type" value={manualForm.screen_type} onChange={handleManualChange} className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none">
                  <option value="Flat">Flat</option>
                  <option value="Curved">Curved</option>
                  <option value="2.5D">2.5D</option>
                </select>
              </div>
              <div>
                <label htmlFor="manual-notch_type" className="block text-xs font-medium text-slate-400 mb-1.5">Notch Type</label>
                <select id="manual-notch_type" name="notch_type" value={manualForm.notch_type} onChange={handleManualChange} className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none">
                  <option value="Punch Hole">Punch Hole</option>
                  <option value="Dual Punch Hole">Dual Punch Hole</option>
                  <option value="Waterdrop">Waterdrop</option>
                  <option value="U Notch">U Notch</option>
                  <option value="Wide Notch">Wide Notch</option>
                  <option value="Dynamic Island">Dynamic Island</option>
                  <option value="No Notch">No Notch</option>
                </select>
              </div>
            </div>

            {/* Submit + Cancel */}
            <div className="flex gap-3 pt-2 pb-safe">
              <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-green-900/20 disabled:opacity-50">
                {loading ? '⏳ Saving...' : '✅ Save Model'}
              </button>
              <button type="button" onClick={() => setShowManualForm(false)} className="px-5 py-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl border border-white/10 transition-all font-semibold text-sm">
                Cancel
              </button>
            </div>
          </form>
      </Modal>
    )
  }

    </div >

  );
}

export default App;
