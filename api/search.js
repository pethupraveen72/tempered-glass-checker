import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (Vercel injected environment variables)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper: Fetch phones index from GSMArena
async function fetchGSMArenaIndex() {
    // We use the new Cloudflare Worker to fetch the index as well to avoid IP bans on Vercel
    const cfWorkerUrl = process.env.VITE_CLOUDFLARE_WORKER_URL;
    if (!cfWorkerUrl) throw new Error("Missing Cloudflare Worker URL in Environment Variables.");

    const indexUrl = `${cfWorkerUrl}?url=${encodeURIComponent('https://www.gsmarena.com/quicksearch-8089.jpg')}`;
    const response = await fetch(indexUrl);
    if (!response.ok) throw new Error('GSMArena index block');

    const text = await response.text();

    try {
        // Try direct JSON parse first (current format)
        return JSON.parse(text);
    } catch (e) {
        // Fallback to regex if they switch back to the old JS variable format
        const match = text.match(/var\s+gsmd\s*=\s*(\[.*?\]);/s);
        if (match) return JSON.parse(match[1]);
        throw new Error('Failed to parse GSMArena index format');
    }
}

// Parsers
function parseDimensions(dimStr) {
    if (!dimStr) return null;
    const match = dimStr.match(/([\d.]+)\s*x\s*([\d.]+)/);
    if (match) return { height: parseFloat(match[1]), width: parseFloat(match[2]) };
    return null;
}

function parseScreenSize(sizeStr) {
    if (!sizeStr) return null;
    const match = sizeStr.match(/([\d.]+)\s*inches/);
    if (match) return parseFloat(match[1]);
    return null;
}

async function getScreenTypeFromKimovil(brand, fullName) {
    // Basic fallback logic for Vercel
    return null;
}

async function detectNotchType($prod, brand, fullName) {
    const fn = fullName.toLowerCase();
    const b = (brand || '').toLowerCase();

    // 1. Known Models
    if (fn.includes('iphone 14 pro') || fn.includes('iphone 15') || fn.includes('iphone 16')) return 'Dynamic Island';
    if (fn.includes('iphone') && !fn.includes('se')) return 'Wide Notch';
    if (fn.includes('fold') || String(fn).match(/z fold/)) return 'Punch Hole';

    // 2. GSMArena Text
    const displayRes = $prod('[data-spec="displayresolution"]').text().toLowerCase();
    const displayType = $prod('[data-spec="displaytype"]').text().toLowerCase();
    const metaDesc = $prod('meta[name="Description"]').attr('content') || '';
    const descText = metaDesc.toLowerCase();

    if (descText.includes('punch hole') || displayRes.includes('punch hole') || displayType.includes('punch hole') || descText.match(/(\d+)mp.+punch/)) return 'Punch Hole';
    if (descText.includes('water drop') || displayRes.includes('waterdrop') || descText.includes('tear drop') || descText.includes('dewdrop')) return 'Waterdrop';
    if (descText.includes('dynamic island')) return 'Dynamic Island';

    return 'Punch Hole';
}

