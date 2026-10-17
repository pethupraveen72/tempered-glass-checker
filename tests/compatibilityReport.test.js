import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, sourcesFromMeasurements, sourcesFromStock, combineSources, describeSource, reportToCsv } from '../src/compatibilityReport.js';
import { glassMeasurementKey } from '../src/glassMeasurements.js';

const phone = (model, overrides = {}) => ({
  model, brand: 'Testco', screen_size: 6.7, height_mm: 162, width_mm: 75,
  display_height_mm: 150, display_width_mm: 69, screen_type: 'Flat', notch_type: 'Punch Hole', ...overrides,
});

// Source, a near-identical sibling, an oversized body and a shape mismatch.
const catalogue = [
  phone('Alpha One'),
  phone('Alpha Twin'),
  phone('Beta Big', { height_mm: 150, width_mm: 68, display_height_mm: 140, display_width_mm: 64, screen_size: 6.1 }),
  phone('Gamma Curved', { screen_type: 'Curved' }),
];
const saved = { [glassMeasurementKey(catalogue[0])]: { height_mm: '158.00', width_mm: '72.00', thickness_mm: '0.33' } };
const measuredSources = () => sourcesFromMeasurements(catalogue, saved);

const stockItem = (overrides = {}) => ({
  sku: 'A-12', label: 'Clear 2.5D', source_model: 'Alpha One', source_brand: 'Testco',
  glass_type: 'Type A', height_mm: 158, width_mm: 72, thickness_mm: 0.33, quantity: 10, shelf: 'B2', ...overrides,
});

test('only glasses with a known height and width enter the report', () => {
  assert.equal(measuredSources().length, 1);
  for (const incomplete of [
    { [glassMeasurementKey(catalogue[0])]: { height_mm: '158', width_mm: '' } },
    { [glassMeasurementKey(catalogue[0])]: { height_mm: 'abc', width_mm: '72' } },
    {}, null,
  ]) {
    assert.deepEqual(sourcesFromMeasurements(catalogue, incomplete), []);
  }
  // A saved measurement whose phone is no longer in the catalogue is skipped.
  assert.deepEqual(sourcesFromMeasurements([], saved), []);
  // So is a stock item with no usable measurement.
  assert.deepEqual(sourcesFromStock(catalogue, [stockItem({ width_mm: 0 })]), []);
});

test('the report covers the whole catalogue without manual selection', () => {
  const report = buildReport(catalogue, measuredSources(), 'Type A');
  assert.equal(report.rows.length, 1);
  const row = report.rows[0];
  assert.equal(row.fits.length + row.verify.length + row.rejected.length, catalogue.length);

  const fits = row.fits.map(entry => entry.phone.model);
  assert.ok(fits.includes('Alpha One'), 'the source model should fit its own glass');
  assert.ok(fits.includes('Alpha Twin'), 'an identical sibling should fit');
  assert.ok(row.fits.find(entry => entry.phone.model === 'Alpha One').isSource);

  const rejected = row.rejected.map(entry => entry.phone.model);
  assert.ok(rejected.includes('Beta Big'), 'glass larger than the body must be rejected');
  assert.ok(rejected.includes('Gamma Curved'), 'a shape mismatch must be rejected');
});

test('full cover and curved modes never report a confirmed fit', () => {
  for (const type of ['Type B', 'Type C']) {
    const report = buildReport(catalogue, measuredSources(), type);
    assert.equal(report.rows[0].fits.length, 0, `${type} must not claim a dimension fit`);
  }
  // Curved glass additionally requires the exact model, so only the source survives.
  const curved = buildReport(catalogue, measuredSources(), 'Type C').rows[0];
  assert.deepEqual(curved.verify.map(entry => entry.phone.model), ['Alpha One']);
});

test('the reverse index answers which glasses cover a given phone', () => {
  const report = buildReport(catalogue, measuredSources(), 'Type A');
  const covered = report.phoneRows.map(row => row.phone.model);
  assert.deepEqual(covered.sort(), ['Alpha One', 'Alpha Twin']);
  assert.deepEqual(report.phoneRows.find(row => row.phone.model === 'Alpha Twin').glasses.map(g => g.source.glass.model), ['Alpha One']);
  // Rejected pairs stay out of the reverse index entirely.
  assert.ok(!covered.includes('Beta Big'));
});

