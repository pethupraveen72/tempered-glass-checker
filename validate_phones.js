import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHONES_DB_PATH = path.join(__dirname, 'public', 'phones.json');

async function validate() {
    try {
        const data = await fs.readFile(PHONES_DB_PATH, 'utf-8');
        const phones = JSON.parse(data);

        console.log(`Scanning ${phones.length} phones...`);

        let errors = 0;
        phones.forEach((p, index) => {
            if (!p.model || typeof p.model !== 'string') {
                console.error(`Index ${index}: Missing or invalid 'model'`, p);
                errors++;
            }
            if (!p.brand || typeof p.brand !== 'string') {
                console.error(`Index ${index}: Missing or invalid 'brand'`, p);
                errors++;
            }
            if (p.height_mm === undefined || typeof p.height_mm !== 'number') {
                console.error(`Index ${index}: Invalid 'height_mm'`, p);
                errors++;
            }
            if (p.width_mm === undefined || typeof p.width_mm !== 'number') {
                console.error(`Index ${index}: Invalid 'width_mm'`, p);
                errors++;
            }
            if (!p.screen_type || typeof p.screen_type !== 'string') {
                console.error(`Index ${index}: Invalid 'screen_type'`, p);
                errors++;
            }
        });

        if (errors === 0) {
            console.log('✅ All entries are valid.');
        } else {
            console.log(`❌ Found ${errors} invalid entries.`);
        }

    } catch (e) {
        console.error('JSON Parse Error or File Error:', e);
    }
}
validate();
