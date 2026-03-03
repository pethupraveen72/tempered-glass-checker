import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PHONES_DB_PATH = path.join(__dirname, 'public', 'phones.json');

// --- Global Cache for GSMArena Index ---
let phoneIndex = [];
let brandsMap = {};

// Helper to clean scraped text
const cleanText = (text) => text?.replace(/\s+/g, ' ').trim() || '';

// Parse dimensions string
const parseDimensions = (dimStr) => {
    if (!dimStr) return null;
    const metrics = dimStr.split('mm')[0].trim();
    const parts = metrics.split('x').map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return { height: parts[0], width: parts[1] };
    }
    return null;
};

// Parse screen size string
const parseScreenSize = (sizeStr) => {
    if (!sizeStr) return null;
    const parts = sizeStr.split('inches');
    const size = parseFloat(parts[0].trim());
    return isNaN(size) ? null : size;
};

const SCRAPE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

// --- GSMArena-only Notch Normalizer ---
// Priority ORDER is critical — most specific match wins.
const normalizeNotchType = (text) => {
    const t = (text || '').toLowerCase();

    // 1. Dynamic Island (Apple pill-shaped cutout)
    if (t.includes('dynamic island')) return 'Dynamic Island';

    // 2. Dual Punch Hole
    if (t.includes('dual punch') || t.includes('dual hole') || t.includes('dual camera hole') ||
        t.includes('infinity-o2') || t.includes('dual cut')) return 'Dual Punch Hole';

    // 3. Punch Hole (single in-screen cutout)
    //    Samsung: Infinity-O  |  OnePlus/OPPO: circle cutout  |  generic
    if (t.includes('punch hole') || t.includes('punch-hole') || t.includes('hole-punch') ||
        t.includes('infinity-o') || t.includes('pinhole') || t.includes('pill-shaped') ||
        t.includes('circle cutout') || t.includes('single cut')) return 'Punch Hole';

    // 4. Waterdrop / Dewdrop / Teardrop (small V-tip notch)
    //    Samsung: Infinity-V  |  vivo: halo/v-notch  |  OPPO/Realme: dewdrop
    if (t.includes('waterdrop') || t.includes('water drop') || t.includes('dewdrop') ||
        t.includes('teardrop') || t.includes('infinity-v') ||
        t.includes('dot notch') || t.includes('dot-notch') ||
        t.includes('mini notch') || t.includes('mini-notch') ||
        t.includes('drop notch') || t.includes('small notch') ||
        t.includes('v-notch') || t.includes('halo fullview') ||
        t.includes('tiny notch') || t.includes('petal notch')) return 'Waterdrop';

    // 5. U Notch (wide U-shaped notch)
    //    Samsung: Infinity-U  |  generic u-shaped
    if (t.includes('infinity-u') || t.includes('u-shaped') ||
        t.includes('u notch') || t.includes('u-notch') ||
        t.includes('\u03bc-notch') || t.includes('u shape') ||
        t.includes('u-type')) return 'U Notch';

    // 6. Wide Notch (wide top notch — iPhone X-era, older Androids)
    if (t.includes('wide notch') || t.includes('m-notch') ||
        t.includes('wide-notch') || t.includes('notch display') ||
        t.includes('notch')) return 'Wide Notch';

    // 7. No Notch (pop-up, motorized, under-display, classic bezel)
    if (t.includes('pop-up') || t.includes('popup') || t.includes('elevating') ||
        t.includes('motorized') || t.includes('retractable') ||
        t.includes('under-display') || t.includes('under display camera') ||
        t.includes('udc') || t.includes('sliding') ||
        t.includes('infinity display') || t.includes('all-screen')) return 'No Notch';

    return null; // Truly unknown
};

