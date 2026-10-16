export const emptyMeasurements = () => ({ height_mm: '', width_mm: '', thickness_mm: '' });

export function positiveNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export const formatMm = value => value == null || !Number.isFinite(value) ? 'Unknown' : `${value.toFixed(2)} mm`;
export function formatDifference(value, unit = 'mm') {
  if (value == null || !Number.isFinite(value)) return 'Unknown';
  const rounded = Number(value.toFixed(2));
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded).toFixed(2)} ${unit}`;
}
const difference = (a, b) => a == null || b == null ? null : Math.round((a - b) * 100) / 100;
const normalize = value => String(value || '').trim().toLowerCase();

export function evaluateCompatibility(glass, device, type, measurements = {}) {
  const physical = Object.fromEntries(['height_mm', 'width_mm', 'thickness_mm'].map(key => [key, positiveNumber(measurements[key])]));
  const bodyH = positiveNumber(device?.height_mm);
  const bodyW = positiveNumber(device?.width_mm);
  const displayH = positiveNumber(device?.display_height_mm);
  const displayW = positiveNumber(device?.display_width_mm);
  const hDiff = difference(physical.height_mm, bodyH);
  const wDiff = difference(physical.width_mm, bodyW);
  const base = {
    physical, hDiff, wDiff,
    height_difference: formatDifference(hDiff), width_difference: formatDifference(wDiff),
    vertical_clearance: hDiff == null ? null : -hDiff / 2,
    horizontal_clearance: wDiff == null ? null : -wDiff / 2,
    display_height_margin: difference(physical.height_mm, displayH),
    display_width_margin: difference(physical.width_mm, displayW),
  };
  const finish = (status, color, reason) => ({
    ...base, compatibility_status: status, color_code: color,
    isCompatible: color === 'GREEN',
    colorClass: { GREEN: 'bg-green-600', YELLOW: 'bg-yellow-500', RED: 'bg-red-500' }[color],
    reason_message: reason,
  });
  const reject = reason => finish('NOT COMPATIBLE', 'RED', reason);
  const verify = reason => finish('NEEDS VERIFICATION', 'YELLOW', reason);
  if (!glass || !device) return verify('Select the glass source model and target device.');
  for (const [key, label] of [['height_mm', 'height'], ['width_mm', 'width'], ['thickness_mm', 'thickness']]) {
    if (measurements[key] != null && String(measurements[key]).trim() !== '' && physical[key] == null) {
      return verify(`Glass ${label} must be a positive, finite number in millimetres.`);
    }
  }
  if (!['Type A', 'Type B', 'Type C'].includes(type)) return verify('Select a supported glass type.');
  const exactModel = normalize(glass.model) && normalize(glass.brand) && normalize(glass.model) === normalize(device.model) && normalize(glass.brand) === normalize(device.brand);
  if (type === 'Type C' && !exactModel) return reject('Curved glass requires the same brand and exact model because curve profiles differ.');
  for (const [key, label] of [['screen_type', 'Screen shape'], ['notch_type', 'Camera / notch type']]) {
    if (normalize(glass[key]) && normalize(device[key]) && normalize(glass[key]) !== normalize(device[key])) return reject(`${label} does not match.`);
  }
  if ((bodyH && physical.height_mm > bodyH) || (bodyW && physical.width_mm > bodyW)) return reject('The measured glass extends beyond the target phone body.');
  if ((displayH && physical.height_mm && physical.height_mm < displayH) || (displayW && physical.width_mm && physical.width_mm < displayW)) {
    return reject('The measured glass is smaller than the listed display and cannot cover its full rectangular area.');
  }
  if (!physical.height_mm || !physical.width_mm) return verify('Enter the physical glass height and width to assess its size. Phone body dimensions are not glass measurements.');
  if (!bodyH || !bodyW || !displayH || !displayW) return verify('Target body or display measurements are missing. Full coverage and overhang cannot both be checked.');
  if (displayH > bodyH || displayW > bodyW) return verify('Target display measurements exceed its body dimensions. Correct the phone data before checking fit.');
  if (!normalize(glass.screen_type) || !normalize(device.screen_type) || !normalize(glass.notch_type) || !normalize(device.notch_type)) return verify('Screen shape or camera / notch data is missing.');
  if (type === 'Type A') {
    for (const [key, limit] of [['screen_size', 0.8], ['display_height_mm', 0.9], ['display_width_mm', 0.9]]) {
      const a = positiveNumber(glass[key]);
      const b = positiveNumber(device[key]);
      if (!a || !b) return verify('Source and target screen measurements are required for the clear-glass comparison.');
      if (Math.abs(difference(a, b)) > limit) return reject('Source and target display sizes exceed the clear-glass comparison tolerance.');
    }
    if (normalize(device.screen_type) !== 'flat') return verify('Dimensions pass, but the curved edge profile needs a physical fit check.');
    return finish('DIMENSIONS FIT', 'GREEN', 'The measured glass fits within the phone body and covers the listed display area. Confirm corner shape, camera position and case clearance before fitting. Display dimensions may be calculated estimates.');
  }
  return verify(type === 'Type B'
    ? 'Outer dimensions pass. Verify the transparent opening, black borders, camera cutout and case clearance physically.'
    : 'Exact model and outer dimensions pass. Verify the curved profile and adhesive fit physically.');
}
