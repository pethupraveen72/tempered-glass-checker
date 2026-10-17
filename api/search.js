import * as cheerio from 'cheerio';
import bundledIndex from '../public/fallback_index.json' with { type: 'json' };
import { supabase, workerUrl, applyCors, proxied, safeHttpsUrl } from './config.js';
import { displayDimensions } from './specs.js';

// Model-specific corrections for pages whose markup does not state the spec.
// Prefer adding a row here over editing the detection logic.
const specOverrides = [
    { match: /poco c/i, screen_type: 'Flat', notch_type: 'Waterdrop' },
];

// GSMArena versions this filename on every deploy, so read the current one from
// the homepage and keep the last known value only as a fallback.
let cachedIndexUrl = null;
async function resolveIndexUrl() {
    if (cachedIndexUrl) return cachedIndexUrl;
    try {
        const response = await fetch(proxied('https://www.gsmarena.com/'));
        if (response.ok) {
            const match = (await response.text()).match(/quicksearch-\d+\.jpg/);
            if (match) {
                cachedIndexUrl = `https://www.gsmarena.com/${match[0]}`;
                return cachedIndexUrl;
            }
        }
    } catch (error) {
        console.error('[Search-API] Index URL discovery failed:', error.message);
    }
    return 'https://www.gsmarena.com/quicksearch-8089.jpg';
}

