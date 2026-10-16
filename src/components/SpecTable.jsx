import { positiveNumber, formatMm } from '../compatibility';

export default function SpecTable({ glass, device }) {
  const numeric = (key, unit = 'mm') => {
    const a = positiveNumber(glass[key]);
    const b = positiveNumber(device[key]);
    const format = value => value == null ? 'Unknown' : unit === 'mm' ? formatMm(value) : `${value.toFixed(2)} in`;
    return [format(a), format(b), format(a && b ? a - b : null)];
  };
  const text = key => [glass[key] || 'Unknown', device[key] || 'Unknown', !glass[key] || !device[key] ? 'Unknown' : glass[key].trim().toLowerCase() === device[key].trim().toLowerCase() ? 'Match' : 'Mismatch'];
  const rows = [
    ['Body height', ...numeric('height_mm')], ['Body width', ...numeric('width_mm')],
    ['Display height', ...numeric('display_height_mm')], ['Display width', ...numeric('display_width_mm')],
    ['Screen diagonal', ...numeric('screen_size', 'in')], ['Screen shape', ...text('screen_type')], ['Camera / notch', ...text('notch_type')],
  ];
  return <div className="min-w-0">
    <h3 className="font-semibold text-white">Phone specifications</h3>
    <p className="mt-1 mb-4 text-xs text-slate-400">Reference phone data. Physical protector measurements appear above.</p>
    <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label="Phone specification comparison; scroll horizontally for all columns">
      <table className="w-full text-left text-xs sm:text-sm">
        <caption className="sr-only">Source phone and target device specifications. Differences are source minus target.</caption>
        <thead className="bg-white/5 text-slate-300"><tr>
          {['Specification', 'Source phone', 'Target device', 'Difference'].map(label => <th key={label} scope="col" className="px-3 py-3 sm:px-4 whitespace-nowrap">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-white/5 text-slate-300">{rows.map(([label, ...values]) => <tr key={label}>
          <th scope="row" className="px-3 py-3 sm:px-4 font-medium text-white whitespace-nowrap">{label}</th>
          {values.map((value, index) => <td key={index} className={`px-3 py-3 sm:px-4 whitespace-nowrap ${value === 'Mismatch' ? 'text-red-300' : value === 'Match' ? 'text-green-300' : ''}`}>{value}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
