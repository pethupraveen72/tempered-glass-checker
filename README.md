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

For online database reads, manual saving and online lookup, configure a local `.env` file (do not commit credentials):

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_CLOUDFLARE_WORKER_URL=https://your-proxy.example
```

The Supabase `phones` table must exist and permit the intended reads/writes through its policies. The frontend uses the public anon key; do not put a service-role key in a `VITE_` variable. The Worker URL is required for uncached online lookups. Unavailable API configuration returns an explanatory error. Database loading is paginated and falls back to bundled data on failure or an empty catalogue.

## Physical tempered-glass measurements

1. Choose the protector's source phone model and glass type.
2. Enter the actual protector's height and width in **millimetres**, measured edge to edge in portrait orientation. Optionally enter its thickness.
3. Choose the target device and click **Check Compatibility**.

The final result includes the glass height, width and thickness, body clearance per edge assuming centred placement, and glass size minus display size. Negative body clearance indicates overhang; negative display margin indicates incomplete coverage. Phone body specifications are shown separately as reference data and are never substituted for physical glass measurements.

Measurements belong to each check, because protectors for the same phone can vary. Recent checks save the glass type and measurements in this browser's local storage. Selecting a new glass source clears measurements; changing any comparison input clears the previous result. Copy Result includes the measurement summary. Thickness is recorded only and does not establish fingerprint or touch compatibility.

## Compatibility rules and limits

All modes check measured glass against the target's body and rectangular display area. Missing or invalid data produces **Needs verification**, never a positive fit claim. Overhang, incomplete display coverage and known shape/camera mismatches produce **Not compatible**.

- **Type A (clear):** Also compares source and target screen shape, notch type, diagonal (within 0.80 inches), and display height/width (within 0.90 mm). Complete flat-screen comparisons can produce **Dimensions fit**. These comparison tolerances are application heuristics, not manufacturer certification.
- **Type B (full cover):** Passing outer dimensions still requires physical verification of the transparent opening, black borders, camera position and case clearance.
- **Type C (curved):** Requires the same brand and exact model; matching dimensions still requires physical verification of the curve and adhesive.

Display dimensions may be estimates calculated from diagonal and resolution. Measurements alone cannot verify rounded corners, precise cutout positions, usable flat surface, black-border openings or case fit. The app does not assign a statistical fit-confidence percentage.

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
| `GET /api/health` | API health |
| `GET /api/search?model=...` | Cached lookup or online scrape |
| `POST /api/manual-entry` | Validate and save phone specifications |

Main files: `src/App.jsx` (interface), `src/compatibility.js` (measurement checks), `src/loadPhones.js` (catalogue loading), `api/` (database/search handlers), `server.js` (local and production HTTP server), and `tests/` (regression tests).
