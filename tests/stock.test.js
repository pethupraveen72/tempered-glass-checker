import test from 'node:test';
import assert from 'node:assert/strict';
import stock, { validateStockItem } from '../api/stock.js';
import { validateRows, parsePastedRows, emptyStockRow } from '../src/stockClient.js';

function response() {
  return {
    code: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}
const request = (overrides = {}) => ({ method: 'POST', headers: {}, query: {}, ...overrides });
const item = (overrides = {}) => ({ sku: 'A-12', glass_type: 'Type A', height_mm: 158, width_mm: 72, quantity: 10, ...overrides });

test('a valid stock item is normalised, and blank optional fields become null', () => {
  const row = validateStockItem(item({ label: '  Clear  ', shelf: '', thickness_mm: '' }), 0);
  assert.equal(row.sku, 'A-12');
  assert.equal(row.label, 'Clear', 'surrounding whitespace is trimmed');
  assert.equal(row.shelf, null);
  assert.equal(row.thickness_mm, null, 'an omitted thickness is allowed');
  assert.equal(row.height_mm, 158);
  assert.equal(row.quantity, 10);
  // An absent quantity means none held, not an error.
  assert.equal(validateStockItem(item({ quantity: '' }), 0).quantity, 0);
});

test('an unusable stock item is rejected with a reason naming its row', () => {
  const cases = [
    [item({ sku: '   ' }), /item 1: a SKU/],
    [item({ glass_type: 'Type D' }), /glass_type must be one of/],
    [item({ height_mm: 0 }), /height_mm and width_mm/],
    [item({ width_mm: 'abc' }), /height_mm and width_mm/],
    [item({ thickness_mm: -1 }), /thickness_mm must be a positive/],
    [item({ quantity: 2.5 }), /quantity must be a whole number/],
    [item({ quantity: -3 }), /quantity must be a whole number/],
    [null, /not an object/],
  ];
  for (const [candidate, pattern] of cases) {
    const result = validateStockItem(candidate, 0);
    assert.equal(typeof result, 'string', `expected a rejection for ${JSON.stringify(candidate)}`);
    assert.match(result, pattern);
  }
});

test('stock writes are refused without a configured token', async () => {
  // No MANUAL_ENTRY_TOKEN in the test environment.
  const res = response();
  await stock(request({ body: { items: [item()] } }), res);
  assert.equal(res.code, 503);
  assert.match(res.body.error, /MANUAL_ENTRY_TOKEN/);
});

test('stock rejects unsupported methods and preflights cleanly', async () => {
  for (const [method, code] of [['OPTIONS', 204], ['PUT', 405], ['PATCH', 405]]) {
    const res = response();
    await stock(request({ method }), res);
    assert.equal(res.code, code, `${method} should return ${code}`);
  }
});

test('bulk rows are checked before submission, with every problem reported at once', () => {
  const rows = [
    { ...emptyStockRow(), sku: 'A-1', height_mm: '158', width_mm: '72' },
    { ...emptyStockRow(), sku: '', height_mm: '', width_mm: 'x' },
    { ...emptyStockRow(), sku: 'A-1', height_mm: '160', width_mm: '70' },
  ];
  const problems = validateRows(rows);
  assert.equal(validateRows([rows[0]]).length, 0, 'a complete row has no problems');
  assert.ok(problems.some(p => /Row 2: SKU/.test(p)));
  assert.ok(problems.some(p => /Row 2: height/.test(p)));
  assert.ok(problems.some(p => /Row 2: width/.test(p)));
  // A duplicate SKU in the same batch would silently overwrite itself.
  assert.ok(problems.some(p => /Row 3.*repeated/.test(p)));
});

test('spreadsheet rows paste in, with glass type accepted in short forms', () => {
  const parsed = parsePastedRows([
    'A-12, Realme 12 5G, A, 158.0, 72.0, 0.33, 10',
    'A-13\tOppo Reno 15c\tcurved\t160.2\t73.4\t0.30\t4',
    'A-14, Some Phone, full, 150, 70',
    '',
    '   ',
  ].join('\n'));

  assert.equal(parsed.length, 3, 'blank lines are ignored');
  assert.deepEqual(
    parsed.map(row => [row.sku, row.source_model, row.glass_type, row.height_mm, row.width_mm, row.quantity]),
    [
      ['A-12', 'Realme 12 5G', 'Type A', '158.0', '72.0', '10'],
      ['A-13', 'Oppo Reno 15c', 'Type C', '160.2', '73.4', '4'],
      ['A-14', 'Some Phone', 'Type B', '150', '70', ''],
    ],
  );
  // Pasted rows must satisfy the same validation as typed ones.
  assert.deepEqual(validateRows(parsed.slice(0, 2)), []);
});
