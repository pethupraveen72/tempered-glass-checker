
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHONES_DB_PATH = path.join(__dirname, 'public', 'phones.json');

// Helper to calculate dimensions from diagonal inches and aspect ratio
function calculateScreenDims(inches, arRatio = 20 / 9) {
    if (!inches || isNaN(inches)) return { h: 0, w: 0 };

    // aspect ratio r = h/w  => h = r*w
    // diagonal^2 = h^2 + w^2 = (r*w)^2 + w^2 = w^2 * (r^2 + 1)
    // w = sqrt(d^2 / (r^2 + 1))

    // 1 inch = 25.4 mm
    const diagMm = inches * 25.4;

    // For phones, typically 'size' is diagonal.
    // Assuming Portrait orientation for height/width labels
    const w = Math.sqrt((diagMm * diagMm) / (arRatio * arRatio + 1));
    const h = arRatio * w;

    return {
        h: parseFloat(h.toFixed(1)),
        w: parseFloat(w.toFixed(1))
    };
}

async function run() {
    try {
        console.log('Reading phones.json...');
        const data = await fs.readFile(PHONES_DB_PATH, 'utf-8');
        let phones = JSON.parse(data);

        let updatedCount = 0;

        phones = phones.map(p => {
            // Only update if missing OR we want to augment everyone
            // Let's add specific "display_*" fields

            // Heuristic for Aspect Ratio:
            // iPhones: ~19.5:9
            // Old phones (16:9) -> check year? No year data.
            // Modern Androids: ~20:9
            // Foldables: Hard.

            let ar = 20 / 9;
            if (p.brand === 'Apple') ar = 19.5 / 9;
            if (p.brand === 'Samsung' && p.model.includes('Ultra')) ar = 19.3 / 9; // Approx

            const dims = calculateScreenDims(p.screen_size, ar);

            // Add new fields
            p.display_height_mm = dims.h;
            p.display_width_mm = dims.w;

            updatedCount++;
            return p;
        });

        console.log(`Updated ${updatedCount} phones with display measurements.`);

        await fs.writeFile(PHONES_DB_PATH, JSON.stringify(phones, null, 4));
        console.log('Saved phones.json');

    } catch (e) {
        console.error(e);
    }
}

run();