// --- TIER 1: Brand/model pattern lookup (runs BEFORE text scraping) ---
const getNotchByModelPattern = (brand, fullName) => {
    const bm = `${brand} ${fullName}`.toLowerCase();

    // ── SAMSUNG ──────────────────────────────────────────────────────
    // Budget series (Waterdrop / U Notch): 
    // A-series up to A2x (A04, A05, A14, A15, A24), and early A30/A40/A50
    // M-series up to M3x (M04, M14, M24, M34)
    // F-series up to F3x
    if (/samsung.*(a0[0-9]|a1[0-9]|a2[0-4]|a30|a30s|a40|a50|a50s|m0[0-9]|m1[0-9]|m2[0-9]|m3[0-1]|f0[0-9]|f1[0-9]|f2[0-9]|f3[0-4])(\s|$|s|e|m|g)/.test(bm)) {
        return 'Waterdrop';
    }
    // Mid/Premium series (Punch Hole / Infinity-O):
    // S-series, Z-series, new A-series (A25, A34, A35, A51, A52, A53, A54, A55), M5x, F5x
    if (/samsung.*(s[1-3][0-9]|z|a2[5-9]|a3[1-9]|a5[1-9]|a7[0-9]|m5[0-9]|f5[0-9]|f6[0-9]|note)/.test(bm)) {
        return 'Punch Hole';
    }

    // ── VIVO ──────────────────────────────────────────────────────────
    // Budget Y-series pre-2022: Waterdrop
    if (/vivo\s+y(1[1-9]|2[0-9]|3[0-6]|9[0-9])s?(\s|$)/.test(bm) && !bm.includes('pro')) return 'Waterdrop';
    // iQOO / X / V series: Punch Hole
    if (/vivo\s+(iqoo|x\d|v\d{2})/.test(bm)) return 'Punch Hole';

    // ── REALME ────────────────────────────────────────────────────────
    // C-series budget: Waterdrop
    if (/realme\s+c(11|15|21|21y|25|25s|30)/.test(bm)) return 'Waterdrop';
    if (/realme\s+c[23](\s|$)/.test(bm)) return 'U Notch';

    // ── APPLE ─────────────────────────────────────────────────────────
    if (/iphone\s+(x|xs|11|12|13|14)(\s|$|pro|plus|mini|max)/.test(bm)) return 'Wide Notch';
    if (/iphone\s+(14 pro|15|16|17)/.test(bm)) return 'Dynamic Island';

    // ── ONEPLUS ───────────────────────────────────────────────────────
    if (/oneplus\s+(6t?|7)(\s|$)/.test(bm) && !bm.includes('pro')) return 'Waterdrop';
    if (/oneplus\s+7\s+pro/.test(bm)) return 'No Notch';

    return null;
};

// --- SECONDARY NOTCH SCRAPER 1: 91mobiles.com ---
const getNotchFrom91Mobiles = async (brand, model) => {
    try {
        const searchName = model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand}-${model}`;
        const slug = searchName.toLowerCase()
            .replace(/[()]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-').replace(/^-|-$/g, '');
        const url = `https://www.91mobiles.com/${slug}-price-in-india`;
        const res = await axios.get(url, { headers: SCRAPE_HEADERS, timeout: 6000 });
        const $m = cheerio.load(res.data);
        const specText = $m('.spec-sheet').text() + ' ' + $m('.phone-specs').text();
        const result = normalizeNotchType(specText);
        if (result) console.log(`[Notch:91mobiles] Detected: ${result}`);
        return result;
    } catch (e) {
        console.log(`[Notch:91mobiles] Failed: ${e.message}`);
        return null;
    }
};
// --- SECONDARY NOTCH SCRAPER 2: Kimovil.com ---
const getNotchFromKimovil = async (brand, model) => {
    try {
        const searchName = model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand}-${model}`;
        const slug = searchName.toLowerCase()
            .replace(/[()]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-').replace(/^-|-$/g, '');
        const url = `https://www.kimovil.com/en/where-to-buy-${slug}`;
        const res = await axios.get(url, { headers: SCRAPE_HEADERS, timeout: 6000 });
        const $k = cheerio.load(res.data);
        const specText = $k('.phone-detail').text() + ' ' + $k('.section-specs').text();
        const result = normalizeNotchType(specText);
        if (result) console.log(`[Notch:Kimovil] Detected: ${result}`);
        return result;
    } catch (e) {
        console.log(`[Notch:Kimovil] Failed: ${e.message}`);
        return null;
    }
};

