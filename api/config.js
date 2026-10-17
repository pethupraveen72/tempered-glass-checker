import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;
export const workerUrl = process.env.VITE_CLOUDFLARE_WORKER_URL || null;
export const manualEntryToken = process.env.MANUAL_ENTRY_TOKEN || null;

// Comma-separated list. Empty means same-origin only, which is all the bundled
// frontend needs: it calls the API with a relative path.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',').map(origin => origin.trim()).filter(Boolean);

export function missingConfig() {
  return [
    !url && 'VITE_SUPABASE_URL',
    !key && 'VITE_SUPABASE_ANON_KEY',
    !workerUrl && 'VITE_CLOUDFLARE_WORKER_URL',
    !manualEntryToken && 'MANUAL_ENTRY_TOKEN',
  ].filter(Boolean);
}

// Reports configuration gaps once at startup so a misconfigured deployment is
// visible in the logs instead of only as a 503 at request time.
export function reportConfig(log = console) {
  const missing = missingConfig();
  if (!missing.length) return;
  log.warn(`[Config] Missing environment variables: ${missing.join(', ')}.`);
  if (!supabase) log.warn('[Config] Online database disabled: search and manual entry will return 503.');
  if (!workerUrl) log.warn('[Config] Worker URL absent: uncached online lookups will fail.');
  if (!manualEntryToken) log.warn('[Config] MANUAL_ENTRY_TOKEN absent: manual entry writes are refused.');
  log.warn('[Config] Save .env as UTF-8 without a BOM; dotenv cannot read UTF-16 files.');
}

// Echoes an allowed origin instead of sending a wildcard, so a page on another
// site cannot drive these endpoints from a visitor's browser.
export function applyCors(req, res, methods) {
  const origin = req.headers?.origin;
  res.setHeader('Vary', 'Origin');
  if (origin && allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', `${methods}, OPTIONS`);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  return req.method === 'OPTIONS';
}

const allowedHosts = new Set(['www.gsmarena.com', 'gsmarena.com', 'www.kimovil.com', 'www.smartprix.com']);

// The proxy enforces its own allowlist; this mirrors it so a bad URL fails here
// rather than producing a confusing proxy error.
export function proxied(targetUrl) {
  let parsed;
  try { parsed = new URL(targetUrl); } catch { throw new Error(`Invalid lookup URL: ${targetUrl}`); }
  if (parsed.protocol !== 'https:') throw new Error(`Lookup URL must use https: ${targetUrl}`);
  if (!allowedHosts.has(parsed.hostname)) throw new Error(`Lookup host not allowed: ${parsed.hostname}`);
  if (!workerUrl) throw new Error('Missing Cloudflare Worker URL in environment variables.');
  return `${workerUrl}?url=${encodeURIComponent(parsed.toString())}`;
}

// Stored URLs are rendered in an iframe and opened in new tabs, so only plain
// https links are accepted.
export function safeHttpsUrl(value) {
  if (value == null || String(value).trim() === '') return null;
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch { return undefined; }
}
