# Glass Finder

React application for comparing a physical tempered-glass protector with a target phone. Includes model search, manual phone editing, online lookup, recent checks and a copyable result.

## Run locally

Use Node.js 22+ and npm:

```sh
npm ci
npm run dev
```

The frontend runs at http://localhost:5173 and the API at http://localhost:3000. Vite proxies `/api` requests, including when its port changes. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`. `start_server.bat` runs from its own project directory.

Phone browsing and compatibility checks work without database configuration using `public/phones.json`. The displayed model count reflects the data actually loaded.

For online database reads, manual saving and online lookup, copy `.env.example` to `.env` and fill it in (`.env` is ignored by git; do not commit credentials):

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_CLOUDFLARE_WORKER_URL=https://your-proxy.example
MANUAL_ENTRY_TOKEN=a-long-random-string
CORS_ALLOWED_ORIGINS=https://your-site.example
```

**Save `.env` as UTF-8 without a byte-order mark.** dotenv cannot parse UTF-16, which is what PowerShell's `>` redirect and `Set-Content` produce by default; a UTF-16 or BOM-prefixed file loads as zero variables and every online feature reports itself unconfigured. Use `Set-Content -Encoding utf8` or an editor set to UTF-8.

`GET /api/health` lists any variables still missing, and the server logs them once at startup.

The Supabase `phones` table must exist and permit the intended reads/writes through its policies. The frontend uses the public anon key; do not put a service-role key in a `VITE_` variable. The Worker URL is required for uncached online lookups. `MANUAL_ENTRY_TOKEN` gates catalogue writes and `CORS_ALLOWED_ORIGINS` is an optional comma-separated list of browser origins allowed to call the API; leaving it empty permits the same-origin frontend only. Unavailable API configuration returns an explanatory error. Database loading is paginated and falls back to bundled data on failure or an empty catalogue.

Saving a phone through **Add / Edit Model** requires the admin token in that form, which must match `MANUAL_ENTRY_TOKEN` on the server. It is remembered in this browser's local storage and is never bundled into the app. Writes are refused when the token is unset, so a deployment without one is read-only.

## Physical tempered-glass measurements

1. Choose the protector's source phone model and glass type.
2. Enter the actual protector's height and width in **millimetres**, measured edge to edge in portrait orientation. Optionally enter its thickness.
3. Choose the target device and click **Check Compatibility**.

The final result includes the glass height, width and thickness, body clearance per edge assuming centred placement, and glass size minus display size. Negative body clearance indicates overhang; negative display margin indicates incomplete coverage. Phone body specifications are shown separately as reference data and are never substituted for physical glass measurements.

Measurements save automatically per source phone model in this browser's local storage and restore when that model is selected again. Update them when using a different protector for the same phone. Recent checks also keep their own measurement snapshots. Changing any comparison input clears the previous result. Copy Result includes the measurement summary. Thickness is recorded only and does not establish fingerprint or touch compatibility.

Results include a scaled visual overlay of the phone body, display and measured glass. Dimension Matches offers a report with per-edge clearances and a visual fit view for each match. Save Record keeps the 10 most recent reports on this browser for later review.

## Compatibility rules and limits

All modes check measured glass against the target's body and rectangular display area. Missing or invalid data produces **Needs verification**, never a positive fit claim. Overhang, incomplete display coverage and known shape/camera mismatches produce **Not compatible**.

- **Type A (clear):** Also compares source and target screen shape, notch type, diagonal (within 0.80 inches), and display height/width (within 0.90 mm). Complete flat-screen comparisons can produce **Dimensions fit**. These comparison tolerances are application heuristics, not manufacturer certification.
- **Type B (full cover):** Passing outer dimensions still requires physical verification of the transparent opening, black borders, camera position and case clearance.
- **Type C (curved):** Requires the same brand and exact model; matching dimensions still requires physical verification of the curve and adhesive.

Screen shape and camera / notch type are stored as unknown when no source confirms them, rather than filled with a likely value, because a guessed spec is indistinguishable from a confirmed one and drives a hard verdict. Unknown specifications produce **Needs verification**. Display dimensions may be estimates calculated from diagonal and resolution. Measurements alone cannot verify rounded corners, precise cutout positions, usable flat surface, black-border openings or case fit. The app does not assign a statistical fit-confidence percentage.

## Verification and production

```sh
npm test
npm run lint
npm run build
npm start
```

Tests cover physical fit checks, invalid and missing data, decimal tolerance boundaries, catalogue pagination/fallback and API input validation. `npm start` serves the built frontend and API on `PORT` (default 3000). Vercel uses the handlers in `api/`; Docker uses `server.js`. Set frontend environment variables before building when using a configured Supabase frontend.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | API health and missing configuration |
| `GET /api/search?model=...` | Cached lookup or online scrape |
| `POST /api/manual-entry` | Validate and save phone specifications (requires `X-Admin-Token`) |

Main files: `src/App.jsx` (interface), `src/compatibility.js` (measurement checks), `src/loadPhones.js` (catalogue loading), `api/` (database/search handlers), `server.js` (local and production HTTP server), and `tests/` (regression tests).

Root-level `update_*.js`, `validate_*.js`, deduplication, audit and migration scripts are catalogue maintenance tools, separate from the app and automated test suite. `scripts/cloudflare-worker.js` is the lookup proxy required for uncached online lookups; it proxies only https requests to an exact allowlist of spec sites. `api/config.js` holds shared configuration, CORS and URL validation, and `api/specs.js` the display-dimension estimate. Run maintenance tools from the project root and review them before use, as some modify catalogue data or the database.