// --- SCREEN TYPE SCRAPER: Kimovil.com ---
// Kimovil explicitly lists 2.5D, Dual Edge, 3D Curved, Flat etc. better than GSMArena
const getScreenTypeFromKimovil = async (brand, model) => {
    try {
        const searchName = model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand}-${model}`;
        const slug = searchName.toLowerCase()
            .replace(/[()]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-').replace(/^-|-$/g, '');
        const url = `https://www.kimovil.com/en/where-to-buy-${slug}`;

        // Kimovil aggressively blocks missing User-Agents, mirroring standard requests
        const extraHeaders = {
            ...SCRAPE_HEADERS,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Referer': 'https://www.google.com/'
        };

        const res = await axios.get(url, { headers: extraHeaders, timeout: 6000 });
        const $k = cheerio.load(res.data);

        // Grab all spec text on the page to find keywords
        const specText = ($k('.phone-detail').text() + ' ' + $k('.section-specs').text()).toLowerCase();

        if (specText.includes('2.5d')) return '2.5D';
        if (specText.includes('curved') || specText.includes('dual edge') || specText.includes('3d screen') || specText.includes('3d curved')) return 'Curved';
        if (specText.includes('flat')) return 'Flat';

        return null;
    } catch (e) {
        console.log(`[ScreenType:Kimovil] Failed to fetch or parse: ${e.message}`);
        return null;
    }
};

// --- TIER 2, 3, 4: Targeted Specs, External Sites, and Default ---
const detectNotchType = async ($prod, brand, fullName) => {
    // Tier 1: Model pattern (fastest, no false positives)
    const byPattern = getNotchByModelPattern(brand, fullName);
    if (byPattern) {
        console.log(`[Notch] Tier 1 Pattern → "${byPattern}" for ${fullName}`);
        return byPattern;
    }

    // Tier 2: Check display type field + meta description
    const displayType = $prod('[data-spec="displaytype"]').text();
    const metaDesc = ($prod('meta[name="description"]').attr('content') || '').slice(0, 500);

    for (const src of [displayType, metaDesc]) {
        const result = normalizeNotchType(src);
        if (result) {
            console.log(`[Notch] Tier 2 Field → "${result}" for ${fullName}`);
            return result;
        }
    }

    // Tier 3: Online Site APIs Parallel Scrape
    console.log(`[Notch] Tier 1 & Tier 2 inconclusive. Trying external sites...`);
    const results = await Promise.allSettled([
        getNotchFrom91Mobiles(brand, fullName),
        getNotchFromKimovil(brand, fullName)
    ]);

    for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
            console.log(`[Notch] Tier 3 External → "${r.value}" for ${fullName}`);
            return r.value;
        }
    }

    // Tier 4: Intelligent Default
    console.log(`[Notch] Tier 1-3 failed → defaulting to Punch Hole for ${fullName}`);
    return 'Punch Hole';
};

