
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const phones = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'phones.json'), 'utf-8'));

console.log(`Auditing ${phones.length} phones for Screen Type anomalies...`);

const suspicious = [];

phones.forEach(p => {
    const name = p.model.toLowerCase();
    const isCurved = p.screen_type === 'Curved';
    const isFlat = p.screen_type === 'Flat';

    // Rule 1: "Edge" usually implies Curved
    if (name.includes('edge') && isFlat) {
        // Exception: Moto Edge 20 Lite might be flat? No, usually edge is curved.
        // Actually recent Moto Edge 40/50 neo might be curved.
        suspicious.push({ model: p.model, reason: 'Name has "Edge" but marked Flat' });
    }

    // Rule 2: "Curved" flagships usually have Pro/Ultra/+
    // If a phone is "Curved" but doesn't have "pro", "ultra", "plus", "+", "edge", "limit"
    if (isCurved) {
        const keywords = ['pro', 'ultra', 'plus', '+', 'edge', 'max', 'curved', 'fold', 'flip', 'mix', 'nex', 'find x', 'x50', 'x60', 'x70', 'x80', 'x90', 'x100'];
        const hasKeyword = keywords.some(k => name.includes(k));

        // Exclude specific known curved base models (like older Galaxies S8/S9)
        const isOldSamsungCurved = (p.brand === 'Samsung' && (name.includes('s8') || name.includes('s9') || name.includes('s10') || name.includes('note 8') || name.includes('note 9')));

        // Exclude modern curved series
        const isReno = name.includes('reno');
        const isVivoV = name.includes('vivo v') || name.includes('vivo t2 pro');
        const isRealmeGT = name.includes('realme gt');
        const isHonor = p.brand === 'Honor';
        const isXiaomiCivi = name.includes('civi');
        const isElephone = p.brand === 'Elephone';

        if (!hasKeyword && !isOldSamsungCurved && !isReno && !isVivoV && !isRealmeGT && !isHonor && !isXiaomiCivi && !isElephone) {
            suspicious.push({ model: p.model, reason: 'Marked Curved but lacks typical curved keywords' });
        }
    }
});

console.log(`Found ${suspicious.length} suspicious entries.`);
if (suspicious.length > 0) {
    console.table(suspicious);
} else {
    console.log("No obvious anomalies found.");
}
