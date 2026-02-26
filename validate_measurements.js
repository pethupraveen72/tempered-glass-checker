
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHONES_DB_PATH = path.join(__dirname, 'public', 'phones.json');

const phones = JSON.parse(fs.readFileSync(PHONES_DB_PATH, 'utf-8'));

console.log(`Checking ${phones.length} phones for missing measurements...`);

const missing = [];
phones.forEach(p => {
    // Check if height or width is missing, 0, or null
    if (!p.height_mm || p.height_mm <= 0 || !p.width_mm || p.width_mm <= 0) {
        missing.push({ model: p.model, height: p.height_mm, width: p.width_mm });
    }
});

if (missing.length > 0) {
    console.log(`Found ${missing.length} phones with missing/invalid dimensions:`);
    console.table(missing);
} else {
    console.log("All phones have valid Height and Width measurements.");
}
