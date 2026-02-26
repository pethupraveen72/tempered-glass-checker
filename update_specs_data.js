import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHONES_DB_PATH = path.join(__dirname, 'public', 'phones.json');

const phones = JSON.parse(fs.readFileSync(PHONES_DB_PATH, 'utf-8'));

// Filter phones that need specs update (or update all to be safe? let's update all to get new text for screen type)
console.log(`Found ${phones.length} phones to update specs.`);

// Function to update a single phone
async function updatePhoneSpecs(modelName) {
    try {
        const url = `http://localhost:3000/api/search?model=${encodeURIComponent(modelName)}&force=true`;
        console.log(`Fetching specs for: ${modelName}...`);

        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to update ${modelName}: Server responded with ${response.status}`);
            return false;
        }

        const data = await response.json();
        // Log what we found
        console.log(`✓ Updated ${modelName}: Res: ${data.resolution || 'N/A'}, AR: ${data.aspect_ratio || 'N/A'}, Type: ${data.screen_type}`);
        return true;
    } catch (error) {
        console.error(`Error updating ${modelName}:`, error.message);
        return false;
    }
}

// Batch processing
const DELAY_MS = 3000; // 3 seconds delay

async function runBatch() {
    let successCount = 0;
    let failCount = 0;

    // Process all phones, or maybe just a subset if user wants test
    // Let's do all, but it will take time. 
    // Maybe checking if resolution is missing?

    const targetPhones = phones.filter(p => !p.resolution || !p.aspect_ratio || !p.screen_type || p.screen_type === 'Flat');
    // Re-check flat phones too in case they are 2.5D

    console.log(`Targeting ${targetPhones.length} phones for update.`);

    for (let i = 0; i < targetPhones.length; i++) {
        const phone = targetPhones[i];

        const success = await updatePhoneSpecs(phone.model);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }

        // Progress indicator
        console.log(`Progress: ${i + 1}/${targetPhones.length} (${Math.round((i + 1) / targetPhones.length * 100)}%)`);

        if (i < targetPhones.length - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    console.log('--------------------------------------------------');
    console.log(`Specs Update Complete.`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log('--------------------------------------------------');
}

if (phones.length > 0) {
    console.log('Starting bulk specs update...');
    console.log('Make sure the server is running on http://localhost:3000');
    console.log('--------------------------------------------------');

    runBatch();
} else {
    console.log('No phones in DB!');
}
