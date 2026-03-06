import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function App() {
  const [phones, setPhones] = useState([]);
  const [glassModel, setGlassModel] = useState(null);
  const [deviceModel, setDeviceModel] = useState(null);
  const [glassQuery, setGlassQuery] = useState('');
  const [deviceQuery, setDeviceQuery] = useState('');
  const [result, setResult] = useState(null);
  const [onlineQuery, setOnlineQuery] = useState('');
  const [glassType, setGlassType] = useState('Type A');
  const [brandFilter, setBrandFilter] = useState('All'); // Brand filter state
  const [toast, setToast] = useState(null); // { msg, type: 'success'|'error' }

  const [loading, setLoading] = useState(false);
  const [editQuery, setEditQuery] = useState('');
  const [showZoom, setShowZoom] = useState(false);
  const [show360, setShow360] = useState(false);
  const [show360Source, setShow360Source] = useState('device'); // 'glass' | 'device'

  // Manual Entry State
  const [showManualForm, setShowManualForm] = useState(false);
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
      const API_BASE = window.location.port === '5173' ? `http://${window.location.hostname}:3000` : '';
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
    const loadPhones = async () => {
      try {
        console.log("[Init] Fetching phones from Supabase...");
        const { data, error } = await supabase
          .from('phones')
          .select('*')
          .order('model', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          setPhones(data);
          console.log(`[Init] Supabase loaded ${data.length} phones successfully.`);
        } else {
          showToast(`Database connected, but 0 phones found! Check Supabase RLS policies.`, 'error');
        }
      } catch (err) {
        console.error('Error loading from Supabase:', err);
        showToast(`DB Error: ${err.message || "Failed to fetch from Supabase. Check env vars."}`, 'error');
      }
    };
    loadPhones();
  }, []);

  // Toast helper — auto-dismiss after 3s
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // History — last 5 checks, persisted to localStorage
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('glassCheckerHistory') || '[]'); }
    catch { return []; }
  });

  const saveToHistory = (glass, device, result) => {
    const entry = {
      glass: { model: glass.model, brand: glass.brand },
      device: { model: device.model, brand: device.brand },
      status: result.compatibility_status,
      color: result.color_code,
      ts: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
    setHistory(prev => {
      const next = [entry, ...prev.filter(h => !(h.glass.model === entry.glass.model && h.device.model === entry.device.model))].slice(0, 5);
      localStorage.setItem('glassCheckerHistory', JSON.stringify(next));
      return next;
    });
  };

  const copyResult = () => {
    if (!result || !glassModel || !deviceModel) return;
    const text = `Glass Compatibility Check\nGlass: ${glassModel.brand} ${glassModel.model}\nDevice: ${deviceModel.brand} ${deviceModel.model}\nResult: ${result.compatibility_status}\nHeight diff: ${result.height_difference} | Width diff: ${result.width_difference}\nReason: ${result.reason_message}`;
    navigator.clipboard.writeText(text).then(() => showToast('✓ Result copied to clipboard!'));
  };

  // Derive unique sorted brand list from local DB
  const brandList = ['All', ...Array.from(new Set(phones.map(p => p.brand).filter(Boolean))).sort()];
  // Per-brand counts for stats
  const brandCounts = phones.reduce((acc, p) => { acc[p.brand] = (acc[p.brand] || 0) + 1; return acc; }, {});

  const getBrandFamily = (brand) => {
    if (!brand) return 'Unknown';
    const b = brand.toLowerCase();
    if (['oppo', 'vivo', 'realme', 'oneplus', 'iqoo'].includes(b)) return 'BBK';
    if (b === 'apple') return 'Apple';
    if (b === 'samsung') return 'Samsung';
    if (b === 'motorola') return 'Motorola';
    // Return capitalized brand for others
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  // Helper: Camera cut advice based on notch type (standardized values)
  const getCameraCutAdvice = (notch_type) => {
    const n = (notch_type || '').trim();
    if (n === 'Punch Hole') return { cut: false, label: 'No Cut Needed', icon: '⦿', tip: 'Punch-hole display — the camera hole is cut into the screen itself. Use glass with no top notch cut.' };
    if (n === 'Dual Punch Hole') return { cut: false, label: 'No Cut Needed', icon: '⦿⦿', tip: 'Dual punch-hole display — two camera holes cut into the screen. Use glass with no notch cut at the top.' };
    if (n === 'Waterdrop') return { cut: true, label: 'Waterdrop Cut Required', icon: '💧', tip: 'Waterdrop/dewdrop notch — glass needs a small V or U-shaped cutout at the top for camera visibility.' };
    if (n === 'U Notch') return { cut: true, label: 'U-Cut Required', icon: '∪', tip: 'U-shaped notch — glass needs a U-cut at the top. Ensure the cut width matches the notch exactly.' };
    if (n === 'Wide Notch') return { cut: true, label: 'Wide Cut Required', icon: '▬', tip: 'Wide/M-notch display — glass needs a wide top cutout. Verify the notch width matches the glass cut.' };
    if (n === 'Dynamic Island') return { cut: false, label: 'No Cut Needed', icon: '💊', tip: 'Dynamic Island (Apple) — uncut glass fits around the capsule-style display area without interference.' };
    if (n === 'No Notch') return { cut: false, label: 'No Cut Needed', icon: '▭', tip: 'No notch/pop-up/under-display camera — use full-edge coverage glass with no top cutout.' };
    // Fallback
    return { cut: false, label: 'No Cut Needed', icon: '▭', tip: 'Full-screen display — no notch cut required on the glass.' };
  };

  // Helper: Confidence score (0–100)
  const getConfidenceScore = (glass, device, result) => {
    if (!glass || !device || !result) return null;
    if (result.color_code === 'RED') return { score: 0, label: 'Not Compatible', color: 'text-red-400', bar: 'bg-red-500' };
    let score = 100;
    score -= Math.abs(result.hDiff) * 12;
    score -= Math.abs(result.wDiff) * 12;
    const sizeDiff = Math.abs((glass.screen_size || 0) - (device.screen_size || 0));
    score -= sizeDiff * 18;
    const dh = Math.abs((glass.display_height_mm || 0) - (device.display_height_mm || 0));
    const dw = Math.abs((glass.display_width_mm || 0) - (device.display_width_mm || 0));
    if (dh > 0) score -= dh * 8;
    if (dw > 0) score -= dw * 8;
    score = Math.max(0, Math.min(100, Math.round(score)));
    if (score >= 88) return { score, label: 'Excellent Fit', color: 'text-teal-300', bar: 'bg-teal-400' };
    if (score >= 70) return { score, label: 'Good Fit', color: 'text-green-300', bar: 'bg-green-400' };
    if (score >= 50) return { score, label: 'Borderline — Verify Physically', color: 'text-yellow-300', bar: 'bg-yellow-400' };
    return { score, label: 'Poor Fit', color: 'text-orange-400', bar: 'bg-orange-400' };
  };

  // Helper: In-display fingerprint warning
  const getFingerprintWarning = (phone) => {
    if (!phone) return null;
    const brand = (phone.brand || '').toLowerCase();
    const screen = (phone.screen_type || '').toLowerCase();
    const isAmoled = screen.includes('amoled') || screen.includes('oled');
    const isFpsRisk = ['oneplus', 'samsung', 'vivo', 'iqoo', 'realme', 'xiaomi', 'oppo'].includes(brand);
    if (isAmoled && isFpsRisk) return '⚠️ In-display fingerprint sensor detected. Use glass ≤ 0.33mm. Thick glass may cause fingerprint unlock failure.';
    return null;
  };

  // Helper: Failure mode warnings based on result
  const getFailureWarnings = (glass, device, result, glassType) => {
    if (!glass || !device || !result) return [];
    const warnings = [];
    if (glassType === 'Type B') {
      if (result.hDiff < -1.0 && result.hDiff >= -3.0) warnings.push('⚠️ Corner lift risk — small gap between glass edge and device bezel may cause lifting over time.');
      if (result.hDiff > 0.1 || result.wDiff > 0.1) warnings.push('❌ Glass overhangs device — black borders may leak and look misaligned.');
      const isFpsDevice = getFingerprintWarning(device);
      if (isFpsDevice) warnings.push('⚠️ Full-cover (Type B) glass is thicker — may reduce in-display fingerprint accuracy on AMOLED phones.');
    }
    if (glass.notch_type !== device.notch_type) warnings.push('❌ Camera cut mismatch — glass has wrong notch cut for this device. Risk of camera obstruction or dust entry.');
    if ((glass.screen_type || '').toLowerCase().includes('curved') && (device.screen_type || '').toLowerCase().includes('flat'))
      warnings.push('⚠️ Curved glass on flat screen — edges may not adhere fully, causing lift at corners.');
    return warnings;
  };

  // Helper: Installation tips per display type
  const getInstallTips = (notch_type, screen_type, glassType) => {
    const tips = ['🧹 Clean the screen with a microfiber cloth and remove all dust before applying.', '💨 Use the included dust sticker to pick up any remaining particles in corners.'];
    const n = (notch_type || '').toLowerCase();
    if (n.includes('punch hole')) tips.push('⦿ Align the camera hole cutout first, then press edges down from center outward.');
    else if (n.includes('wide notch')) tips.push('▬ Align the top notch cut-out with camera area before pressing down.');
    else if (n.includes('waterdrop') || n.includes('drop')) tips.push('💧 Align the V/U notch cut to the camera, then press from top to bottom.');
    if ((screen_type || '').toLowerCase().includes('amoled')) tips.push('👆 Avoid pressing hard near the fingerprint zone — air bubbles here will block the sensor.');
    if (glassType === 'Type B') tips.push('🖤 Press from center outward and ensure black borders are seated flush against the bezel.');
    tips.push('🕐 Wait 24–48 hours for adhesive to fully cure before applying a case.');
    return tips;
  };

  const searchOnline = async (query, setModel, setQuery) => {
    if (!query) return;
    setLoading(true);
    try {
      // Use window.location.hostname to support network access (e.g. phone testing)
      const API_BASE = window.location.port === '5173' ? `http://${window.location.hostname}:3000` : '';
      const res = await fetch(`${API_BASE}/api/search?model=${encodeURIComponent(query)}`);

      if (!res.ok) throw new Error('Not found');
      const newPhone = await res.json();

      // Update local state
      setPhones(prev => {
        const exists = prev.find(p => p.model === newPhone.model);
        if (exists) return prev; // Don't add if already exists
        return [...prev, newPhone];
      });
      setModel(newPhone);
      setQuery('');
      setLoading(false);
      showToast(`✓ Loaded: ${newPhone.model}`);
    } catch (err) {
      console.error(err);
      setLoading(false);
      showToast('Phone model not found online.', 'error');
    }
  };



  const getFilteredChildModels = () => {
    if (!glassModel) return [];

    const glassFamily = getBrandFamily(glassModel.brand);

    return phones
      .filter(p => p.model !== glassModel.model)
      .filter(p => {
        // Filter: Brand Family (BBK=BBK, Samsung=Samsung, etc.)
        const pFamily = getBrandFamily(p.brand);
        if (glassFamily === 'BBK') {
          if (pFamily !== 'BBK') return false;
        } else {
          if (pFamily !== glassFamily) return false;
        }

        if (glassType === 'Type A') {
          // Type A: Clear Logic (Updated)
          if (p.screen_type !== glassModel.screen_type) return false;
          if (p.notch_type !== glassModel.notch_type) return false;

          const sizeDiff = Math.abs(glassModel.screen_size - p.screen_size);
          if (sizeDiff > 0.80) return false;

          // Display Dimensions Check (if available)
          const gH = glassModel.display_height_mm || 0;
          const pH = p.display_height_mm || 0;
          const gW = glassModel.display_width_mm || 0;
          const pW = p.display_width_mm || 0;

          if (gH > 0 && pH > 0 && Math.abs(gH - pH) > 0.90) return false;
          if (gW > 0 && pW > 0 && Math.abs(gW - pW) > 0.90) return false;

          return true;
        } else if (glassType === 'Type B') {
          // Type B: Full Cover (Strict Safe Fit)
          if (p.screen_type !== glassModel.screen_type) return false;
          if (p.notch_type !== glassModel.notch_type) return false;

          const hDiff = glassModel.height_mm - p.height_mm;
          const wDiff = glassModel.width_mm - p.width_mm;
          return hDiff <= 0.2 && wDiff <= 0.2 && hDiff >= -3.0 && wDiff >= -2.5;
        } else {
          // Type C: Exact Match Only (Handled by initial filter mostly, but safe to keep strict)
          return p.model === glassModel.model;
        }
      })
      .sort((a, b) => {
        // Sort by Brand Family match first (Optional but good UX), then by fit
        // Actually, let's just sort by Fit Quality (Sum of absolute diffs)
        const aH = Math.abs(glassModel.height_mm - a.height_mm);
        const aW = Math.abs(glassModel.width_mm - a.width_mm);

        const bH = Math.abs(glassModel.height_mm - b.height_mm);
        const bW = Math.abs(glassModel.width_mm - b.width_mm);

        return (aH + aW) - (bH + bW);
      });
  };

  const childModels = getFilteredChildModels();

  const checkCompatibility = () => {
    if (!glassModel || !deviceModel) return;

    let status = "COMPATIBLE";
    let colorCode = "GREEN";
    let reason = "";

    // Diff calculation
    const hDiffVal = parseFloat((glassModel.height_mm - deviceModel.height_mm).toFixed(2));
    const wDiffVal = parseFloat((glassModel.width_mm - deviceModel.width_mm).toFixed(2));
    const hDiffStr = (hDiffVal > 0 ? "+" : "") + hDiffVal + "mm";
    const wDiffStr = (wDiffVal > 0 ? "+" : "") + wDiffVal + "mm";

    // --- LOGIC ENGINE SWITCH ---
    if (glassType === 'Type C') {
      // TYPE C: Hot Bending (Exact Match Only)
      if (glassModel.model.toLowerCase() !== deviceModel.model.toLowerCase()) {
        status = "NOT COMPATIBLE";
        colorCode = "RED";
        reason = "Type C (Hot Bending) requires an EXACT Model Name match due to specific curve variance.";
      } else {
        status = "PERFECT FIT";
        colorCode = "TEAL";
        reason = "Exact Match verified for Hot Bending Glass.";
      }
    }
    else if (glassType === 'Type B') {
      // TYPE B: Full Cover (Strict Bezel Match)

      // 1. Check Screen/Notch Type
      if (glassModel.screen_type !== deviceModel.screen_type || glassModel.notch_type !== deviceModel.notch_type) {
        status = "NOT COMPATIBLE";
        colorCode = "RED";
        reason = `Type Mismatch (Screen/Camera) not allowed for Full Cover.`;
      }
      // 2. Strict Dimensions (Current Algo 2.0)
      else if (hDiffVal > 0.2 || wDiffVal > 0.2) {
        status = "NOT COMPATIBLE";
        colorCode = "RED";
        reason = `Glass Overhangs Device (>0.2mm). Black borders will leak.`;
      }
      else if (hDiffVal < -3.0 || wDiffVal < -2.5) {
        status = "NOT COMPATIBLE";
        colorCode = "RED";
        reason = `Glass Too Small. Black borders will block screen.`;
      }
      else {
        // 3. Name Mismatch Warning
        if (glassModel.model.toLowerCase() !== deviceModel.model.toLowerCase()) {
          status = "CAUTION: CHECK BEZELS";
          colorCode = "YELLOW";
          reason = "Dimensions fit, but Model Names differ. Ensure black borders don't cover the screen (Newer phones have thinner bezels).";
        } else {
          status = "PERFECT FIT";
          colorCode = "TEAL";
          reason = "Exact Model Match. Full Cover fits perfectly.";
        }
      }
    }
    else {
      // TYPE A: Clear (Logic Update 4.0 - User Request)
      // Requirements:
      // 1. Screen Type = Match
      // 2. Notch Type = Match
      // 3. Screen Size Diff <= 0.80"
      // 4. Display Width Diff <= 0.90mm
      // 5. Display Height Diff <= 0.90mm

      const sizeDiff = Math.abs(glassModel.screen_size - deviceModel.screen_size);

      // Calculate Display Dimension Diffs (if available)
      const glassH = glassModel.display_height_mm || 0;
      const deviceH = deviceModel.display_height_mm || 0;
      const glassW = glassModel.display_width_mm || 0;
      const deviceW = deviceModel.display_width_mm || 0;

      const displayHDiff = Math.abs(glassH - deviceH);
      const displayWDiff = Math.abs(glassW - deviceW);

      if (glassModel.screen_type !== deviceModel.screen_type) {
        status = "NOT COMPATIBLE";
        colorCode = "RED";
        reason = `Screen Type Mismatch (${glassModel.screen_type} vs ${deviceModel.screen_type}).`;
      }
      else if (glassModel.notch_type !== deviceModel.notch_type) {
        status = "NOT COMPATIBLE";
        colorCode = "RED";
        reason = `Notch Mismatch (${glassModel.notch_type} vs ${deviceModel.notch_type}).`;
      }
      else if (sizeDiff > 0.80) {
        status = "NOT COMPATIBLE";
        colorCode = "RED";
        reason = `Screen Size Mismatch (> 0.80"). (${glassModel.screen_size}" vs ${deviceModel.screen_size}").`;
      }
      else if (glassH > 0 && deviceH > 0 && displayHDiff > 0.90) {
        status = "NOT COMPATIBLE";
        colorCode = "RED";
        reason = `Display Height Mismatch (> 0.90mm) [Diff: ${displayHDiff.toFixed(2)}mm].`;
      }
      else if (glassW > 0 && deviceW > 0 && displayWDiff > 0.90) {
        status = "NOT COMPATIBLE";
        colorCode = "RED";
        reason = `Display Width Mismatch (> 0.90mm) [Diff: ${displayWDiff.toFixed(2)}mm].`;
      }
      else {
        status = "COMPATIBLE";
        colorCode = "GREEN";
        reason = "Type A Glass fits! Matches Screen/Notch types and is within new size/display tolerances (0.8\" / 0.9mm).";
      }
    }

    const colorMap = {
      "GREEN": "bg-green-600",
      "TEAL": "bg-teal-500",
      "YELLOW": "bg-yellow-500",
      "RED": "bg-red-500"
    };

    const resultObj = {
      compatibility_status: status,
      color_code: colorCode,
      colorClass: colorMap[colorCode],
      height_difference: hDiffStr,
      width_difference: wDiffStr,
      reason_message: reason,
      hDiff: hDiffVal,
      wDiff: wDiffVal,
    };
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
    <div className="min-h-screen py-6 sm:py-12 px-3 sm:px-6 lg:px-8 flex flex-col items-center">

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] px-5 py-3 rounded-xl shadow-2xl text-white text-sm font-semibold flex items-center gap-3 animate-fade-in transition-all ${toast.type === 'error' ? 'bg-red-600/90 border border-red-400/40' : 'bg-green-600/90 border border-green-400/40'
          } backdrop-blur-md`}>
          <span>{toast.type === 'error' ? '❌' : '✅'}</span>
          {toast.msg}
        </div>
      )}

      <div className="w-full max-w-2xl space-y-5 sm:space-y-8">
        {/* Header */}
        <div className="text-center px-2">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-300 mb-2 drop-shadow-sm">
            Glass Finder
          </h1>
          <p className="text-slate-300 tracking-wide font-light text-sm sm:text-base">
            Tempered Glass Compatibility Checker
          </p>
          {phones.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              📱 {phones.length} models in database
            </p>
          )}
        </div>

        {/* === SEARCH ONLINE — HERO PLACEMENT === */}
        <div className="relative w-full">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl blur-xl" />
          <div className="relative bg-white/5 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-blue-500/20 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <span className="p-2 bg-blue-500/20 rounded-xl text-blue-300 text-xl">🌐</span>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white leading-tight">Search Newly Launched Model</h3>
                <p className="text-[11px] text-slate-400">Auto-fetch specs from GSMArena &amp; save to cloud</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                className="flex-1 bg-slate-900/70 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/60 focus:border-transparent outline-none transition-all text-sm"
                placeholder="e.g. Nothing Phone 2a, Vivo T3..."
                id="online-search-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const query = e.target.value;
                    if (query) searchOnline(query, (val) => setDeviceModel(val), () => setDeviceQuery(''));
                  }
                }}
              />
              <button
                onClick={() => {
                  const query = document.getElementById('online-search-input').value;
                  if (query) searchOnline(query, (val) => setDeviceModel(val), () => setDeviceQuery(''));
                }}
                disabled={loading}
                className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white px-6 py-3 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-lg shadow-blue-500/25 text-sm whitespace-nowrap"
              >
                {loading ? (
                  <span className="flex items-center gap-2">⏳ Searching...</span>
                ) : (
                  <span className="flex items-center gap-2">🔍 Search</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Brand Filter Bar */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Filter by Brand</p>
          <div className="flex gap-2 sm:gap-3 mb-4 sm:mb-8 overflow-x-auto pb-2 custom-scrollbar snap-x">
            {brandList.map(brand => (
              <button
                key={brand}
                onClick={() => setBrandFilter(brand)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 ${brandFilter === brand
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



        {/* STEP 1: GLASS SELECTION CARD */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl relative group">
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
            <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 bg-slate-900/50 p-1.5 rounded-xl border border-white/5">
              {['Type A', 'Type B', 'Type C'].map((type) => (
                <button
                  key={type}
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
            <p className="text-[10px] text-slate-400 mt-2 px-1">
              {glassType === 'Type A' && "✨ Standard Fit: Matches Screen Size & Notch. Ignores bezels."}
              {glassType === 'Type B' && "🛡️ Full Cover: Strict. Black borders must match perfectly."}
              {glassType === 'Type C' && "🔮 UV Curved: Exact model match required."}
            </p>
          </div>

          {/* Glass Model Input */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Search Glass Model</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-500 pointer-events-none">🔍</span>
              <input
                type="text"
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-9 pr-10 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500/50 focus:border-transparent outline-none transition-all"
                placeholder="Start typing glass model..."
                value={glassModel ? glassModel.model : glassQuery}
                onChange={(e) => { setGlassQuery(e.target.value); setGlassModel(null); setResult(null); }}
              />
              {(glassModel || glassQuery) && (
                <button onClick={() => { setGlassModel(null); setGlassQuery(''); setResult(null); }} className="absolute right-3 text-slate-400 hover:text-white text-lg leading-none">✕</button>
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
                        {phone.image_url
                          ? <img src={phone.image_url} alt={phone.model} className="w-9 h-11 object-contain shrink-0 rounded" onError={e => e.target.style.display = 'none'} />
                          : <div className="w-9 h-9 shrink-0 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-xs">📱</div>
                        }
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

          {/* Child Models (Compatible List) */}
          {
            glassModel && (
              <div className="mt-4 p-4 bg-purple-500/5 rounded-xl border border-purple-500/10">
                <h3 className="text-purple-300 font-bold mb-3 text-xs uppercase tracking-wide flex items-center gap-2">
                  <span>✨</span> Compatible Devices ({getBrandFamily(glassModel.brand)})
                </h3>

                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                  {childModels.length > 0 ? (
                    childModels.map(p => {
                      const hDiff = glassModel.height_mm - p.height_mm;
                      const wDiff = glassModel.width_mm - p.width_mm;
                      const isPerfect = Math.abs(hDiff) <= 0.5 && Math.abs(wDiff) <= 0.5;
                      const activeClass = isPerfect
                        ? 'bg-teal-500/20 text-teal-200 border-teal-500/30'
                        : 'bg-slate-800 text-slate-300 border-white/5';

                      return (
                        <button
                          key={p.model}
                          className={`text-[10px] px-2 py-1 rounded border transition-all hover:bg-white/10 ${activeClass}`}
                          onClick={() => setDeviceModel(p)}
                          title={`Click to select as Device`}
                        >
                          {p.model} {isPerfect && '★'}
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-slate-500 italic text-xs">No known compatible models found based on current rules.</span>
                  )}
                </div>
              </div>
            )
          }
        </div>

        {/* STEP 2: DEVICE SELECTION CARD */}
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl relative mt-8">
          <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-6xl text-blue-500 pointer-events-none select-none">2</div>
          <h2 className="text-lg sm:text-xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="bg-blue-500 rounded-lg p-1.5 shadow-lg shadow-blue-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            </span>
            Target Device
          </h2>

          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Search Device Model</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-500 pointer-events-none">🔍</span>
              <input
                type="text"
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-9 pr-10 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none transition-all"
                placeholder="Start typing device model..."
                value={deviceModel ? deviceModel.model : deviceQuery}
                onChange={(e) => { setDeviceQuery(e.target.value); setDeviceModel(null); setResult(null); }}
              />
              {(deviceModel || deviceQuery) && (
                <button onClick={() => { setDeviceModel(null); setDeviceQuery(''); setResult(null); }} className="absolute right-3 text-slate-400 hover:text-white text-lg leading-none">✕</button>
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
                        {phone.image_url
                          ? <img src={phone.image_url} alt={phone.model} className="w-9 h-11 object-contain shrink-0 rounded" onError={e => e.target.style.display = 'none'} />
                          : <div className="w-9 h-9 shrink-0 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-xs">📱</div>
                        }
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

          {/* Live Image Comparison */}
          {
            (glassModel || deviceModel) && (
              <div className="mt-8 pt-8 border-t border-white/5 animate-fade-in">
                <h3 className="text-center text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Visual Comparison</h3>
                <div className="flex justify-center items-end gap-2 sm:gap-8 mb-6">

                  {/* GLASS PREVIEW — click to zoom */}
                  <div className="text-center w-32 sm:w-40 relative group">
                    {glassModel?.image_url ? (
                      <div className="relative cursor-zoom-in" onClick={() => setShowZoom(true)} title="Click to Zoom">
                        <img src={glassModel.image_url} alt={glassModel.model} className="w-full h-48 object-contain drop-shadow-2xl transition-transform transform group-hover:scale-105" onError={(e) => e.target.style.display = 'none'} />
                        <div className="absolute -bottom-2 -right-2 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg">GLASS</div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm">🔍 Zoom</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-48 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-xs">Waiting for Glass...</div>
                    )}
                    <p className="text-xs text-slate-400 mt-3 font-medium truncate px-2">{glassModel?.model || "Select Glass"}</p>
                  </div>

                  {/* VS BADGE */}
                  <div className="mb-12 text-slate-600 font-black text-xl italic opacity-50">VS</div>

                  {/* DEVICE PREVIEW — click to zoom */}
                  <div className="text-center w-32 sm:w-40 relative group">
                    {deviceModel?.image_url ? (
                      <div className="relative cursor-zoom-in" onClick={() => setShowZoom(true)} title="Click to Zoom">
                        <img src={deviceModel.image_url} alt={deviceModel.model} className="w-full h-48 object-contain drop-shadow-2xl transition-transform transform group-hover:scale-105" onError={(e) => e.target.style.display = 'none'} />
                        <div className="absolute -bottom-2 -right-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg">DEVICE</div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm">🔍 Zoom</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-48 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-xs">Waiting for Device...</div>
                    )}
                    <p className="text-xs text-slate-400 mt-3 font-medium truncate px-2">{deviceModel?.model || "Select Device"}</p>
                  </div>
                </div>

                {/* Glass Model 360 button */}
                {glassModel && (
                  <button
                    onClick={() => {
                      if (glassModel.view360_url) {
                        setShow360Source('glass');
                        setShow360(true);
                      } else {
                        const query = `${glassModel.brand} ${glassModel.model} 360 degree view 91mobiles`;
                        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
                      }
                    }}
                    className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 text-xs px-5 py-2.5 rounded-full border border-purple-500/30 flex items-center gap-2 transition-all backdrop-blur-md"
                  >
                    <span>🔄</span>
                    <span className="text-purple-400 font-bold text-[10px] mr-0.5">Glass</span>
                    {glassModel.view360_url ? '360° View' : 'Search 360°'}
                  </button>
                )}

                {/* Device Model 360 button */}
                {deviceModel && (
                  <button
                    onClick={() => {
                      if (deviceModel.view360_url) {
                        setShow360Source('device');
                        setShow360(true);
                      } else {
                        const query = `${deviceModel.brand} ${deviceModel.model} 360 degree view 91mobiles`;
                        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
                      }
                    }}
                    className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 text-xs px-5 py-2.5 rounded-full border border-blue-500/30 flex items-center gap-2 transition-all backdrop-blur-md"
                  >
                    <span>🔄</span>
                    <span className="text-blue-400 font-bold text-[10px] mr-0.5">Device</span>
                    {deviceModel.view360_url ? '360° View' : 'Search 360°'}
                  </button>
                )}
              </div>
            )}

          {/* ZOOM MODAL */}
          {showZoom && (
            <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-fade-in" onClick={() => setShowZoom(false)}>
              <button className="absolute top-6 right-6 text-white text-4xl hover:text-gray-300 opacity-80 hover:opacity-100 transition-opacity" onClick={() => setShowZoom(false)}>✕</button>
              <div className="flex gap-0 w-full max-w-7xl justify-center items-center h-[85vh]" onClick={e => e.stopPropagation()}>

                {/* Glass Big */}
                <div className="flex flex-col items-center h-full max-w-[50%]">
                  <h3 className="text-purple-400 font-bold mb-4 text-xl tracking-wider">Glass ({glassModel?.model})</h3>
                  {glassModel?.image_url ? (
                    <img src={glassModel.image_url} className="max-w-full max-h-[calc(100%-3rem)] object-contain drop-shadow-2xl" />
                  ) : <div className="text-slate-500">No Image</div>}
                </div>

                {/* Device Big */}
                <div className="flex flex-col items-center h-full max-w-[50%] border-l border-white/10 pl-4">
                  <h3 className="text-blue-400 font-bold mb-4 text-xl tracking-wider">Device ({deviceModel?.model})</h3>
                  {deviceModel?.image_url ? (
                    <img src={deviceModel.image_url} className="max-w-full max-h-[calc(100%-3rem)] object-contain drop-shadow-2xl" />
                  ) : <div className="text-slate-500">No Image</div>}
                </div>

              </div>
              <p className="text-slate-500 text-sm mt-6 font-medium">Click anywhere to close</p>
            </div>
          )}

          {/* 360 View Modal */}
          {(() => {
            const active360Model = show360Source === 'glass' ? glassModel : deviceModel;
            const active360Url = active360Model?.view360_url;
            const active360Label = show360Source === 'glass' ? 'Glass' : 'Device';
            const active360Color = show360Source === 'glass' ? 'text-purple-400' : 'text-blue-400';
            return show360 && active360Url ? (
              <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-fade-in" onClick={() => setShow360(false)}>
                <button className="absolute top-6 right-6 text-white text-4xl hover:text-gray-300 transition-opacity" onClick={() => setShow360(false)}>✕</button>
                <p className={`text-sm font-bold mb-3 ${active360Color}`}>{active360Label}: {active360Model?.model}</p>
                <div className="w-full max-w-5xl h-[75vh] bg-white rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                  <iframe
                    src={active360Url}
                    className="w-full h-full border-0"
                    title={`360 View - ${active360Model?.model}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                </div>
                <div className="mt-4 flex gap-4">
                  <a href={active360Url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 text-sm underline">
                    Open in New Tab
                  </a>
                </div>
              </div>
            ) : null;
          })()}
        </div>
        )
          }
      </div >

      {/* Check Button */}
      < button
        onClick={checkCompatibility}
        disabled={!glassModel || !deviceModel
        }
        className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-size-200 hover:bg-pos-100 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed text-white font-black py-5 rounded-2xl shadow-xl shadow-purple-900/40 transform active:scale-[0.98] transition-all duration-300 text-xl tracking-wide uppercase mt-8 border border-white/10"
      >
        Check Compatibility
      </button >

      {/* RESULT CARD */}
      {
        result && (
          <div className={`mt-12 w-full rounded-3xl overflow-hidden shadow-2xl animate-fade-in relative group ${result.isCompatible ? 'shadow-green-500/30' : 'shadow-red-500/30'}`}>
            <div className={`absolute inset-0 opacity-40 ${result.isCompatible ? 'bg-gradient-to-br from-green-700 via-teal-900 to-slate-900' : 'bg-gradient-to-br from-red-700 via-rose-900 to-slate-900'}`}></div>
            <div className="absolute inset-0 backdrop-blur-3xl"></div>

            <div className={`relative p-8 border rounded-3xl ${result.isCompatible ? 'border-green-500/30' : 'border-red-500/30'}`}>

              {/* Header Status */}
              <div className="text-center mb-8">
                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4 border ${result.isCompatible ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'}`}>
                  <span>{glassType} Evaluation</span>
                </div>
                <h2 className={`text-4xl md:text-5xl font-black uppercase tracking-tight mb-4 drop-shadow-lg ${result.isCompatible ? 'text-transparent bg-clip-text bg-gradient-to-r from-green-300 to-teal-200' : 'text-transparent bg-clip-text bg-gradient-to-r from-red-300 to-pink-200'}`}>
                  {result.compatibility_status}
                </h2>
                <p className="text-lg text-slate-200 font-light italic max-w-2xl mx-auto leading-relaxed opacity-90">
                  "{result.reason_message}"
                </p>
              </div>

              {/* Confidence Score Bar */}
              {(() => {
                const conf = getConfidenceScore(glassModel, deviceModel, result);
                return conf ? (
                  <div className="mb-6 bg-black/20 rounded-2xl p-4 border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fit Confidence</p>
                      <span className={`text-xs font-bold ${conf.color}`}>{conf.score}% — {conf.label}</span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-2 rounded-full transition-all duration-700 ${conf.bar}`} style={{ width: `${conf.score}%` }}></div>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Data Table */}
              <div className="bg-slate-900/40 rounded-2xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                    <thead className="bg-white/5 text-xs text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Specification</th>
                        <th className="px-6 py-4 font-semibold text-purple-300">Glass Model</th>
                        <th className="px-6 py-4 font-semibold text-blue-300">Device Model</th>
                        <th className="px-6 py-4 font-semibold text-right">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">Body Height</td>
                        <td className="px-6 py-4">{glassModel.height_mm}mm</td>
                        <td className="px-6 py-4">{deviceModel.height_mm}mm</td>
                        <td className={`px-6 py-4 text-right font-bold ${Math.abs(result.hDiff) > 1.0 ? 'text-red-400' : 'text-green-400'}`}>
                          {result.height_difference}
                        </td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">Body Width</td>
                        <td className="px-6 py-4">{glassModel.width_mm}mm</td>
                        <td className="px-6 py-4">{deviceModel.width_mm}mm</td>
                        <td className={`px-6 py-4 text-right font-bold ${Math.abs(result.wDiff) > 1.0 ? 'text-red-400' : 'text-green-400'}`}>
                          {result.width_difference}
                        </td>
                      </tr>

                      {/* Display Dimensions */}
                      <tr className="bg-black/20 hover:bg-black/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-purple-200 pl-8 border-l-4 border-purple-500/30">Display Height</td>
                        <td className="px-6 py-4 text-slate-400">{glassModel.display_height_mm || '-'}mm</td>
                        <td className="px-6 py-4 text-slate-400">{deviceModel.display_height_mm || '-'}mm</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-400">
                          {glassModel.display_height_mm && deviceModel.display_height_mm
                            ? (glassModel.display_height_mm - deviceModel.display_height_mm).toFixed(2) + 'mm'
                            : '-'}
                        </td>
                      </tr>
                      <tr className="bg-black/20 hover:bg-black/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-purple-200 pl-8 border-l-4 border-purple-500/30">Display Width</td>
                        <td className="px-6 py-4 text-slate-400">{glassModel.display_width_mm || '-'}mm</td>
                        <td className="px-6 py-4 text-slate-400">{deviceModel.display_width_mm || '-'}mm</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-400">
                          {glassModel.display_width_mm && deviceModel.display_width_mm
                            ? (glassModel.display_width_mm - deviceModel.display_width_mm).toFixed(2) + 'mm'
                            : '-'}
                        </td>
                      </tr>

                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">Screen Size</td>
                        <td className="px-6 py-4">{glassModel.screen_size}"</td>
                        <td className="px-6 py-4">{deviceModel.screen_size}"</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-400">
                          {Math.abs(deviceModel.screen_size - glassModel.screen_size).toFixed(2)}"
                        </td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">Screen Type</td>
                        <td className="px-6 py-4">{glassModel.screen_type}</td>
                        <td className="px-6 py-4">{deviceModel.screen_type}</td>
                        <td className={`px-6 py-4 text-right font-bold ${glassModel.screen_type === deviceModel.screen_type ? 'text-green-400' : 'text-red-400'}`}>
                          {glassModel.screen_type === deviceModel.screen_type ? 'MATCH' : 'MISMATCH'}
                        </td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">Notch Type</td>
                        <td className="px-6 py-4">{glassModel.notch_type}</td>
                        <td className="px-6 py-4">{deviceModel.notch_type}</td>
                        <td className={`px-6 py-4 text-right font-bold ${glassModel.notch_type === deviceModel.notch_type ? 'text-green-400' : 'text-red-400'}`}>
                          {glassModel.notch_type === deviceModel.notch_type ? 'MATCH' : 'MISMATCH'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>



                {/* In-Display FPS Warning */}
                {getFingerprintWarning(deviceModel) && (
                  <div className="mt-3 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex gap-3 items-start">
                    <span className="text-xl shrink-0">👆</span>
                    <p className="text-xs text-orange-200 leading-relaxed">{getFingerprintWarning(deviceModel)}</p>
                  </div>
                )}

                {/* BBK Family Note */}
                {result.color_code !== 'RED' && getBrandFamily(glassModel.brand) === 'BBK' && getBrandFamily(deviceModel.brand) === 'BBK' && glassModel.brand !== deviceModel.brand && (
                  <div className="mt-3 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl flex gap-3 items-start">
                    <span className="text-xl shrink-0">⭐</span>
                    <p className="text-xs text-purple-200 leading-relaxed">
                      <span className="font-bold">BBK Family Cross-Match</span> — {glassModel.brand} and {deviceModel.brand} are both BBK family brands (OPPO/Vivo/Realme/OnePlus/iQOO) and often share identical display dimensions. This is a commonly successful cross-brand fit.
                    </p>
                  </div>
                )}

                {/* Case-Friendly Note */}
                {result.color_code !== 'RED' && (
                  <div className="mt-3 p-3 bg-white/5 border border-white/5 rounded-xl flex gap-3 items-start">
                    <span className="text-base shrink-0">{glassType === 'Type B' ? '⚠️' : '✅'}</span>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {glassType === 'Type B'
                        ? 'Full-cover (Type B) glass has black borders — may conflict with thick cases. Test case fit after installing.'
                        : 'Clear (Type A) glass is usually case-friendly — no black borders to conflict with case edges.'}
                    </p>
                  </div>
                )}

                {/* Failure Mode Warnings */}
                {(() => {
                  const warns = getFailureWarnings(glassModel, deviceModel, result, glassType);
                  return warns.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">⚠️ Risk Factors</p>
                      {warns.map((w, i) => (
                        <div key={i} className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                          <p className="text-xs text-red-300 leading-relaxed">{w}</p>
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}

                {/* Installation Tips */}
                {result.color_code !== 'RED' && (() => {
                  const tips = getInstallTips(deviceModel.notch_type, deviceModel.screen_type, glassType);
                  return (
                    <details className="mt-4 group">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-white transition-colors select-none">
                        📋 Installation Tips ({tips.length} steps) ▸
                      </summary>
                      <div className="mt-3 space-y-2 pl-2">
                        {tips.map((tip, i) => (
                          <div key={i} className="flex gap-2.5 items-start">
                            <span className="text-xs font-bold text-slate-500 shrink-0 mt-0.5">{i + 1}.</span>
                            <p className="text-xs text-slate-300 leading-relaxed">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })()}

                {/* Copy Result + New Check */}
                <div className="mt-6 flex justify-center gap-3">
                  <button onClick={copyResult} className="flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-semibold text-white border border-white/10 transition-all">
                    📋 Copy Result
                  </button>
                  <button onClick={() => { setResult(null); setGlassModel(null); setDeviceModel(null); setGlassQuery(''); setDeviceQuery(''); }} className="flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-semibold text-slate-400 hover:text-white border border-white/10 transition-all">
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
              <button onClick={() => { setHistory([]); localStorage.removeItem('glassCheckerHistory'); }} className="text-[10px] text-slate-600 hover:text-red-400 transition-colors">Clear</button>
            </div>
            <div className="space-y-2">
              {history.map((h, i) => {
                const colorMap = { GREEN: 'bg-green-500/20 text-green-300 border-green-500/30', TEAL: 'bg-teal-500/20 text-teal-300 border-teal-500/30', YELLOW: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', RED: 'bg-red-500/20 text-red-300 border-red-500/30' };
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/40 hover:bg-slate-900/60 transition-colors cursor-pointer group"
                    onClick={() => {
                      const g = phones.find(p => p.model === h.glass.model);
                      const d = phones.find(p => p.model === h.device.model);
                      if (g && d) { setGlassModel(g); setDeviceModel(d); setResult(null); }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        <span className="text-purple-300">{h.glass.model}</span>
                        <span className="text-slate-500 mx-1">→</span>
                        <span className="text-blue-300">{h.device.model}</span>
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">{h.ts}</div>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-1 rounded-full border shrink-0 ${colorMap[h.color] || 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                      {h.status.replace('COMPATIBLE', '✓ OK').replace('NOT COMPATIBLE', '✗ NO').replace('CAUTION: CHECK BEZELS', '⚠ CHECK').replace('PERFECT FIT', '★ PERFECT')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )
      }
    </div >

      {/* === FIXED FAB — Add/Edit Manual Model === */ }
  <button
    onClick={() => setShowManualForm(true)}
    title="Add or Edit a Phone Model"
    className="fixed bottom-6 right-5 z-40 flex items-center gap-2 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-bold rounded-full shadow-2xl shadow-purple-900/50 transition-all hover:scale-105 active:scale-95 py-3 px-4 border border-purple-400/30"
  >
    <span className="text-lg leading-none">✏️</span>
    <span className="text-sm hidden sm:inline">Add / Edit Model</span>
    <span className="text-sm sm:hidden">Edit</span>
  </button>

  {/* === SLIDE-UP MODAL DRAWER === */ }
  {
    showManualForm && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowManualForm(false)}
        />

        {/* Drawer */}
        <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[93dvh] overflow-y-auto rounded-t-3xl bg-slate-900 border-t border-white/10 shadow-2xl animate-slide-up">
          {/* Drag Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 sticky top-0 bg-slate-900 z-10">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-purple-500/20 rounded-xl text-purple-300">✏️</span>
              <div>
                <h3 className="text-base font-bold text-white">Add / Edit Model</h3>
                <p className="text-[11px] text-slate-400">Manual database entry</p>
              </div>
            </div>
            <button
              onClick={() => setShowManualForm(false)}
              className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleManualSubmit} className="p-5 space-y-4">

            {/* Load Existing */}
            <div className="relative">
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Load Existing Data to Edit</label>
              <input
                type="text"
                placeholder="🔍 Search model to edit..."
                className="w-full bg-slate-800 border border-purple-500/30 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-purple-500/50 outline-none placeholder-slate-500"
                value={editQuery}
                onChange={(e) => setEditQuery(e.target.value)}
              />
              {editQuery && (
                <div className="absolute w-full bg-slate-800 border border-slate-600 max-h-40 overflow-y-auto rounded-xl shadow-xl left-0 top-full mt-1 z-50">
                  {phones.filter(p => p.model.toLowerCase().includes(editQuery.toLowerCase())).slice(0, 10).map(p => (
                    <div
                      key={p.model}
                      className="p-3 text-sm text-slate-300 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0"
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
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Model + Brand */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Model Name *</label>
                <input required name="model" value={manualForm.model} onChange={handleManualChange} placeholder="e.g. My Phone Pro" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Brand *</label>
                <input required name="brand" value={manualForm.brand} onChange={handleManualChange} placeholder="e.g. Samsung" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
            </div>

            {/* Height + Width + Screen */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Height (mm) *</label>
                <input required type="number" step="0.01" name="height_mm" value={manualForm.height_mm} onChange={handleManualChange} placeholder="160.5" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Width (mm) *</label>
                <input required type="number" step="0.01" name="width_mm" value={manualForm.width_mm} onChange={handleManualChange} placeholder="75.2" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Screen (inch) *</label>
                <input required type="number" step="0.1" name="screen_size" value={manualForm.screen_size} onChange={handleManualChange} placeholder="6.7" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
            </div>

            {/* Resolution + Image */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Resolution</label>
                <input name="resolution" value={manualForm.resolution} onChange={handleManualChange} placeholder="1080 x 2400" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Image URL</label>
                <input name="image_url" value={manualForm.image_url} onChange={handleManualChange} placeholder="https://..." className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
              </div>
            </div>

            {/* 360 URL */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">360° View URL <span className="text-slate-600">(Optional)</span></label>
              <input name="view360_url" value={manualForm.view360_url || ''} onChange={handleManualChange} placeholder="https://... (YouTube/Sketchfab)" className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none" />
            </div>

            {/* Screen Type + Notch */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Screen Type</label>
                <select name="screen_type" value={manualForm.screen_type} onChange={handleManualChange} className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none">
                  <option value="Flat">Flat</option>
                  <option value="Curved">Curved</option>
                  <option value="2.5D">2.5D</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Notch Type</label>
                <select name="notch_type" value={manualForm.notch_type} onChange={handleManualChange} className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none">
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

            {/* Glass Thickness */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Glass Thickness <span className="text-slate-600">(select if known)</span></label>
              <select name="glass_thickness" value={manualForm.glass_thickness || ''} onChange={handleManualChange} className="w-full bg-slate-800 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:border-purple-500 outline-none">
                <option value="">Unknown</option>
                <option value="0.2">0.2mm — Ultra-thin</option>
                <option value="0.3">0.3mm — Standard</option>
                <option value="0.33">0.33mm — Most common</option>
                <option value="0.4">0.4mm — Thick (may block FPS)</option>
              </select>
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
        </div>
      </>
    )
  }

    </div >

  );
}

export default App;