test('a stock item carries its own glass type regardless of the report mode', () => {
  const sources = sourcesFromStock(catalogue, [stockItem(), stockItem({ sku: 'C-01', glass_type: 'Type C' })]);
  // Opened in Type B, each stock row is still evaluated as its own type.
  const report = buildReport(catalogue, sources, 'Type B');
  const clear = report.rows.find(row => row.stock.sku === 'A-12');
  const curved = report.rows.find(row => row.stock.sku === 'C-01');
  assert.equal(clear.mode, 'Type A');
  assert.equal(curved.mode, 'Type C');
  assert.ok(clear.fits.length > 0, 'the clear stock item should still report dimension fits');
  assert.equal(curved.fits.length, 0, 'curved glass never reports a confirmed fit');
});

test('stock resolves its source phone, and an unknown model degrades to geometry only', () => {
  const [known] = sourcesFromStock(catalogue, [stockItem()]);
  assert.equal(known.inCatalogue, true);
  assert.equal(known.glass.screen_type, 'Flat');

  const [unknown] = sourcesFromStock(catalogue, [stockItem({ sku: 'X-9', source_model: 'Not In Catalogue' })]);
  assert.equal(unknown.inCatalogue, false);
  // Without a known screen shape no confirmed fit is possible, by design.
  const report = buildReport(catalogue, [unknown], 'Type A');
  assert.equal(report.rows[0].fits.length, 0);
  assert.ok(report.rows[0].verify.length > 0);
});

test('stock replaces a browser measurement for the same model', () => {
  const combined = combineSources(sourcesFromStock(catalogue, [stockItem()]), measuredSources());
  assert.equal(combined.length, 1, 'the same protector must not be listed twice');
  assert.equal(combined[0].origin, 'stock');

  // A measurement for a different model is kept alongside stock.
  const otherSaved = { [glassMeasurementKey(catalogue[1])]: { height_mm: '158', width_mm: '72' } };
  const both = combineSources(sourcesFromStock(catalogue, [stockItem()]), sourcesFromMeasurements(catalogue, otherSaved));
  assert.equal(both.length, 2);
});

test('a stock item is described by its SKU, source model and quantity', () => {
  const [source] = sourcesFromStock(catalogue, [stockItem()]);
  const described = describeSource(source);
  assert.match(described.title, /A-12/);
  assert.match(described.subtitle, /Alpha One/);
  assert.match(described.subtitle, /10 in stock/);
  assert.match(described.subtitle, /Shelf B2/);
  // A browser measurement says so plainly instead.
  assert.match(describeSource(measuredSources()[0]).subtitle, /this browser/);
});

test('an empty source list produces an empty report rather than an error', () => {
  for (const sources of [[], null, undefined]) {
    const report = buildReport(catalogue, sources, 'Type A');
    assert.deepEqual(report.rows, []);
    assert.deepEqual(report.phoneRows, []);
    assert.equal(report.catalogueSize, catalogue.length);
  }
});

test('CSV export quotes separators and lists one row per compatible pair', () => {
  const quoted = [phone('Comma, Model'), phone('Plain Model')];
  const key = glassMeasurementKey(quoted[0]);
  const csv = reportToCsv(buildReport(quoted, sourcesFromMeasurements(quoted, { [key]: { height_mm: '158', width_mm: '72' } }), 'Type A'));
  const lines = csv.split('\n');
  assert.match(lines[0], /^SKU,Glass,/);
  assert.equal(lines.length, 3, 'a header plus both compatible pairs');
  assert.ok(csv.includes('"Comma, Model"'), 'a value containing a comma must be quoted');

  // A stock-sourced report carries the SKU and quantity for a shelf sheet.
  const stockCsv = reportToCsv(buildReport(catalogue, sourcesFromStock(catalogue, [stockItem()]), 'Type A'));
  assert.ok(stockCsv.includes('A-12'));
});
