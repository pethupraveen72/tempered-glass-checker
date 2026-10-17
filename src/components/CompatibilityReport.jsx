import { useMemo, useState } from 'react';
import Modal from './Modal';
import { buildReport, reportToCsv, describeSource } from '../compatibilityReport';
import { formatMm } from '../compatibility';

const statusStyle = {
  'DIMENSIONS FIT': 'bg-green-500/15 text-green-300 border-green-500/30',
  'NEEDS VERIFICATION': 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
};
const statusLabel = { 'DIMENSIONS FIT': 'Dimensions fit', 'NEEDS VERIFICATION': 'Verify physically' };

function StatusTag({ status }) {
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle[status] || 'border-slate-600 bg-slate-700 text-slate-300'}`}>
    {statusLabel[status] || status}
  </span>;
}

export default function CompatibilityReport({ phones, sources, type, onClose, onPick }) {
  const [view, setView] = useState('glass');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [message, setMessage] = useState('');

  // One pass over the catalogue per mode, reused by both views.
  const report = useMemo(() => buildReport(phones, sources, type), [phones, sources, type]);

  const needle = query.trim().toLowerCase();
  const matches = text => !needle || String(text || '').toLowerCase().includes(needle);

  const glassRows = report.rows.filter(row => matches(describeSource(row).title) || matches(row.glass.model) || matches(row.stock?.sku)
    || [...row.fits, ...row.verify].some(entry => matches(entry.phone.model)));
  const phoneRows = report.phoneRows.filter(row => matches(row.phone.model) || matches(row.phone.brand)
    || row.glasses.some(entry => matches(describeSource(entry.source).title) || matches(entry.source.glass.model)));

  const copyCsv = async () => {
    const csv = reportToCsv(report);
    try { await navigator.clipboard.writeText(csv); setMessage('Report copied as CSV. Paste it into a spreadsheet.'); }
    catch { setMessage('Clipboard unavailable. Use Download CSV instead.'); }
  };

  const downloadCsv = () => {
    try {
      const url = URL.createObjectURL(new Blob([reportToCsv(report)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `glass-compatibility-${type.replace(/\s+/g, '-').toLowerCase()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('CSV downloaded.');
    } catch { setMessage('Download unavailable in this browser.'); }
  };

  const pick = (glass, device) => { if (onPick) { onPick(glass, device); onClose(); } };

  return <Modal title="Compatibility report" onClose={onClose} wide>
    <div className="space-y-5 p-4 sm:p-6">
      <div>
        <p className="text-sm text-slate-300">
          Every glass you hold or have measured, checked against all {report.catalogueSize} catalogue models. No model-by-model selection needed.
          Stock items use their own recorded glass type; browser measurements follow the selected <strong className="text-white">{type}</strong> mode.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Stock items come from the shared database; other measurements come from this browser. A glass appears here once its height and width are known.
          <strong className="text-slate-300"> Dimensions fit</strong> means the size checks passed; it is not a manufacturer guarantee, and corner shape, cutouts, curved edges and case clearance still need a physical check.
          Full-cover and curved modes never report a confirmed fit by design.
        </p>
      </div>

      {report.rows.length === 0
        ? <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-slate-300">
          No glass measured yet. Record your protectors under Stock, or measure one under Select Glass, and it appears in this report automatically.
        </p>
        : <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-xl border border-white/5 bg-slate-900/50 p-1">
              {[['glass', 'By glass'], ['phone', 'By phone']].map(([key, label]) => (
                <button key={key} type="button" aria-pressed={view === key} onClick={() => { setView(key); setExpanded(null); }}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${view === key ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by glass or phone model…"
              aria-label="Filter the report" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900/50 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-purple-500/50" />
            <button type="button" onClick={copyCsv} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">Copy CSV</button>
            <button type="button" onClick={downloadCsv} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">Download CSV</button>
          </div>

          {message && <p role="status" className="text-sm text-purple-200">{message}</p>}

          {view === 'glass' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">{glassRows.length} of {report.rows.length} measured glasses shown.</p>
              {glassRows.map(row => {
                const open = expanded === row.id;
                const described = describeSource(row);
                return <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.03]">
                  <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : row.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-white/5">
                    <span className="min-w-0">
                      <span className="block font-semibold text-white">
                        {described.title}
                        {row.origin === 'stock' && <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">stock</span>}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {described.subtitle} · measured {formatMm(Number(row.measurements.height_mm))} × {formatMm(Number(row.measurements.width_mm))} · {row.mode}
                      </span>
                      {row.origin === 'stock' && !row.inCatalogue && <span className="mt-1 block text-xs text-amber-300">
                        Its sold-for model is not in the catalogue, so screen shape and notch type cannot be compared.
                      </span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      <span className="rounded-full border border-green-500/30 bg-green-500/15 px-2 py-0.5 font-semibold text-green-300">{row.fits.length} fit</span>
                      <span className="rounded-full border border-yellow-500/30 bg-yellow-500/15 px-2 py-0.5 font-semibold text-yellow-300">{row.verify.length} verify</span>
                      <span className="text-slate-500">{open ? '▲' : '▼'}</span>
                    </span>
                  </button>
                  {open && <div className="border-t border-white/10 p-4">
                    {[['Dimensions fit', row.fits], ['Needs physical verification', row.verify]].map(([heading, entries]) => (
                      <div key={heading} className="mb-4 last:mb-0">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{heading} ({entries.length})</h4>
                        {entries.length ? <div className="flex flex-wrap gap-2">
                          {entries.filter(entry => matches(entry.phone.model) || !needle).map(entry => (
                            <button key={entry.phone.model} type="button" onClick={() => pick(row, entry.phone)}
                              title={entry.reason}
                              className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5 text-[11px] text-slate-200 hover:bg-purple-600/20">
                              {entry.phone.model}
                              {entry.isSource && <span className="text-[9px] text-purple-300">source</span>}
                            </button>
                          ))}
                        </div> : <p className="text-xs text-slate-500">None.</p>}
                      </div>
                    ))}
                    <p className="text-xs text-slate-500">Click a model to load it as the target device for a full check.</p>
                  </div>}
                </div>;
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">{phoneRows.length} catalogue models are covered by at least one measured glass.</p>
              <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label="Phones and the measured glasses that cover them; scroll horizontally for all columns">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Each catalogue phone and the measured glasses that cover it</caption>
                  <thead className="bg-white/5 text-slate-300"><tr>
                    {['Phone', 'Body H × W', 'Glasses that cover it'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-white/10">{phoneRows.map(row => (
                    <tr key={row.phone.model}>
                      <th scope="row" className="p-3 font-semibold text-white">{row.phone.model}</th>
                      <td className="whitespace-nowrap p-3 text-slate-300">
                        {formatMm(Number(row.phone.height_mm) || null)} × {formatMm(Number(row.phone.width_mm) || null)}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {row.glasses.map(entry => (
                            <button key={entry.source.id} type="button" onClick={() => pick(entry.source, row.phone)} title={entry.reason}
                              className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5 text-[11px] text-slate-200 hover:bg-purple-600/20">
                              <span className="min-w-0">
                                {describeSource(entry.source).title}
                                {entry.source.origin === 'stock' && <span className="ml-1.5 text-[9px] text-emerald-300">{entry.source.stock.quantity} in stock</span>}
                              </span>
                              <StatusTag status={entry.status} />
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </>}
    </div>
  </Modal>;
}