export default async function handler(req, res) {
    const { model, force } = req.query;

    if (!model) {
        return res.status(400).json({ error: 'Model query parameter is required' });
    }

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log(`[Search-API] Processing request for: ${model}`);

    try {
        // --- 1. LOCAL SUPABASE LOOKUP ---
        if (force !== 'true') {
            const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
            const queryNorm = normalize(model);

            // Note: Since Vercel wakes up, we can't fetch ALL phones into memory easily inside the function limit.
            // But we can query Supabase directly for a fuzzy match
            const { data, error } = await supabase
                .from('phones')
                .select('*');

            if (!error && data) {
                const cached = data.find(p => normalize(p.model) === queryNorm);
                if (cached) {
                    console.log(`[Search-API] Cache hit → returning from Supabase DB.`);
                    return res.status(200).json(cached);
                }
            }
        }

        // --- 2. INDEX LOOKUP ---
        console.log('[Search-API] Checking GSMArena index...');
        const indexData = await fetchGSMArenaIndex();

        let brandsMap = {};
        indexData[0].forEach(b => { brandsMap[b[0]] = b[1]; });

        const candidates = indexData[1].filter(item => {
            const brandId = item[0];
            const phoneName = item[2];
            const brandName = brandsMap[brandId] || '';
            const fullName = `${brandName} ${phoneName}`.toLowerCase();
            return fullName.includes(model.toLowerCase().trim());
        });

        if (candidates.length === 0) {
            return res.status(404).json({ error: 'Not found in GSMArena index' });
        }

        const queryFlat = model.toLowerCase().trim();
        candidates.sort((a, b) => {
            const fullNameA = `${brandsMap[a[0]] || ''} ${a[2]}`.toLowerCase();
            const fullNameB = `${brandsMap[b[0]] || ''} ${b[2]}`.toLowerCase();
            if (fullNameA === queryFlat) return -1;
            if (fullNameB === queryFlat) return 1;
            return Math.abs(fullNameA.length - queryFlat.length) - Math.abs(fullNameB.length - queryFlat.length);
        });

        const bestMatch = candidates[0];
        const bestBrand = brandsMap[bestMatch[0]] || 'Unknown';
        const fullName = `${bestBrand} ${bestMatch[2]}`;
        const phoneId = bestMatch[1];

        // --- 3. SCRAPER LOGIC (CLOUDFLARE WORKER) ---
        let productUrl = `https://www.gsmarena.com/a-${phoneId}.php`;
        const cfWorkerUrl = process.env.VITE_CLOUDFLARE_WORKER_URL;

        if (!cfWorkerUrl) {
            throw new Error("Missing Cloudflare Worker URL in Environment Variables.");
        }

        const scraperUrl = `${cfWorkerUrl}?url=${encodeURIComponent(productUrl)}`;

        console.log(`[Search-API] Scraping via Cloudflare Worker: ${fullName}`);
        const scraperRes = await fetch(scraperUrl);
        if (!scraperRes.ok) throw new Error(`Cloudflare Proxy Error HTTP ${scraperRes.status}`);
        const html = await scraperRes.text();

        const $prod = cheerio.load(html);
        const extractedBrand = $prod('.specs-phone-name-title').text().trim().split(' ')[0] || bestBrand;

        // Parsing
        const dimText = $prod('[data-spec="dimensions"]').text();
        const dims = parseDimensions(dimText);
        const sizeText = $prod('[data-spec="displaysize"]').text();
        const screenSize = parseScreenSize(sizeText);

        if (!dims || !screenSize) throw new Error('Specs incomplete on page');

        const resolutionText = $prod('[data-spec="displayresolution"]').text();
        let resolution = "";
        if (resolutionText) resolution = resolutionText.split(',')[0].trim();

        let screenType = "Flat";
        const bodyText = $prod('body').text().toLowerCase();
        if (bodyText.includes('curved display') || fullName.toLowerCase().includes('edge')) screenType = "Curved";
        else if (bodyText.includes('2.5d')) screenType = "2.5D";

        const notchType = await detectNotchType($prod, extractedBrand, fullName);

        let imageUrl = null;
        const imgElement = $prod('.specs-photo-main img');
        if (imgElement.length > 0) {
            imageUrl = imgElement.attr('src');
            if (imageUrl && !imageUrl.startsWith('http')) imageUrl = `https://www.gsmarena.com/${imageUrl}`;
        }

        // Display Dimensions calculation
        let displayHeightMm = null, displayWidthMm = null;
        if (resolution && screenSize) {
            const resMatch = resolution.match(/(\d+)\s*x\s*(\d+)/);
            if (resMatch) {
                const w_px = parseInt(resMatch[1]);
                const h_px = parseInt(resMatch[2]);
                const widthPx = Math.min(w_px, h_px);
                const heightPx = Math.max(w_px, h_px);
                const diagonalPx = Math.sqrt(Math.pow(widthPx, 2) + Math.pow(heightPx, 2));
                if (!isNaN(diagonalPx) && diagonalPx > 0) {
                    const heightIn = (heightPx / diagonalPx) * screenSize;
                    const widthIn = (widthPx / diagonalPx) * screenSize;
                    displayHeightMm = parseFloat((heightIn * 25.4).toFixed(2));
                    displayWidthMm = parseFloat((widthIn * 25.4).toFixed(2));
                }
            }
        }

        const newPhone = {
            model: fullName,
            brand: extractedBrand,
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

        // --- 4. INSERT INTO SUPABASE ---
        const { error: insertError } = await supabase
            .from('phones')
            .upsert([newPhone], { onConflict: 'model' });

        if (insertError) {
            console.error("[Search-API] Supabase Insert Error:", insertError);
            // Return successfully even if insert fails so UX isn't broken
        } else {
            console.log(`[Search-API] Saved ${fullName} to Supabase!`);
        }

        return res.status(200).json(newPhone);

    } catch (err) {
        console.error('[Search-API] Fatal Error:', err.message);
        return res.status(500).json({ error: 'Internal failure', details: err.message });
    }
}
