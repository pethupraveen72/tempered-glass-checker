import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// The keys provided by the user (now required via env or CLI)
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jxbrxiiijbrwjkdewsxy.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateData() {
    try {
        console.log('Reading local phones.json...');
        const rawData = fs.readFileSync('./public/phones.json', 'utf8');
        const phones = JSON.parse(rawData);

        console.log(`Found ${phones.length} phones to migrate.`);

        // Clean data if necessary and insert
        // Some old phones might not have all fields, but the DB allows nulls
        const formattedPhones = phones.map(p => ({
            model: p.model,
            brand: p.brand,
            screen_size: p.screen_size || null,
            height_mm: p.height_mm ? parseFloat(p.height_mm) : null,
            width_mm: p.width_mm ? parseFloat(p.width_mm) : null,
            display_height_mm: p.display_height_mm ? parseFloat(p.display_height_mm) : null,
            display_width_mm: p.display_width_mm ? parseFloat(p.display_width_mm) : null,
            resolution: p.resolution || null,
            screen_type: p.screen_type || 'Flat',
            notch_type: p.notch_type || 'Punch Hole',
            image_url: p.image_url || null,
            view360_url: p.view360_url || null
        }));

        console.log('Uploading ' + formattedPhones.length + ' phones to Supabase...');

        const { data, error } = await supabase
            .from('phones')
            .upsert(formattedPhones, { onConflict: 'model' });

        if (error) {
            console.error('Migration failed:', error);
            process.exit(1);
        }

        console.log('Migration successful! ✅');
        console.log('All local phones are now in the cloud database.');

    } catch (err) {
        console.error('Script Error:', err);
    }
}

migrateData();
