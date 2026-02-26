
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHONES_DB_PATH = path.join(__dirname, 'public', 'phones.json');

const phones = JSON.parse(fs.readFileSync(PHONES_DB_PATH, 'utf-8'));
const initialCount = phones.length;

// Helper to clean model name for comparison
// Removes '5g', '4g', 'lte', 'uw', 'cdma', etc.
function getBaseModel(modelName) {
    return modelName.toLowerCase()
        .replace(/\s+5g$/i, '')
        .replace(/\s+4g$/i, '')
        .replace(/\s+lte$/i, '')
        .replace(/\s+uw$/i, '') // Ultra Wideband (Verizon)
        .replace(/\s+/g, ' ')
        .trim();
}

const groups = {};
const toRemoveIds = new Set();
const removalLog = [];

// 1. Group by reduced base name
phones.forEach((p, index) => {
    // Generate a unique ID if one doesn't exist (using index for temporary tracking)
    p._tempId = index;

    const key = `${p.brand.toLowerCase()}|${getBaseModel(p.model)}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
});

// 2. Analyze Groups
Object.keys(groups).forEach(key => {
    const group = groups[key];
    if (group.length < 2) return;

    // We have potential duplicates (e.g. "Galaxy S22" and "Galaxy S22 5G")
    // Use the first one as a 'Primary' candidate check
    // Logic: If dimensions are identical, keep the one with the specific name? 
    // Or Keep the shorter one?
    // User asked to remove "S22 5G" if "S22" exists? Or vice versa.
    // "Samsung Galaxy S22, Samsung Galaxy S22 5G" -> usually these are exactly the same phone.

    // Sort group: prefer keeping the one with MOST specs, or if equal, the one WITHOUT '5g' if user prefers shorter?
    // Let's assume we keep the first one found unless another is "better".
    // Actually, let's keep the one that seems "cleaner" or merge data.

    const primary = group[0];

    for (let i = 1; i < group.length; i++) {
        const candidate = group[i];

        // SAFETY CHECK: specific dimensions
        // If one is missing dimensions, we can assume it's a dupe/stub and remove it if the primary has them.
        // If both have dimensions, we must ensure they match.

        const h1 = primary.height_mm || 0;
        const w1 = primary.width_mm || 0;
        const h2 = candidate.height_mm || 0;
        const w2 = candidate.width_mm || 0;

        const hDiff = Math.abs(h1 - h2);
        const wDiff = Math.abs(w1 - w2);

        // Tolerance: 1.0mm
        const isDimensionMatch = (h1 === 0 || h2 === 0) || (hDiff < 1.0 && wDiff < 1.0);

        if (isDimensionMatch) {
            // It's a duplicate! Mark for removal.
            toRemoveIds.add(candidate._tempId);
            removalLog.push(`Removed "${candidate.model}" (Duplicate of "${primary.model}"). Dims: ${h2}x${w2} vs ${h1}x${w1}`);
        } else {
            console.log(`[Safety] Skipped "${candidate.model}" vs "${primary.model}" - Different sizes (${h2}x${w2} vs ${h1}x${w1})`);
        }
    }
});

// 3. Rebuild List
const cleanPhones = phones.filter(p => !toRemoveIds.has(p._tempId)).map(p => {
    delete p._tempId; // Clean up temp ID
    return p;
});

// 4. Save
if (toRemoveIds.size > 0) {
    fs.writeFileSync(PHONES_DB_PATH, JSON.stringify(cleanPhones, null, 4));
    console.log('--------------------------------------------------');
    console.log(removalLog.join('\n'));
    console.log('--------------------------------------------------');
    console.log(`Smart Deduplication Complete.`);
    console.log(`Original: ${initialCount}`);
    console.log(`Removed:  ${toRemoveIds.size}`);
    console.log(`Final:    ${cleanPhones.length}`);
} else {
    console.log('No suffix-based duplicates found with matching dimensions.');
}