// Helper: Fetch phones index from GSMArena
async function fetchGSMArenaIndex() {
    // We use the Cloudflare Worker to fetch the index as well to avoid IP bans on Vercel
    const response = await fetch(proxied(await resolveIndexUrl()));
    if (!response.ok) throw new Error('GSMArena index block');

    const text = await response.text();

    try {
        // Try direct JSON parse first (current format)
        return JSON.parse(text);
    } catch {
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

const normalizeModel = str => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Queries only plausible rows. Selecting the whole table silently stopped
// finding cache hits once the catalogue passed the server's row cap.
async function cachedPhone(model) {
    const queryNorm = normalizeModel(model);
    const escape = term => term.replace(/[\\%_]/g, character => '\\' + character);
    const terms = model.trim().toLowerCase().split(/\s+/).filter(Boolean);
    // A run-together query ("realme16pro") still matches "Realme 16 Pro" once
    // split on letter/digit boundaries, which the old full-table scan handled
    // by normalising every row.
    const split = model.trim().toLowerCase()
        .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2')
        .split(/\s+/).filter(Boolean);

    for (const attempt of [terms, split]) {
        if (!attempt.length) continue;
        let query = supabase.from('phones').select('*');
        for (const term of attempt) query = query.ilike('model', `%${escape(term)}%`);
        const { data, error } = await query.limit(50);
        if (error) {
            console.error('[Search-API] Cache query failed:', error.message);
            return null;
        }
        const hit = data?.find(phone => normalizeModel(phone.model) === queryNorm);
        if (hit) return hit;
    }
    return null;
}

async function fetchKimovilScreenType(fullName) {
    try {
        const slug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const res = await fetch(proxied(`https://www.kimovil.com/en/where-to-buy-${slug}`));
        if (!res.ok) return null;
        const html = await res.text();
        const $ = cheerio.load(html);

        let text = "";
        $("dt:contains('Screen'), dt:contains('Design'), td:contains('Screen')").each((i, el) => {
            text += $(el).parent().text().replace(/\s+/g, ' ').trim().toLowerCase() + " ";
        });

        if (text) {
            if (text.includes("curved") || text.includes("dual edge")) return "Curved";
            if (text.includes("2.5d") || text.includes("2.5 d")) return "2.5D";
            if (text.includes("flat")) return "Flat";
        }
        return null;
    } catch (e) {
        console.error("[Search-API] Kimovil fetch error:", e.message);
        return null;
    }
}

async function fetchSmartprixNotchType(fullName) {
    try {
        const res = await fetch(proxied(`https://www.smartprix.com/mobiles?q=${encodeURIComponent(fullName)}`));
        if (!res.ok) return null;
        const searchHtml = await res.text();
        const $s = cheerio.load(searchHtml);

        let targetPath = null;
        const searchTerms = fullName.toLowerCase().split(" ").filter(t => t.length > 2);

        $s(".sm-product").each((i, el) => {
            if (!targetPath) {
                const name = $s(el).find("h2").text().toLowerCase().trim();
                const escapedModel = fullName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const strictRegex = new RegExp(`\\b${escapedModel}\\b`, "i");

                const isMatch = Math.abs(name.length - fullName.length) < 15 && searchTerms.every(term => name.includes(term));

                if (strictRegex.test(name) || isMatch) {
                    targetPath = $s(el).find("a").attr("href");
                }
            }
        });

        if (!targetPath) return null;

        const detailRes = await fetch(proxied(new URL(targetPath, 'https://www.smartprix.com').toString()));
        if (!detailRes.ok) return null;
        const detailHtml = await detailRes.text();
        const $d = cheerio.load(detailHtml);

        const notchText = ($d("td:contains('Notch')").next().text() || $d("td:contains('Punch Hole')").text() || "").toLowerCase();

        if (notchText.includes("punch hole")) return "Punch Hole";
        if (notchText.includes("water drop") || notchText.includes("waterdrop")) return "Waterdrop";
        if (notchText.includes("dynamic island")) return "Dynamic Island";
        if (notchText.includes("pop-up") || notchText.includes("popup")) return "Popup Camera";
        if (notchText.includes("yes")) return "Wide Notch";

        return null;
    } catch (e) {
        console.error("[Search-API] Smartprix fetch error:", e.message);
        return null;
    }
}

// Returns null when no source states the notch type. A guessed value is
// indistinguishable from a confirmed one and drives a hard compatibility
// verdict, so the absence has to survive into the stored record.
export function detectNotchType($prod, fullName) {
    const fn = fullName.toLowerCase();

    // 1. Known Models
    if (fn.includes('iphone 14 pro') || fn.includes('iphone 15') || fn.includes('iphone 16')) return 'Dynamic Island';
    if (fn.includes('iphone') && !fn.includes('se')) return 'Wide Notch';

    // 2. GSMArena Text
    const displayRes = $prod('[data-spec="displayresolution"]').text().toLowerCase();
    const displayType = $prod('[data-spec="displaytype"]').text().toLowerCase();
    const descText = ($prod('meta[name="Description"]').attr('content') || '').toLowerCase();

    if (descText.includes('punch hole') || displayRes.includes('punch hole') || displayType.includes('punch hole') || descText.match(/(\d+)mp.+punch/)) return 'Punch Hole';
    if (descText.includes('water drop') || displayRes.includes('waterdrop') || descText.includes('tear drop') || descText.includes('dewdrop') || descText.includes('dot drop') || descText.includes('v-notch') || descText.includes('u-notch')) return 'Waterdrop';
    if (descText.includes('dynamic island')) return 'Dynamic Island';

    return null;
}

export default async function handler(req, res) {
    if (applyCors(req, res, 'GET')) return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { model, force } = req.query;
    if (typeof model !== 'string' || !model.trim()) return res.status(400).json({ error: 'Model query parameter is required' });
    if (!supabase) return res.status(503).json({ error: 'Online database is not configured' });
    if (!workerUrl) return res.status(503).json({ error: 'Online lookup proxy is not configured' });

    console.log(`[Search-API] Processing request for: ${model}`);

    try {
        // --- 1. LOCAL SUPABASE LOOKUP ---
        if (force !== 'true') {
            const cached = await cachedPhone(model);
            if (cached) {
                console.log('[Search-API] Cache hit -> returning from Supabase DB.');
                return res.status(200).json(cached);
            }
        }

        // --- 2. INDEX LOOKUP ---
        console.log('[Search-API] Checking GSMArena index...');
        let indexData;
        try {
            indexData = await fetchGSMArenaIndex();
        } catch (error) {
            // The bundled index is stale but lets a lookup succeed when
            // GSMArena blocks the request outright.
            console.error('[Search-API] Live index unavailable, using bundled index:', error.message);
            indexData = bundledIndex;
        }

        let brandsMap = {};
        if (Array.isArray(indexData[0])) {
            indexData[0].forEach(b => { brandsMap[b[0]] = b[1]; });
        } else if (typeof indexData[0] === 'object') {
            brandsMap = indexData[0]; // The new format is a direct dictionary map
        }

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
        console.log(`[Search-API] Executing concurrent scraper tasks for: ${fullName}`);

        const [html, kimovilScreen, smartprixNotch] = await Promise.all([
            fetch(proxied(`https://www.gsmarena.com/a-${phoneId}.php`)).then(async r => {
                if (!r.ok) throw new Error(`GSMArena Proxy Error HTTP ${r.status}`);
                return r.text();
            }),
            fetchKimovilScreenType(fullName),
            fetchSmartprixNotchType(fullName)
        ]);

        const $prod = cheerio.load(html);
        const extractedBrand = $prod('.specs-phone-name-title').text().trim().split(' ')[0] || bestBrand;

        // Parsing
        const dims = parseDimensions($prod('[data-spec="dimensions"]').text());
        const screenSize = parseScreenSize($prod('[data-spec="displaysize"]').text());

        if (!dims || !screenSize) throw new Error('Specs incomplete on page');

        const resolutionText = $prod('[data-spec="displayresolution"]').text();
        const resolution = resolutionText ? resolutionText.split(',')[0].trim() : "";

        // Both stay null when nothing confirms them, so compatibility checks
        // report "needs verification" rather than acting on an assumption.
        let screenType = kimovilScreen;
        if (!screenType) {
            const bodyText = $prod('body').text().toLowerCase();
            if (bodyText.includes('curved display') || fullName.toLowerCase().includes('edge')) screenType = "Curved";
            else if (bodyText.includes('2.5d')) screenType = "2.5D";
            else if (bodyText.includes('flat display')) screenType = "Flat";
        }

        const notchType = smartprixNotch || detectNotchType($prod, fullName);

        const override = specOverrides.find(entry => entry.match.test(fullName));

        let imageUrl = $prod('.specs-photo-main img').attr('src') || null;
        if (imageUrl && !imageUrl.startsWith('http')) imageUrl = `https://www.gsmarena.com/${imageUrl}`;

        const display = displayDimensions(resolution, screenSize);

        const newPhone = {
            model: fullName,
            brand: extractedBrand,
            screen_size: screenSize,
            height_mm: dims.height,
            width_mm: dims.width,
            screen_type: override?.screen_type ?? screenType ?? null,
            notch_type: override?.notch_type ?? notchType ?? null,
            resolution: resolution,
            image_url: safeHttpsUrl(imageUrl) ?? null,
            display_height_mm: display.height,
            display_width_mm: display.width
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
