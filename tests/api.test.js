import test from 'node:test';
import assert from 'node:assert/strict';
import manual from '../api/manual-entry.js';
import search from '../api/search.js';
import { safeHttpsUrl, proxied } from '../api/config.js';
import { displayDimensions, mergeStoredPhone, storedPhoneColumns } from '../api/specs.js';

function response() {
  return {
    code: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}
const request = (overrides = {}) => ({ method: 'POST', headers: {}, ...overrides });

test('manual entries validate invalid input before reaching the database', async () => {
  for (const body of [undefined, {}, { model: 'Test', brand: 'Test', height_mm: -1, width_mm: 70, screen_size: 6.5 }, { model: 'Test', brand: 'Test', height_mm: '155junk', width_mm: 70, screen_size: 6.5 }]) {
    const res = response(); await manual(request({ body }), res); assert.equal(res.code, 400);
  }
});

test('search preflight and invalid query handling', async () => {
  for (const [req, code] of [[{ method: 'OPTIONS' }, 204], [{ method: 'POST' }, 405], [{ method: 'GET', query: { model: ['bad'] } }, 400]]) {
    const res = response(); await search(request(req), res); assert.equal(res.code, code);
  }
});

test('an unconfigured deployment refuses writes instead of accepting them', async () => {
  // No MANUAL_ENTRY_TOKEN is set in the test environment, so a well-formed
  // request must still be refused rather than reaching the database.
  const res = response();
  await manual(request({ body: { model: 'Test One', brand: 'Test', height_mm: 160, width_mm: 75, screen_size: 6.5 } }), res);
  assert.equal(res.code, 503);
  assert.equal(res.body.success, false);
});

test('stored URLs must be absolute https links', async () => {
  for (const url of ['javascript:alert(1)', 'http://example.com/a.jpg', 'not-a-url', '//example.com']) {
    const res = response();
    await manual(request({ body: { model: 'Test Two', brand: 'Test', height_mm: 160, width_mm: 75, screen_size: 6.5, image_url: url } }), res);
    assert.equal(res.code, 400, `expected rejection for ${url}`);
  }
  assert.equal(safeHttpsUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.equal(safeHttpsUrl(''), null);
  assert.equal(safeHttpsUrl('http://example.com'), undefined);
});

test('no CORS origin is echoed back for an origin that is not allowed', async () => {
  const res = response();
  await search(request({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), res);
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(res.headers['Vary'], 'Origin');
});

test('the lookup proxy only accepts allowlisted https hosts', () => {
  for (const url of [
    'https://evil.example/?x=gsmarena.com',
    'http://www.gsmarena.com/a-1.php',
    'https://gsmarena.com.evil.example/a-1.php',
    'not-a-url',
  ]) {
    assert.throws(() => proxied(url), /not allowed|must use https|Invalid lookup URL/, `expected rejection for ${url}`);
  }
  // An allowed host still fails closed while the worker URL is unconfigured.
  assert.throws(() => proxied('https://www.gsmarena.com/a-1.php'), /Worker URL/);
});

test('display dimensions come from the diagonal and resolution, or stay null', () => {
  const { height, width } = displayDimensions('1080 x 2400 pixels', 6.72);
  // Matches the bundled Realme 12 5G row (155.7 x 70.0).
  assert.ok(Math.abs(height - 155.7) < 0.2, `height was ${height}`);
  assert.ok(Math.abs(width - 70.0) < 0.2, `width was ${width}`);
  // Orientation does not matter; the longer side is the height.
  assert.deepEqual(displayDimensions('2400 x 1080', 6.72), displayDimensions('1080 x 2400', 6.72));
  for (const [resolution, size] of [[null, 6.5], ['1080 x 2400', null], ['no digits', 6.5], ['1080 x 2400', 0]]) {
    assert.deepEqual(displayDimensions(resolution, size), { height: null, width: null });
  }
});

test('editing a phone never erases the specifications it does not carry', () => {
  const stored = {
    screen_type: 'Flat', notch_type: 'Punch Hole', resolution: '1080 x 2400 pixels',
    image_url: 'https://example.com/a.jpg', view360_url: 'https://example.com/360',
    display_height_mm: 155.7, display_width_mm: 70,
  };
  // A body-only correction: every omitted column must survive.
  const merged = mergeStoredPhone({ model: 'Realme 12 5G', brand: 'Realme', screen_size: 6.72, height_mm: 165.6, width_mm: 76.1 }, stored);
  for (const [field, value] of Object.entries(stored)) {
    assert.equal(merged[field], value, `${field} was not preserved`);
  }
  assert.equal(merged.height_mm, 165.6);

  // An explicitly submitted empty value is a deliberate "unknown" and clears it.
  const cleared = mergeStoredPhone(
    { model: 'Realme 12 5G', brand: 'Realme', screen_size: 6.72, height_mm: 165.6, width_mm: 76.1, notch_type: '' },
    stored,
  );
  assert.equal(cleared.notch_type, null);
  assert.equal(cleared.screen_type, 'Flat');

  // With no stored row and no resolution, unknowns stay null rather than guessed.
  const fresh = mergeStoredPhone({ model: 'New Phone', brand: 'New', screen_size: 6.5, height_mm: 160, width_mm: 75 }, {});
  assert.deepEqual(
    { screen: fresh.screen_type, notch: fresh.notch_type, h: fresh.display_height_mm, w: fresh.display_width_mm },
    { screen: null, notch: null, h: null, w: null },
  );

  // A resolution still derives the display dimensions for a new row.
  const derived = mergeStoredPhone({ model: 'New Phone', brand: 'New', screen_size: 6.72, height_mm: 160, width_mm: 75, resolution: '1080 x 2400' }, {});
  assert.ok(Math.abs(derived.display_height_mm - 155.7) < 0.2);

  // Submitting a changed resolution does update the estimate, even though a
  // resolution only carried over from storage does not.
  const rerated = mergeStoredPhone(
    { model: 'Realme 12 5G', brand: 'Realme', screen_size: 6.1, height_mm: 165.6, width_mm: 76.1, resolution: '1080 x 2400' },
    stored,
  );
  assert.ok(Math.abs(rerated.display_height_mm - 141.3) < 0.5, `was ${rerated.display_height_mm}`);

  // The column list the handler selects must cover everything the merge reads.
  for (const field of Object.keys(stored)) assert.ok(storedPhoneColumns.includes(field), `${field} is not selected`);
});
