import { useId } from 'react';
import { positiveNumber, formatMm } from '../compatibility';

const colors = { body: '#cbd5e1', display: '#38bdf8', glass: '#c084fc', overhang: '#f87171', uncovered: '#fb923c' };

export default function FitVisual({ device, result }) {
  const id = useId().replace(/:/g, '');
  const body = { h: positiveNumber(device.height_mm), w: positiveNumber(device.width_mm) };
  const display = { h: positiveNumber(device.display_height_mm), w: positiveNumber(device.display_width_mm) };
  const glass = { h: result.physical.height_mm, w: result.physical.width_mm };
  const complete = size => Boolean(size.h && size.w);
  const layers = [body, display, glass].filter(complete);
  const scale = layers.length ? Math.min(230 / Math.max(...layers.map(s => s.w)), 310 / Math.max(...layers.map(s => s.h))) : 1;
  const rect = size => ({ x: 180 - size.w * scale / 2, y: 190 - size.h * scale / 2, width: size.w * scale, height: size.h * scale });
  const checks = [
    { label: 'Top / bottom · phone body', value: result.vertical_clearance, negative: 'overhang per edge', positive: 'clearance per edge' },
    { label: 'Left / right · phone body', value: result.horizontal_clearance, negative: 'overhang per edge', positive: 'clearance per edge' },
    { label: 'Top / bottom · display', value: result.display_height_margin == null ? null : result.display_height_margin / 2, negative: 'uncovered per edge', positive: 'glass beyond display per edge', display: true },
    { label: 'Left / right · display', value: result.display_width_margin == null ? null : result.display_width_margin / 2, negative: 'uncovered per edge', positive: 'glass beyond display per edge', display: true },
  ];
  const dimensionsPass = checks.every(check => check.value != null && check.value >= 0);
  const invalidDisplay = complete(body) && complete(display) && (display.h > body.h || display.w > body.w);

  return <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/50 p-4 sm:p-5" aria-label="Visual glass fit comparison">
    <h3 className="font-semibold text-white">See how the glass fits</h3>
    <p className="mt-1 text-xs leading-relaxed text-slate-400">Centred rectangular comparison. All outlines use the same scale; small gaps may be hard to see.</p>
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-200">
      {[['Phone body', colors.body], ['Display', colors.display], ['Measured glass', colors.glass], ['Overhang', colors.overhang], ['Uncovered display', colors.uncovered]].map(([label, color]) => <span key={label} className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{label}</span>)}
    </div>
    <div className="mt-4 grid items-center gap-5 md:grid-cols-2">
      <div className="min-w-0 rounded-xl border border-white/5 bg-slate-900/60 p-2">
        {layers.length ? <svg viewBox="0 0 360 390" className="mx-auto w-full max-w-[360px]" role="img" aria-label={`Centred overlay. Phone body ${formatMm(body.h)} by ${formatMm(body.w)}. Display ${formatMm(display.h)} by ${formatMm(display.w)}. Glass ${formatMm(glass.h)} by ${formatMm(glass.w)}. Red shows glass outside the body; orange shows display outside the glass.`}>
          <defs>
            {complete(body) && <mask id={`${id}-outside-body`} maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="390"><rect width="360" height="390" fill="white" /><rect {...rect(body)} fill="black" /></mask>}
            {complete(glass) && <mask id={`${id}-outside-glass`} maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="390"><rect width="360" height="390" fill="white" /><rect {...rect(glass)} fill="black" /></mask>}
          </defs>
          {complete(body) && <rect {...rect(body)} fill="#cbd5e108" />}
          {complete(display) && <rect {...rect(display)} fill="#38bdf81a" />}
          {complete(glass) && <rect {...rect(glass)} fill="#c084fc20" />}
          {complete(body) && complete(glass) && <rect {...rect(glass)} fill={colors.overhang} fillOpacity="0.85" mask={`url(#${id}-outside-body)`} />}
          {complete(display) && complete(glass) && <rect {...rect(display)} fill={colors.uncovered} fillOpacity="0.9" mask={`url(#${id}-outside-glass)`} />}
          {[[body, colors.body, undefined], [display, colors.display, '5 3'], [glass, colors.glass, '2 2']].map(([size, color, dash], index) => complete(size) && <rect key={index} {...rect(size)} fill="none" stroke={color} strokeWidth="1.7" strokeDasharray={dash} />)}
          <path d="M174 190h12 M180 184v12" stroke="#94a3b8" strokeWidth="1" />
          <text x="180" y="375" textAnchor="middle" fill="#94a3b8" fontSize="11">Front view · centred placement</text>
        </svg> : <p className="px-4 py-16 text-center text-sm text-slate-400">Enter glass measurements to draw the comparison.</p>}
        <div className="space-y-1 px-3 pb-3 text-xs text-slate-300">
          {[[body, 'Phone body', colors.body], [display, 'Display', colors.display], [glass, 'Glass', colors.glass]].map(([size, label, color]) => <p key={label}><span style={{ color }}>{label}</span>: {formatMm(size.h)} × {formatMm(size.w)} <span className="text-slate-500">(H × W)</span></p>)}
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        {checks.map(check => <div key={check.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs text-slate-400">{check.label}</p>
          <p className={`mt-1 text-sm font-semibold ${check.value == null ? 'text-slate-300' : check.value < 0 ? check.display ? 'text-orange-300' : 'text-red-300' : 'text-green-300'}`}>
            {check.value == null ? 'Unknown — measurement missing' : `${formatMm(Math.abs(check.value))} ${check.value < 0 ? check.negative : check.positive}`}
          </p>
        </div>)}
        <p className="text-xs leading-relaxed text-slate-300">{invalidDisplay ? 'Phone data needs correction: the listed display exceeds the body.' : dimensionsPass ? 'Size checks pass: the glass covers the display and stays inside the body.' : checks.some(check => check.value != null && check.value < 0) ? 'Size checks fail: the glass overhangs the body or leaves part of the display uncovered.' : 'More measurements are needed to check overhang and display coverage.'} The overall result above also considers screen shape, notch type and compatibility mode.</p>
      </div>
    </div>
    <p className="mt-4 text-xs leading-relaxed text-slate-400">Outlines show size only. Display dimensions may be estimates. Actual corners, display position, camera openings, curved edges, black borders and case clearance need a physical check. Missing outlines are omitted.</p>
  </section>;
}
