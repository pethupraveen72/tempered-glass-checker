import { emptyMeasurements } from './compatibility.js';

const storageKey = 'glassMeasurementsByModel';
export const glassMeasurementKey = phone => phone?.model
  ? JSON.stringify([String(phone.brand || '').trim().toLowerCase(), phone.model.trim().toLowerCase()])
  : null;

export function readGlassMeasurements(storage) {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(storageKey) || '{}');
    if (!saved || Array.isArray(saved) || typeof saved !== 'object') return {};
    return Object.fromEntries(Object.entries(saved).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value)).map(([key, value]) => [key,
      Object.fromEntries(Object.keys(emptyMeasurements()).map(field => [field, typeof value[field] === 'string' || typeof value[field] === 'number' ? String(value[field]) : ''])),
    ]));
  } catch { return {}; }
}

export function writeGlassMeasurements(saved, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(storageKey, JSON.stringify(saved));
    return true;
  } catch { return false; }
}
