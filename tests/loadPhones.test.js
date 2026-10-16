import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPhones } from '../src/loadPhones.js';

const bundled = async () => ({ ok: true, json: async () => [{ model: 'Offline' }] });
test('unconfigured, empty and failed databases load bundled data', async () => {
  const client = result => ({ from: () => ({ select: () => ({ order: () => ({ range: async () => result }) }) }) });
  for (const db of [null, client({ data: [] }), client({ error: new Error('unavailable') })]) {
    assert.deepEqual(await loadPhones(db, bundled), { phones: [{ model: 'Offline' }], offline: true });
  }
});
test('catalogue pagination handles a server cap smaller than requested', async () => {
  const all = Array.from({ length: 1250 }, (_, i) => ({ model: String(i) }));
  const starts = [];
  const client = { from: () => ({ select: () => ({ order: () => ({ range: async start => {
    starts.push(start); return { data: all.slice(start, start + 500) };
  } }) }) }) };
  const result = await loadPhones(client, bundled);
  assert.equal(result.phones.length, 1250);
  assert.equal(result.offline, false);
  assert.deepEqual(starts, [0, 500, 1000, 1250]);
});