// --- Initialization: Fetch GSMArena Index ---
const initializeIndex = async () => {
    let indexUrl = null;
    try {
        console.log('[Init] Fetching GSMArena homepage to find index URL...');
        const homeRes = await axios.get('https://www.gsmarena.com/', {
            headers: SCRAPE_HEADERS
        });

        // Find quicksearch-*.jpg
        const match = homeRes.data.match(/"\/quicksearch-[a-zA-Z0-9]+\.jpg"/);
        if (match) {
            const relativeUrl = match[0].replace(/"/g, ''); // Remove quotes
            indexUrl = `https://www.gsmarena.com${relativeUrl}`;
            console.log(`[Init] Found Index URL: ${indexUrl}`);
        } else {
            console.warn('[Init] Could not find quicksearch URL in homepage. Trying explicit fallback hash.');
        }
    } catch (err) {
        console.warn(`[Init] Homepage fetch failed: ${err.message}. Trying explicit fallback hash.`);
    }

    // Fallback known index path if regex fails
    if (!indexUrl) {
        indexUrl = 'https://www.gsmarena.com/quicksearch-82060.jpg';
        console.log(`[Init] Using Fallback Index URL: ${indexUrl}`);
    }

    let loadedFromWeb = false;

    try {
        const indexRes = await axios.get(indexUrl, {
            headers: SCRAPE_HEADERS
        });

        // Data structure: [ {brands_map}, [ [BrandID, PhoneID, Name, Keywords, Slug, ...], ... ] ]
        if (Array.isArray(indexRes.data) && Array.isArray(indexRes.data[1])) {
            brandsMap = indexRes.data[0];
            phoneIndex = indexRes.data[1];
            console.log(`[Init] Web Index loaded successfully. ${phoneIndex.length} phones indexed. Brands loaded: ${Object.keys(brandsMap).length}.`);
            loadedFromWeb = true;
        }
    } catch (err) {
        console.error(`[Init] Failed to load index data from ${indexUrl}: ${err.message}`);
    }

    // TIER 3 FALLBACK: Load from local file if web fails (e.g. Render IP block)
    if (!loadedFromWeb) {
        try {
            console.log(`[Init] Web fetch failed completely. Falling back to local fallback_index.json...`);
            const fallbackPath = path.join(__dirname, 'public', 'fallback_index.json');
            const localData = await fs.readFile(fallbackPath, 'utf8');
            const indexResData = JSON.parse(localData);

            if (Array.isArray(indexResData) && Array.isArray(indexResData[1])) {
                brandsMap = indexResData[0];
                phoneIndex = indexResData[1];
                console.log(`[Init] Local Fallback Index loaded successfully. ${phoneIndex.length} phones indexed. Brands loaded: ${Object.keys(brandsMap).length}.`);
            } else {
                console.error('[Init] Unexpected local fallback index JSON structure.');
            }
        } catch (localErr) {
            console.error(`[Init] CRITICAL ERROR: Could not load local fallback index: ${localErr.message}`);
        }
    }
};

// Run init on start
// Run init on start
initializeIndex();

app.get('/', (req, res) => {
    res.send('<h1>Glass Compatibility API is running 🚀</h1><p>Use /api/search?model=... to search.</p>');
});

app.get('/api/search', async (req, res) => {
    const { model, force } = req.query;
    if (!model) return res.status(400).json({ error: 'Model name required' });

    if (phoneIndex.length === 0) {
        // Try to init again if empty
        await initializeIndex();
        if (phoneIndex.length === 0) {
            return res.status(503).json({ error: 'Service unavailable (Index not loaded)' });
        }
    }

    console.log(`[Search] Searching for: ${model}`);

    // Normalize logic: Tokenize the query
    const queryTokens = model.toLowerCase().replace(/\s+/g, ' ').trim().split(' ');

    let candidates = phoneIndex.filter(item => {
        const brandName = brandsMap[item[0]] ? brandsMap[item[0]].toLowerCase() : '';
        const name = item[2].toLowerCase();
        const keywords = item[3] ? item[3].toLowerCase() : '';
        const shortName = item[5] ? item[5].toLowerCase() : '';

        // Construct a full searchable string
        // Include Brand twice? Once is enough.
        // "motorola edge 70 5g edge70 x70 air"
        const fullText = `${brandName} ${name} ${shortName} ${keywords}`;

        // Token matching: ALL query tokens must be present in fullText
        return queryTokens.every(token => fullText.includes(token));
    });

    if (candidates.length === 0) {
        // Fallback: Try "OR" logic for tokens if "AND" fails?
        // Or fuzzy search. For now, strict token matching is usually good enough if typing is correct.
        // Let's try to fall back to just checking if the query string appears as a substring in the name/brand combo.
        const flatQuery = model.toLowerCase().replace(/\s+/g, ' ').trim();
        candidates = phoneIndex.filter(item => {
            const brandName = brandsMap[item[0]] ? brandsMap[item[0]].toLowerCase() : '';
            const fullName = `${brandName} ${item[2]}`.toLowerCase();
            return fullName.includes(flatQuery);
        });
    }

    if (candidates.length === 0) {
        console.log('[Search] No index match found.');
        return res.status(404).json({ error: 'Not found in index' });
    }

    // Sort candidates
    const queryFlat = model.toLowerCase().trim();
    candidates.sort((a, b) => {
        const brandNameA = brandsMap[a[0]] || '';
        const brandNameB = brandsMap[b[0]] || '';
        const nameA = a[2].toLowerCase();
        const nameB = b[2].toLowerCase();

        const fullNameA = `${brandNameA} ${nameA}`.toLowerCase();
        const fullNameB = `${brandNameB} ${nameB}`.toLowerCase();

        // Exact match logic
        if (fullNameA === queryFlat) return -1;
        if (fullNameB === queryFlat) return 1;

        // Starts with
        if (fullNameA.startsWith(queryFlat) && !fullNameB.startsWith(queryFlat)) return -1;
        if (!fullNameA.startsWith(queryFlat) && fullNameB.startsWith(queryFlat)) return 1;

        // Length (shorter is usually better match)
        return fullNameA.length - fullNameB.length;
    });

    const bestMatch = candidates[0];
    const bestBrand = brandsMap[bestMatch[0]] || 'Unknown';
    console.log(`[Search] Best match: ${bestBrand} ${bestMatch[2]} (ID: ${bestMatch[1]})`);

    try {
        // Construct URL using arbitrary slug and ID
        const phoneId = bestMatch[1];
        const productUrl = `https://www.gsmarena.com/a-${phoneId}.php`;

        console.log(`[Search] Scraping URL: ${productUrl}`);

        const productResponse = await axios.get(productUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const $prod = cheerio.load(productResponse.data);

        // Extract Name
        const fullName = $prod('.specs-phone-name-title').text().trim();
        const brand = fullName.split(' ')[0];

        // Extract Dimensions
        const dimText = $prod('[data-spec="dimensions"]').text();
        const dims = parseDimensions(dimText);

        // Extract Screen Size
        const sizeText = $prod('[data-spec="displaysize"]').text();
        const screenSize = parseScreenSize(sizeText);

        // Extract Resolution & Aspect Ratio
        const resolutionText = $prod('[data-spec="displayresolution"]').text();
        let resolution = "";
        let aspectRatio = "";
        if (resolutionText) {
            const resParts = resolutionText.split(',');
            resolution = resParts[0].trim(); // "1080 x 2400 pixels"
            if (resParts.length > 1) {
                aspectRatio = resParts[1].replace('ratio', '').trim(); // "20:9"
            }
        }

        // Heuristic for Screen Type (Tier 1: Kimovil, Tier 2: GSMArena text fallback)
        let screenType = await getScreenTypeFromKimovil(brand, fullName);

        if (screenType) {
            console.log(`[ScreenType:Kimovil] Detected "${screenType}" for ${fullName}`);
        } else {
            console.log(`[ScreenType:Kimovil] Unsuccessful, falling back to GSMArena heuristics...`);
            screenType = "Flat"; // Default
            const bodyText = $prod('body').text().toLowerCase();
            if (bodyText.includes('curved display') || bodyText.includes('curved screen') || fullName.toLowerCase().includes('edge') || fullName.toLowerCase().includes('curved')) {
                screenType = "Curved";
            } else if (bodyText.includes('2.5d')) {
                screenType = "2.5D";
            }
            console.log(`[ScreenType:GSMArena] Fallback determined "${screenType}" for ${fullName}`);
        }

        // GSMArena-only notch detection (async 4-tier cascade)
        const notchType = await detectNotchType($prod, brand, fullName);

        // Extract Image URL
        let imageUrl = null;
        const imgElement = $prod('.specs-photo-main img');
        if (imgElement.length > 0) {
            imageUrl = imgElement.attr('src');
            // Convert relative URL to absolute if needed
            if (imageUrl && !imageUrl.startsWith('http')) {
                imageUrl = `https://www.gsmarena.com/${imageUrl}`;
            }
        }

        if (!dims || !screenSize) {
            console.log('[Search] Missing critical specs.');
            return res.status(500).json({ error: 'Specs incomplete' });
        }

        // Calculate Display Dimensions (MM)
        let displayHeightMm = null;
        let displayWidthMm = null;

        if (resolution && screenSize) {
            const resMatch = resolution.match(/(\d+)\s*x\s*(\d+)/);
            if (resMatch) {
                const w_px = parseInt(resMatch[1]);
                const h_px = parseInt(resMatch[2]);
                const widthPx = Math.min(w_px, h_px);
                const heightPx = Math.max(w_px, h_px);
                const diagonalIn = screenSize;
                const diagonalPx = Math.sqrt(Math.pow(widthPx, 2) + Math.pow(heightPx, 2));

                if (!isNaN(diagonalPx) && diagonalPx > 0) {
                    const heightIn = (heightPx / diagonalPx) * diagonalIn;
                    const widthIn = (widthPx / diagonalPx) * diagonalIn;
                    displayHeightMm = parseFloat((heightIn * 25.4).toFixed(2));
                    displayWidthMm = parseFloat((widthIn * 25.4).toFixed(2));
                }
            }
        }

        const newPhone = {
            model: fullName,
            brand: brand,
            screen_size: screenSize,
            height_mm: dims.height,
            width_mm: dims.width,
            screen_type: screenType,
            notch_type: notchType,
            resolution: resolution,
            image_url: imageUrl,
            display_height_mm: displayHeightMm,
            display_width_mm: displayWidthMm
        };

        console.log('[Search] Scraped Data:', newPhone);

        // Save to DB
        const dbData = await fs.readFile(PHONES_DB_PATH, 'utf-8');
        const phones = JSON.parse(dbData);

        // Normalize string for comparison (remove spaces, lowercase)
        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const newModelNorm = normalize(newPhone.model);

        const exists = phones.find(p => {
            const existingNorm = normalize(p.model);
            // Check for exact match or if one contains the other strictly?
            // "Motorola Edge 70" vs "Motorola Edge 70 5G" -> normalizing might make them different.
            // But usually we want to avoid adding if a very similar one exists.
            // Let's stick to normalized equality for now to be safe, but also check if newPhone is "Nothing Phone (2a)" and existing is "Nothing Phone 2a".
            return existingNorm === newModelNorm;
        });

        if (!exists || force === 'true') {
            if (exists && force === 'true') {
                // Update existing
                const index = phones.findIndex(p => p.model === exists.model);
                if (index !== -1) {
                    phones[index] = newPhone;
                    console.log(`[Search] Forced update for: ${newPhone.model}`);
                }
            } else {
                phones.push(newPhone);
            }

            await fs.writeFile(PHONES_DB_PATH, JSON.stringify(phones, null, 4));
            console.log('[Search] Saved to local DB.');
        } else {
            console.log('[Search] Phone already in DB (Duplicate prevention).');
            // Return the EXISTING phone data instead of the new one to ensure consistency?
            // Yes, let's return the existing one so the frontend uses the stored one.
            return res.json(exists);
        }

        res.json(newPhone);

    } catch (err) {
        console.error('[Search] Error:', err.message);
        res.status(500).json({ error: 'Scraping failed', details: err.message });
    }
});

// --- Deployment: Serve Static Assets (Production) ---
const distPath = path.join(__dirname, 'dist');
// Serve static files from dist
app.use(express.static(distPath));

// API routes are defined above.
// For any other request, send index.html (SPA Fallback)
app.post('/api/manual-entry', async (req, res) => {
    try {
        const {
            model,
            brand,
            height_mm,
            width_mm,
            screen_size,
            screen_type,
            notch_type,
            resolution,
            image_url
        } = req.body;

        if (!model || !brand || !height_mm || !width_mm || !screen_size) {
            return res.status(400).json({ error: 'Missing required fields (model, brand, height, width, screen_size)' });
        }

        // Calculate Display Dimensions (MM)
        let displayHeightMm = null;
        let displayWidthMm = null;

        if (resolution && screen_size) {
            const resMatch = resolution.match(/(\d+)\s*x\s*(\d+)/);
            if (resMatch) {
                const w_px = parseInt(resMatch[1]);
                const h_px = parseInt(resMatch[2]);
                const widthPx = Math.min(w_px, h_px);
                const heightPx = Math.max(w_px, h_px);
                const diagonalIn = parseFloat(screen_size);
                const diagonalPx = Math.sqrt(Math.pow(widthPx, 2) + Math.pow(heightPx, 2));

                if (!isNaN(diagonalPx) && diagonalPx > 0) {
                    const heightIn = (heightPx / diagonalPx) * diagonalIn;
                    const widthIn = (widthPx / diagonalPx) * diagonalIn;
                    displayHeightMm = parseFloat((heightIn * 25.4).toFixed(2));
                    displayWidthMm = parseFloat((widthIn * 25.4).toFixed(2));
                }
            }
        }

        const newPhone = {
            model: model.trim(),
            brand: brand.trim(),
            screen_size: parseFloat(screen_size),
            height_mm: parseFloat(height_mm),
            width_mm: parseFloat(width_mm),
            screen_type: screen_type || 'Flat',
            notch_type: notch_type || 'Punch Hole',
            resolution: resolution || '',
            image_url: image_url || '',
            view360_url: req.body.view360_url || '',
            display_height_mm: displayHeightMm, // Calculated or null
            display_width_mm: displayWidthMm  // Calculated or null
        };

        const dbData = await fs.readFile(PHONES_DB_PATH, 'utf-8');
        let phones = JSON.parse(dbData);

        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const newModelNorm = normalize(newPhone.model);

        const index = phones.findIndex(p => normalize(p.model) === newModelNorm);

        if (index !== -1) {
            // Update existing but preserve ID/other fields if any (though currently simple schema)
            phones[index] = { ...phones[index], ...newPhone };
            console.log(`[Manual Entry] Updated: ${newPhone.model}`);
        } else {
            phones.push(newPhone);
            console.log(`[Manual Entry] Added: ${newPhone.model}`);
        }

        await fs.writeFile(PHONES_DB_PATH, JSON.stringify(phones, null, 4));
        res.json({ success: true, phone: newPhone });

    } catch (err) {
        console.error('[Manual Entry] Error:', err.message);
        res.status(500).json({ error: 'Failed to save entry', details: err.message });
    }
});

// For any other request, send index.html (SPA Fallback)
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
