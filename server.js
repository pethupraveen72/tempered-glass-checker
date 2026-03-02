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

// --- Initialization: Fetch GSMArena Index ---
const initializeIndex = async () => {
    try {
        console.log('[Init] Fetching GSMArena homepage to find index URL...');
        const homeRes = await axios.get('https://www.gsmarena.com/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        // Find quicksearch-*.jpg
        const match = homeRes.data.match(/"\/quicksearch-[a-zA-Z0-9]+\.jpg"/);
        if (!match) {
            console.error('[Init] Could not find quicksearch URL in homepage.');
            return;
        }

        const relativeUrl = match[0].replace(/"/g, ''); // Remove quotes
        const indexUrl = `https://www.gsmarena.com${relativeUrl}`;
        console.log(`[Init] Found Index URL: ${indexUrl}`);

        const indexRes = await axios.get(indexUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        // Data structure: [ {brands_map}, [ [BrandID, PhoneID, Name, Keywords, Slug, ...], ... ] ]
        if (Array.isArray(indexRes.data) && Array.isArray(indexRes.data[1])) {
            brandsMap = indexRes.data[0];
            phoneIndex = indexRes.data[1];
            console.log(`[Init] Index loaded successfully. ${phoneIndex.length} phones indexed. Brands loaded: ${Object.keys(brandsMap).length}.`);
        } else {
            console.error('[Init] Unexpected index JSON structure.');
        }

    } catch (err) {
        console.error(`[Init] Failed to load index: ${err.message}`);
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

        // Heuristic for Screen Type
        let screenType = "Flat";
        const bodyText = $prod('body').text().toLowerCase();
        if (bodyText.includes('curved display') || bodyText.includes('curved screen') || fullName.toLowerCase().includes('edge') || fullName.toLowerCase().includes('curved')) {
            screenType = "Curved";
        } else if (bodyText.includes('2.5d')) {
            screenType = "2.5D";
        }

        // Normalize Notch Type — standardized values only
        // Priority order matters: most specific first
        const normalizeNotchType = (text) => {
            const t = (text || '').toLowerCase();
            // Dynamic Island (Apple pill)
            if (t.includes('dynamic island')) return 'Dynamic Island';
            // Dual Punch Hole (dual selfie cutout)
            if (t.includes('dual punch') || t.includes('dual hole') || t.includes('dual camera hole')) return 'Dual Punch Hole';
            // Punch Hole (single cutout IN the screen)
            if (t.includes('punch hole') || t.includes('punch-hole') || t.includes('hole-punch') ||
                t.includes('infinity-o') || t.includes('pinhole') || t.includes('pill-shaped')) return 'Punch Hole';
            // Waterdrop / Dewdrop / Teardrop (small V notch)
            if (t.includes('waterdrop') || t.includes('water drop') || t.includes('dewdrop') ||
                t.includes('teardrop') || t.includes('dot notch') || t.includes('dot-notch') ||
                t.includes('mini notch') || t.includes('mini-notch') || t.includes('drop notch') ||
                t.includes('small notch') || t.includes('tiny notch')) return 'Waterdrop';
            // U-Notch
            if (t.includes('u-shaped') || t.includes('u notch') || t.includes('u-notch') ||
                t.includes('μ-notch') || t.includes('u shape')) return 'U Notch';
            // Wide Notch (catch-all for any remaining "notch" mention)
            if (t.includes('wide notch') || t.includes('m-notch') || t.includes('notch')) return 'Wide Notch';
            // Pop-up / motorized / under-display = No Notch
            if (t.includes('pop-up') || t.includes('popup') || t.includes('elevating') ||
                t.includes('motorized') || t.includes('under-display') ||
                t.includes('under display camera') || t.includes('udc')) return 'No Notch';
            return null; // Unknown — will fallback below
        };

        // Build a comprehensive text from ALL relevant spec fields + full body
        const displayTypeText = $prod('[data-spec="displaytype"]').text();
        const displayResText = $prod('[data-spec="displayresolution"]').text();
        // GSMArena separates front camera into its own section — look in full spec table rows
        const allSpecRows = $prod('.specs-list td').map((i, el) => $prod(el).text()).get().join(' ');
        // Also check image alt text and full body as last resort
        const bodyFull = $prod('body').text();

        // Try in order: display spec → all spec rows → full body
        let notchType = normalizeNotchType(displayTypeText + ' ' + displayResText)
            || normalizeNotchType(allSpecRows)
            || normalizeNotchType(bodyFull)
            || 'Punch Hole'; // Safe default for modern smartphones

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
