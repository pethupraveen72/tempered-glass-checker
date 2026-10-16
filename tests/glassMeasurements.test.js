import test from 'node:test';
import assert from 'node:assert/strict';
import { glassMeasurementKey, readGlassMeasurements, writeGlassMeasurements } from '../src/glassMeasurements.js';

test('model measurements survive a reload and remain separate across models and brands', () => {
  let stored = null;
  const storage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  const a = glassMeasurementKey({ brand: 'Example', model: 'Phone A' });
  const b = glassMeasurementKey({ brand: 'Example', model: 'Phone B' });
  const c = glassMeasurementKey({ brand: 'Other', model: 'Phone A' });
  const measurements = { height_mm: '155.50', width_mm: '71', thickness_mm: '0.33' };
  assert.equal(writeGlassMeasurements({ [a]: measurements, [b]: { ...measurements, width_mm: '72' } }, storage), true);
  const reloaded = readGlassMeasurements(storage);
  assert.deepEqual(reloaded[a], measurements);
  assert.equal(reloaded[b].width_mm, '72');
  assert.equal(reloaded[c], undefined);
  assert.equal(glassMeasurementKey({ brand: ' EXAMPLE ', model: ' phone a ' }), a);
  // Clearing a field must persist, rather than bringing back its previous value.
  writeGlassMeasurements({ ...reloaded, [a]: { ...measurements, width_mm: '' } }, storage);
  assert.equal(readGlassMeasurements(storage)[a].width_mm, '');
  assert.equal(glassMeasurementKey(null), null);
});

test('corrupt or blocked storage does not prevent measurement entry', () => {
  for (const value of ['invalid JSON', 'null', '[]', '42']) {
    assert.deepEqual(readGlassMeasurements({ getItem: () => value }), {});
  }
  const blocked = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota exceeded'); } };
  assert.deepEqual(readGlassMeasurements(blocked), {});
  assert.equal(writeGlassMeasurements({}, blocked), false);
  assert.deepEqual(readGlassMeasurements({ getItem: () => '{"model":{"height_mm":155,"width_mm":null,"thickness_mm":{}}}' }), {
    model: { height_mm: '155', width_mm: '', thickness_mm: '' },
  });
});
