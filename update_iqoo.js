
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// import fetch from 'node-fetch'; // Use global fetch in Node 18+

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHONES_DB_PATH = path.join(__dirname, 'public', 'phones.json');

const phones = JSON.parse(fs.readFileSync(PHONES_DB_PATH, 'utf-8'));

// Filter iQOO phones
const iqooPhones = phones.filter(p =>
    (p.brand && p.brand.toLowerCase() === 'iqoo') ||
    (p.model && p.model.toLowerCase().includes('iqoo'))
);

console.log(`Found ${iqooPhones.length} iQOO models to update.`);

// Function to update a single phone
async function updatePhone(modelName) {
    try {
        const url = `http://localhost:3000/api/search?model=${encodeURIComponent(modelName)}&force=true`;
        console.log(`Updating: ${modelName}...`);

        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to update ${modelName}: Server responded with ${response.status}`);
            return false;
        }

        const data = await response.json();
        console.log(`✓ Updated ${modelName}: ${data.height_mm}x${data.width_mm}mm`);
        return true;
    } catch (error) {
        console.error(`Error updating ${modelName}:`, error.message);
        return false;
    }
}

// Batch processing
const DELAY_MS = 3000; // 3 seconds delay to be polite to GSMArena

async function runBatch() {
    let successCount = 0;

    for (let i = 0; i < iqooPhones.length; i++) {
        const phone = iqooPhones[i];

        const success = await updatePhone(phone.model);
        if (success) successCount++;

        if (i < iqooPhones.length - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    console.log(`iQOO Update Complete. Successfully refreshed ${successCount}/${iqooPhones.length} models.`);
}

runBatch();
