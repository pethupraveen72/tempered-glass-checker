import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHONES_DB_PATH = path.join(__dirname, 'public', 'phones.json');

const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

async function run() {
    try {
        console.log('Reading phones.json...');
        const data = await fs.readFile(PHONES_DB_PATH, 'utf-8');
        let phones = JSON.parse(data);
        const originalCount = phones.length;

        console.log(`Current items: ${originalCount}`);

        const uniquePhones = [];
        const seenModels = new Set();
        const seenNorms = new Set();

        phones.forEach(p => {
            const norm = normalize(p.model);
            if (!seenNorms.has(norm)) {
                seenNorms.add(norm);
                seenModels.add(p.model);
                uniquePhones.push(p);
            } else {
                console.log(`Duplicate removed: "${p.model}"`);
            }
        });

        console.log(`New items: ${uniquePhones.length}`);

        if (uniquePhones.length < originalCount) {
            await fs.writeFile(PHONES_DB_PATH, JSON.stringify(uniquePhones, null, 4));
            console.log('Saved cleaned phones.json');
        } else {
            console.log('No duplicates found.');
        }

    } catch (e) {
        console.error(e);
    }
}
run();
