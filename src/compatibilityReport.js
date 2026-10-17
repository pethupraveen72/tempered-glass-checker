import { evaluateCompatibility, positiveNumber } from './compatibility.js';
import { glassMeasurementKey } from './glassMeasurements.js';

const normalize = value => String(value || '').trim().toLowerCase();

// A glass is only worth reporting on once its physical height and width are
// known: every check depends on them, and without them the result is always
// "needs verification".
const measured = source => positiveNumber(source.measurements?.height_mm) && positiveNumber(source.measurements?.width_mm);

// Measurements saved in this browser, keyed by the phone they were taken for.
export function sourcesFromMeasurements(phones, saved) {
  const byKey = new Map(phones.map(phone => [glassMeasurementKey(phone), phone]));
  return Object.entries(saved || {})
    .map(([key, measurements]) => ({ id: `measured:${key}`, origin: 'measured', glass: byKey.get(key), measurements }))
    .filter(source => source.glass && measured(source));
}

// Stock records. Each carries its own glass type, because a shop holds clear,
// full-cover and curved protectors side by side. The source phone supplies the
// screen shape and notch type the check compares against; when that model is
// not in the catalogue the comparison falls back to geometry alone, which
// reports "needs verification" rather than a confirmed fit.
export function sourcesFromStock(phones, items) {
  const byModel = new Map(phones.map(phone => [normalize(phone.model), phone]));
  return (items || []).map(item => {
    const catalogue = byModel.get(normalize(item.source_model));
    return {
      id: `stock:${item.sku}`,
      origin: 'stock',
      stock: item,
      type: item.glass_type,
      glass: catalogue || { model: item.source_model || item.sku, brand: item.source_brand || '' },
      inCatalogue: Boolean(catalogue),
      measurements: { height_mm: String(item.height_mm ?? ''), width_mm: String(item.width_mm ?? ''), thickness_mm: String(item.thickness_mm ?? '') },
    };
  }).filter(measured);
}

// Stock wins over a browser measurement for the same source model: it is the
// shared record, and listing both would report the same protector twice.
export function combineSources(stockSources, measuredSources) {
  const covered = new Set(stockSources.map(source => normalize(source.glass.model)).filter(Boolean));
  return [...stockSources, ...measuredSources.filter(source => !covered.has(normalize(source.glass.model)))];
}

export function describeSource(source) {
  if (source.origin !== 'stock') return { title: `${source.glass.brand} ${source.glass.model}`.trim(), subtitle: 'Measured in this browser' };
  const parts = [source.stock.label, `SKU ${source.stock.sku}`].filter(Boolean);
  return {
    title: parts.join(' · '),
    subtitle: [
      source.stock.source_model ? `For ${source.stock.source_model}` : 'No source model set',
      source.stock.glass_type,
      `${source.stock.quantity} in stock`,
      source.stock.shelf ? `Shelf ${source.stock.shelf}` : null,
    ].filter(Boolean).join(' · '),
  };
}

const buckets = { 'DIMENSIONS FIT': 'fits', 'NEEDS VERIFICATION': 'verify', 'NOT COMPATIBLE': 'rejected' };

// Evaluates every glass source against the whole catalogue. The same pass
// produces both directions of the report: one row per glass, and a reverse
// index from each phone to the glasses that cover it.
export function buildReport(phones, sources, type) {
  const glasses = [...(sources || [])].sort((a, b) => describeSource(a).title.localeCompare(describeSource(b).title));
  const byPhone = new Map();

  const rows = glasses.map(source => {
    // A stock item's own type wins; a browser measurement follows the mode the
    // report was opened in.
    const mode = source.type || type;
    const row = { ...source, mode, fits: [], verify: [], rejected: [] };
    for (const device of phones) {
      const result = evaluateCompatibility(source.glass, device, mode, source.measurements);
      const bucket = buckets[result.compatibility_status];
      if (!bucket) continue;
      const entry = {
        phone: device,
        status: result.compatibility_status,
        reason: result.reason_message,
        isSource: normalize(device.model) === normalize(source.glass.model),
      };
      row[bucket].push(entry);
      if (bucket !== 'rejected') {
        if (!byPhone.has(device.model)) byPhone.set(device.model, { phone: device, glasses: [] });
        byPhone.get(device.model).glasses.push({ source, mode, status: result.compatibility_status, reason: result.reason_message, isSource: entry.isSource });
      }
    }
    return row;
  });

  // A phone covered by a glass that passed the dimension check is listed before
  // one that only has glasses still needing a physical check.
  const phoneRows = [...byPhone.values()].sort((a, b) => {
    const rank = entry => entry.glasses.some(g => g.status === 'DIMENSIONS FIT') ? 0 : 1;
    return rank(a) - rank(b) || a.phone.model.localeCompare(b.phone.model);
  });

  return { type, rows, phoneRows, catalogueSize: phones.length, generated: new Date().toISOString() };
}

const csvCell = value => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function reportToCsv(report) {
  const lines = [['SKU', 'Glass', 'Source model', 'Glass H (mm)', 'Glass W (mm)', 'Mode', 'In stock', 'Result', 'Target model', 'Target brand', 'Note'].join(',')];
  for (const row of report.rows) {
    for (const entry of [...row.fits, ...row.verify]) {
      lines.push([
        row.stock?.sku, describeSource(row).title, row.glass.model,
        row.measurements.height_mm, row.measurements.width_mm, row.mode,
        row.stock ? row.stock.quantity : '',
        entry.status, entry.phone.model, entry.phone.brand,
        entry.isSource ? 'Source model' : '',
      ].map(csvCell).join(','));
    }
  }
  return lines.join('\n');
}
