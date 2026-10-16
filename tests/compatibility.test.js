import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCompatibility as check, positiveNumber, formatMm } from '../src/compatibility.js';

const phone = { model: 'Example', brand: 'Example Brand', screen_type: 'Flat', notch_type: 'Punch Hole', height_mm: 160, width_mm: 75, display_height_mm: 150, display_width_mm: 70, screen_size: 6.5 };
const measured = { height_mm: '155', width_mm: '72', thickness_mm: '0.33' };

test('measured glass dimensions determine body clearance and display coverage', () => {
  const result = check(phone, phone, 'Type A', measured);
  assert.equal(result.isCompatible, true);
  assert.equal(result.color_code, 'GREEN');
  assert.equal(result.vertical_clearance, 2.5);
  assert.equal(result.horizontal_clearance, 1.5);
  assert.equal(result.display_height_margin, 5);
  assert.equal(result.physical.thickness_mm, 0.33);
});
test('missing physical dimensions cannot produce a positive result', () => {
  for (const type of ['Type A', 'Type B', 'Type C']) assert.equal(check(phone, phone, type).color_code, 'YELLOW');
  assert.equal(check(phone, phone, 'Type A', { height_mm: 155 }).color_code, 'YELLOW');
});
test('invalid measurements are rejected instead of silently becoming zero', () => {
  for (const value of ['-5', '0', 'NaN', 'Infinity', '155mm', -Infinity]) {
    assert.equal(check(phone, phone, 'Type A', { ...measured, height_mm: value }).color_code, 'YELLOW');
  }
  assert.equal(check(phone, phone, 'Type A', { ...measured, thickness_mm: '-0.3' }).color_code, 'YELLOW');
  assert.equal(positiveNumber(null), null);
  assert.equal(formatMm(NaN), 'Unknown');
});
test('same model cannot override physical overhang or incomplete coverage', () => {
  for (const type of ['Type A', 'Type B', 'Type C']) {
    for (const dimensions of [{ height_mm: 161, width_mm: 72 }, { height_mm: 155, width_mm: 76 }, { height_mm: 149, width_mm: 72 }, { height_mm: 155, width_mm: 69 }]) {
      assert.equal(check(phone, phone, type, dimensions).color_code, 'RED');
    }
  }
});
test('missing target or source data stays unverified', () => {
  for (const key of ['height_mm', 'width_mm', 'display_height_mm', 'display_width_mm', 'screen_size', 'screen_type', 'notch_type']) {
    assert.equal(check(phone, { ...phone, [key]: null }, 'Type A', measured).color_code, 'YELLOW');
  }
  assert.equal(check({ ...phone, display_height_mm: null }, phone, 'Type A', measured).color_code, 'YELLOW');
});
test('shape and notch mismatches fail', () => {
  assert.equal(check(phone, { ...phone, screen_type: 'Curved' }, 'Type A', measured).color_code, 'RED');
  assert.equal(check(phone, { ...phone, notch_type: 'Wide Notch' }, 'Type A', measured).color_code, 'RED');
});
test('full cover and curved glass require physical verification even for matching dimensions', () => {
  for (const type of ['Type B', 'Type C']) assert.equal(check(phone, phone, type, measured).color_code, 'YELLOW');
  assert.equal(check(phone, { ...phone, brand: 'Different' }, 'Type C', measured).color_code, 'RED');
});
test('clear glass compares display sizes with stable decimal boundaries', () => {
  assert.equal(check({ ...phone, display_width_mm: 70.9 }, phone, 'Type A', measured).color_code, 'GREEN');
  assert.equal(check({ ...phone, display_width_mm: 70.91 }, phone, 'Type A', measured).color_code, 'RED');
});
