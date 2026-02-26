import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHONES_DB_PATH = path.join(__dirname, 'public', 'phones.json');

const phones = JSON.parse(fs.readFileSync(PHONES_DB_PATH, 'utf-8'));

let updatedCount = 0;

phones.forEach(phone => {
    // Only calculate if missing or if we want to force update (optional)
    // For now, let's update if resolution and screen_size exist
    if (phone.resolution && phone.screen_size && (!phone.display_height_mm || !phone.display_width_mm)) {

        // Parse resolution: "1264 x 2780 pixels (~450 ppi density)"
        const resMatch = phone.resolution.match(/(\d+)\s*x\s*(\d+)/);
        if (resMatch) {
            const w_px = parseInt(resMatch[1]); // usually smaller number
            const h_px = parseInt(resMatch[2]); // usually larger number

            // Ensure width is smaller than height for standard phone orientation
            const widthPx = Math.min(w_px, h_px);
            const heightPx = Math.max(w_px, h_px);

            const diagonalIn = parseFloat(phone.screen_size);

            if (!isNaN(widthPx) && !isNaN(heightPx) && !isNaN(diagonalIn)) {
                // Calculate diagonal in pixels
                const diagonalPx = Math.sqrt(Math.pow(widthPx, 2) + Math.pow(heightPx, 2));

                // Calculate dimensions in inches
                const heightIn = (heightPx / diagonalPx) * diagonalIn;
                const widthIn = (widthPx / diagonalPx) * diagonalIn;

                // Convert to mm (1 inch = 25.4 mm)
                const heightMm = heightIn * 25.4;
                const widthMm = widthIn * 25.4;

                phone.display_height_mm = parseFloat(heightMm.toFixed(2));
                phone.display_width_mm = parseFloat(widthMm.toFixed(2));

                // Cleanup: Remove unused aspect_ratio field
                if (phone.aspect_ratio) {
                    delete phone.aspect_ratio;
                }

                console.log(`Updated ${phone.model}: ${phone.display_width_mm}mm x ${phone.display_height_mm}mm`);
                updatedCount++;
            }
        }
    }
});

if (updatedCount > 0) {
    fs.writeFileSync(PHONES_DB_PATH, JSON.stringify(phones, null, 4));
    console.log(`Successfully updated ${updatedCount} phones with display dimensions.`);
} else {
    console.log('No phones needed updates.');
}
