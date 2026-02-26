import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHONES_DB_PATH = path.join(__dirname, 'public', 'phones.json');

const phones = JSON.parse(fs.readFileSync(PHONES_DB_PATH, 'utf-8'));

// Filter phones without images
const phonesNeedingImages = phones.filter(p => !p.image_url);

console.log(`Found ${phonesNeedingImages.length} phones without images.`);
console.log(`Total phones: ${phones.length}`);

// Function to update a single phone with image
async function updatePhoneImage(modelName) {
    try {
        const url = `http://localhost:3000/api/search?model=${encodeURIComponent(modelName)}&force=true`;
        console.log(`Fetching image for: ${modelName}...`);

        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to update ${modelName}: Server responded with ${response.status}`);
            return false;
        }

        const data = await response.json();
        if (data.image_url) {
            console.log(`✓ Got image for ${modelName}`);
            return true;
        } else {
            console.log(`⚠ No image found for ${modelName}`);
            return false;
        }
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

    for (let i = 0; i < phonesNeedingImages.length; i++) {
        const phone = phonesNeedingImages[i];

        const success = await updatePhoneImage(phone.model);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }

        // Progress indicator
        console.log(`Progress: ${i + 1}/${phonesNeedingImages.length} (${Math.round((i + 1) / phonesNeedingImages.length * 100)}%)`);

        if (i < phonesNeedingImages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    console.log('--------------------------------------------------');
    console.log(`Image Update Complete.`);
    console.log(`Successfully added images: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total processed: ${phonesNeedingImages.length}`);
    console.log('--------------------------------------------------');
}

if (phonesNeedingImages.length > 0) {
    console.log('Starting bulk image update...');
    console.log('WARNING: This will take approximately', Math.round(phonesNeedingImages.length * DELAY_MS / 1000 / 60), 'minutes.');
    console.log('Make sure the server is running on http://localhost:3000');
    console.log('--------------------------------------------------');

    runBatch();
} else {
    console.log('All phones already have images!');
}
