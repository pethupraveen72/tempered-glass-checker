import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import FitVisual from './FitVisual';
import { evaluateCompatibility, formatMm } from '../compatibility';

const storageKey = 'dimensionMatchReports';
function loadRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(saved) ? saved.filter(record => record?.glass?.model && record?.measurements && typeof record.date === 'string' && Array.isArray(record.matches) && record.matches.every(phone => phone?.model)).slice(0, 10) : [];
  } catch { return []; }
}

export default function DimensionMatchReport({ glass, measurements, type, matches }) {
  const [records, setRecords] = useState(loadRecords);
  const [report, setReport] = useState(null);
  const [showRecords, setShowRecords] = useState(false);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const fitPanel = useRef(null);
  useEffect(() => {
    if (selected) fitPanel.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const close = useCallback(() => { setReport(null); setShowRecords(false); setSelected(null); setMessage(''); }, []);
  const openReport = snapshot => { setReport(snapshot); setSelected(null); setMessage(''); };
  const save = () => {
    const next = [report, ...records.filter(record => record.date !== report.date)].slice(0, 10);
    setRecords(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setMessage('Record saved on this browser. The 10 most recent reports are kept.');
    } catch { setMessage('Browser storage is unavailable or full. This record is available for this session only.'); }
  };
  const selectedResult = selected && report ? evaluateCompatibility(report.glass, selected, report.type, report.measurements) : null;

  return <>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" onClick={() => { setShowRecords(false); openReport({ glass: { ...glass }, measurements: { ...measurements }, type, matches: matches.map(phone => ({ ...phone })), date: new Date().toISOString() }); }} className="rounded-lg border border-purple-400/30 bg-purple-500/15 px-3 py-2 text-xs font-semibold text-purple-200 hover:bg-purple-500/25">View report</button>
      <button type="button" onClick={() => { setShowRecords(true); setReport(null); setMessage(''); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/10">Saved records ({records.length})</button>
    </div>
    {(report || showRecords) && <Modal title="Dimension Match Report" onClose={close} wide>
      <div className="space-y-5 p-4 sm:p-6">
        {showRecords && <div>
          <h3 className="font-semibold">Saved report records</h3>
          <p className="mt-1 text-xs text-slate-400">Snapshots keep the measurements and matching phone specifications from when the report was created. Stored on this browser.</p>
          {records.length ? <div className="mt-3 space-y-2">{records.map(record => <button key={record.date} type="button" onClick={() => openReport(record)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-sm hover:bg-white/10">
            <span><strong>{record.glass.model}</strong> · {record.type}<span className="mt-1 block text-xs text-slate-400">{new Date(record.date).toLocaleString()} · {record.matches.length} matches</span></span><span className="text-purple-200">View report →</span>
          </button>)}</div> : <p className="mt-4 text-sm text-slate-300">No saved records yet. Open a report and choose Save record.</p>}
        </div>}
        {report && <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="text-lg font-bold">{report.glass.brand} {report.glass.model}</h3><p className="mt-1 text-xs text-slate-400">{new Date(report.date).toLocaleString()} · {report.type} · {report.matches.length} dimension matches</p></div>
            <button type="button" onClick={save} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold hover:bg-purple-500">Save record</button>
          </div>
          <p className="text-sm text-slate-300">Measured glass (H × W): <strong className="text-white">{formatMm(Number(report.measurements.height_mm) || null)} × {formatMm(Number(report.measurements.width_mm) || null)}</strong> · Thickness: {formatMm(Number(report.measurements.thickness_mm) || null)}</p>
          {message && <p role="status" className="text-sm text-purple-200">{message}</p>}
          <p className="text-xs leading-relaxed text-slate-400">Matches use the current compatibility rules: measured glass must cover the display and stay inside the body, with matching screen shape and notch type. Clear glass also checks source and target display size tolerances. Full-cover and curved modes require physical verification and do not produce confirmed dimension matches in this list. All clearances below assume centred placement.</p>
          {report.matches.length ? <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label="Dimension match records; scroll horizontally for all columns">
            <table className="w-full whitespace-nowrap text-left text-xs">
              <caption className="sr-only">Matching phones and clearance per edge in millimetres</caption>
              <thead className="bg-white/5 text-slate-300"><tr>{['Target phone', 'Body H × W', 'Display H × W', 'Body clearance T/B · L/R', 'Glass beyond display T/B · L/R', 'Report'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/10">{report.matches.map((phone, index) => {
                const result = evaluateCompatibility(report.glass, phone, report.type, report.measurements);
                return <tr key={`${phone.brand}-${phone.model}-${index}`}>
                  <th scope="row" className="p-3 font-semibold">{phone.model}</th>
                  <td className="p-3">{formatMm(Number(phone.height_mm) || null)} × {formatMm(Number(phone.width_mm) || null)}</td>
                  <td className="p-3">{formatMm(Number(phone.display_height_mm) || null)} × {formatMm(Number(phone.display_width_mm) || null)}</td>
                  <td className="p-3">{formatMm(result.vertical_clearance)} · {formatMm(result.horizontal_clearance)}</td>
                  <td className="p-3">{formatMm(result.display_height_margin == null ? null : result.display_height_margin / 2)} · {formatMm(result.display_width_margin == null ? null : result.display_width_margin / 2)}</td>
                  <td className="p-3"><button type="button" aria-label={`View fit for ${phone.model}`} onClick={() => setSelected(phone)} className="rounded-lg border border-purple-400/30 px-3 py-2 text-purple-200 hover:bg-purple-500/20">View fit</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div> : <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-300">No dimension matches in this report. Check the physical glass measurements and compatibility mode.</p>}
          {selected && <div ref={fitPanel} className="space-y-3" role="region" aria-label={`Fit report for ${selected.model}`}><h3 className="font-semibold">{selected.model} · {selectedResult.compatibility_status}</h3><p className="text-sm text-slate-300">{selectedResult.reason_message}</p><FitVisual device={selected} result={selectedResult} /></div>}
        </>}
      </div>
    </Modal>}
  </>;
}
