import test from 'node:test';
import assert from 'node:assert/strict';
import manual from '../api/manual-entry.js';
import search from '../api/search.js';

function response() {
  return { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() {} };
}
test('manual entries validate invalid input before reaching the database', async () => {
  for (const body of [undefined, {}, { model: 'Test', brand: 'Test', height_mm: -1, width_mm: 70, screen_size: 6.5 }, { model: 'Test', brand: 'Test', height_mm: '155junk', width_mm: 70, screen_size: 6.5 }]) {
    const res = response(); await manual({ method: 'POST', body }, res); assert.equal(res.code, 400);
  }
});
test('search preflight and invalid query handling', async () => {
  for (const [req, code] of [[{ method: 'OPTIONS' }, 200], [{ method: 'POST' }, 405], [{ method: 'GET', query: { model: ['bad'] } }, 400]]) {
    const res = response(); await search(req, res); assert.equal(res.code, code);
  }
});
