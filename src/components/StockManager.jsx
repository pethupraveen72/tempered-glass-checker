import { useEffect, useState } from 'react';
import Modal from './Modal';
import { loadStock, saveStock, deleteStock, emptyStockRow, validateRows, parsePastedRows } from '../stockClient';
import { formatMm } from '../compatibility';

const columns = [
  ['sku', 'SKU / box label *', 'A-12'],
  ['source_model', 'Sold for model', 'Realme 12 5G'],
  ['height_mm', 'Height mm *', '158.00'],
  ['width_mm', 'Width mm *', '72.00'],
  ['thickness_mm', 'Thick mm', '0.33'],
  ['quantity', 'Qty', '10'],
  ['shelf', 'Shelf', 'B2'],
];

export default function StockManager({ phones, adminToken, onClose, onChanged }) {
  const [items, setItems] = useState([]);
  const [state, setState] = useState('loading');
  const [setupRequired, setSetupRequired] = useState(false);
  const [rows, setRows] = useState([emptyStockRow()]);
  const [problems, setProblems] = useState([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const refresh = async () => {
    try {
      const { items: loaded, setupRequired: needsSetup } = await loadStock();
      setItems(loaded);
      setSetupRequired(needsSetup);
      setState('ready');
    } catch (error) { setMessage(error.message); setState('error'); }
  };

  useEffect(() => { refresh(); }, []);

  const updateRow = (index, field, value) => setRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  const addRow = () => setRows(prev => [...prev, emptyStockRow()]);
  const removeRow = index => setRows(prev => prev.length === 1 ? [emptyStockRow()] : prev.filter((_, i) => i !== index));

  // A row is only submitted once it carries something; blank spare rows at the
  // bottom of a bulk entry are ignored rather than reported as errors.
  const filled = rows.filter(row => Object.entries(row).some(([field, value]) => field !== 'glass_type' && String(value).trim() !== ''));

  const save = async () => {
    const found = validateRows(filled);
    setProblems(found);
    setMessage('');
    if (!filled.length) { setProblems(['Add at least one row before saving.']); return; }
    if (found.length) return;
    setSaving(true);
    try {
      // Brands are filled in from the catalogue so a stock record can be
      // matched to its source phone later.
      const withBrands = filled.map(row => {
        const match = phones.find(phone => phone.model.trim().toLowerCase() === String(row.source_model).trim().toLowerCase());
        return { ...row, source_brand: match?.brand || row.source_brand || null };
      });
      const result = await saveStock(withBrands, adminToken);
      setMessage(`Saved ${result.saved} stock item${result.saved === 1 ? '' : 's'}.`);
      setRows([emptyStockRow()]);
      await refresh();
      if (onChanged) onChanged();
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  const remove = async sku => {
    setMessage('');
    try {
      await deleteStock(sku, adminToken);
      setMessage(`Removed ${sku}.`);
      await refresh();
      if (onChanged) onChanged();
    } catch (error) { setMessage(error.message); }
  };

  const applyPaste = () => {
    const parsed = parsePastedRows(pasteText);
    if (!parsed.length) { setMessage('Nothing recognisable to import.'); return; }
    setRows(parsed);
    setPasteOpen(false);
    setPasteText('');
    setProblems(validateRows(parsed));
    setMessage(`${parsed.length} row${parsed.length === 1 ? '' : 's'} loaded. Check them, then save.`);
  };

  return <Modal title="Glass stock" onClose={onClose} wide>
    <div className="space-y-5 p-4 sm:p-6">
      <p className="text-sm text-slate-300">
        The protectors you actually hold, stored in the database so every device and staff member sees the same list.
        Measure each one once here and it feeds the compatibility report automatically.
      </p>

      {setupRequired && <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p className="font-semibold">One-time setup needed</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-200/90">
          Run <code className="rounded bg-black/30 px-1.5 py-0.5">migrations/001_glass_stock.sql</code> in the Supabase SQL editor to create the <code>glass_stock</code> table.
          Until then stock cannot be saved, and the report falls back to measurements stored in this browser.
        </p>
      </div>}

      {!adminToken && <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-xs text-amber-100">
        Saving needs the admin token. Enter it once under Add / Edit Model and it is remembered on this browser.
      </p>}

      {message && <p role="status" className="text-sm text-purple-200">{message}</p>}

      <section>
        <h3 className="font-semibold text-white">Add or update stock</h3>
        <p className="mt-1 text-xs text-slate-400">
          One row per protector. An existing SKU is updated rather than duplicated. Measure edge to edge in portrait orientation, in millimetres.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={addRow} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">+ Add row</button>
          <button type="button" onClick={() => setPasteOpen(open => !open)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">
            {pasteOpen ? 'Cancel paste' : 'Paste from spreadsheet'}
          </button>
          <button type="button" onClick={() => setRows([emptyStockRow()])} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/10">Clear rows</button>
        </div>

        {pasteOpen && <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/50 p-3">
          <label className="block text-xs text-slate-300">One protector per line, columns separated by tabs or commas:
            <span className="mt-1 block font-mono text-[10px] text-slate-500">SKU, sold-for model, type, height, width, thickness, quantity</span>
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={5}
              placeholder={'A-12, Realme 12 5G, A, 158.0, 72.0, 0.33, 10\nA-13, Oppo Reno 15c, C, 160.2, 73.4, 0.30, 4'}
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-800 p-2.5 font-mono text-xs text-white outline-none focus:border-purple-500" />
          </label>
          <button type="button" onClick={applyPaste} className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold hover:bg-purple-500">Load rows</button>
        </div>}

        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label="Bulk stock entry; scroll horizontally for all columns">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Enter several protectors at once</caption>
            <thead className="bg-white/5 text-slate-300"><tr>
              {['#', ...columns.map(([, label]) => label), 'Type', ''].map(label => <th key={label} scope="col" className="whitespace-nowrap p-2">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/10">{rows.map((row, index) => (
              <tr key={index}>
                <td className="p-2 text-slate-500">{index + 1}</td>
                {columns.map(([field, label, placeholder]) => (
                  <td key={field} className="p-2">
                    <input aria-label={`${label} for row ${index + 1}`} value={row[field]} placeholder={placeholder}
                      list={field === 'source_model' ? 'stock-phone-models' : undefined}
                      inputMode={field.endsWith('_mm') || field === 'quantity' ? 'decimal' : undefined}
                      onChange={e => updateRow(index, field, e.target.value)}
                      className="w-full min-w-[7rem] rounded-lg border border-white/10 bg-slate-800 p-2 text-white outline-none focus:border-purple-500" />
                  </td>
                ))}
                <td className="p-2">
                  <select aria-label={`Glass type for row ${index + 1}`} value={row.glass_type} onChange={e => updateRow(index, 'glass_type', e.target.value)}
                    className="rounded-lg border border-white/10 bg-slate-800 p-2 text-white outline-none focus:border-purple-500">
                    <option value="Type A">A (clear)</option>
                    <option value="Type B">B (full)</option>
                    <option value="Type C">C (curved)</option>
                  </select>
                </td>
                <td className="p-2">
                  <button type="button" aria-label={`Remove row ${index + 1}`} onClick={() => removeRow(index)} className="px-2 py-1 text-slate-400 hover:text-red-300">✕</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <datalist id="stock-phone-models">{phones.map(phone => <option key={phone.model} value={phone.model} />)}</datalist>

        {problems.length > 0 && <ul className="mt-3 space-y-1 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
          {problems.map(problem => <li key={problem}>{problem}</li>)}
        </ul>}

        <button type="button" onClick={save} disabled={saving || !adminToken}
          className="mt-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-green-900/20 hover:from-green-400 hover:to-emerald-500 disabled:opacity-50">
          {saving ? 'Saving…' : `Save ${filled.length || ''} item${filled.length === 1 ? '' : 's'}`.replace('  ', ' ')}
        </button>
      </section>

      <section>
        <h3 className="font-semibold text-white">Current stock ({items.length})</h3>
        {state === 'loading' ? <p className="mt-2 text-sm text-slate-400">Loading stock…</p>
          : items.length === 0 ? <p className="mt-2 rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-300">No stock recorded yet.</p>
            : <div className="mt-3 overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label="Current stock; scroll horizontally for all columns">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Stock currently recorded in the database</caption>
                <thead className="bg-white/5 text-slate-300"><tr>
                  {['SKU', 'Sold for', 'Type', 'Measured H × W', 'Thickness', 'Qty', 'Shelf', ''].map(label => <th key={label} scope="col" className="whitespace-nowrap p-3">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-white/10">{items.map(item => (
                  <tr key={item.sku}>
                    <th scope="row" className="p-3 font-semibold text-white">{item.sku}{item.label ? <span className="block text-[10px] font-normal text-slate-400">{item.label}</span> : null}</th>
                    <td className="p-3 text-slate-300">{item.source_model || <span className="text-amber-300">not set</span>}</td>
                    <td className="whitespace-nowrap p-3 text-slate-300">{item.glass_type}</td>
                    <td className="whitespace-nowrap p-3 text-slate-300">{formatMm(Number(item.height_mm))} × {formatMm(Number(item.width_mm))}</td>
                    <td className="whitespace-nowrap p-3 text-slate-300">{item.thickness_mm ? formatMm(Number(item.thickness_mm)) : '—'}</td>
                    <td className="p-3 text-slate-300">{item.quantity}</td>
                    <td className="p-3 text-slate-300">{item.shelf || '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setRows([{ ...emptyStockRow(), ...item, height_mm: String(item.height_mm ?? ''), width_mm: String(item.width_mm ?? ''), thickness_mm: String(item.thickness_mm ?? ''), quantity: String(item.quantity ?? '') }])}
                          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-200 hover:bg-white/10">Edit</button>
                        <button type="button" disabled={!adminToken} onClick={() => remove(item.sku)}
                          className="rounded-lg border border-red-400/20 px-2.5 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-40">Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
      </section>
    </div>
  </Modal>;
}
