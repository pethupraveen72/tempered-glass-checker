import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body;

        // Clean up data types before inserting to Postgres numeric fields
        const newPhone = {
            model: body.model.trim(),
            brand: body.brand.trim() || 'Unknown',
            screen_size: body.screen_size || null,
            height_mm: body.height_mm ? parseFloat(body.height_mm) : null,
            width_mm: body.width_mm ? parseFloat(body.width_mm) : null,
            screen_type: body.screen_type || 'Flat',
            notch_type: body.notch_type || 'Punch Hole',
            resolution: body.resolution || null,
            image_url: body.image_url || null,
            view360_url: body.view360_url || null,  // fix: was missing from payload
        };

        if (!newPhone.model || !newPhone.height_mm || !newPhone.width_mm) {
            return res.status(400).json({ success: false, error: 'Model, Height, and Width are required' });
        }

        // Calculate display dimensions if resolution is provided 
        if (newPhone.resolution && newPhone.screen_size) {
            const resMatch = newPhone.resolution.match(/(\d+)\s*x\s*(\d+)/);
            if (resMatch) {
                const w_px = parseInt(resMatch[1]);
                const h_px = parseInt(resMatch[2]);
                const widthPx = Math.min(w_px, h_px);
                const heightPx = Math.max(w_px, h_px);

                // Parse screen size float safely
                const diagStr = String(newPhone.screen_size).match(/([\d.]+)/);
                if (diagStr) {
                    const diagonalIn = parseFloat(diagStr[1]);
                    const diagonalPx = Math.sqrt(Math.pow(widthPx, 2) + Math.pow(heightPx, 2));

                    if (!isNaN(diagonalPx) && diagonalPx > 0) {
                        const heightIn = (heightPx / diagonalPx) * diagonalIn;
                        const widthIn = (widthPx / diagonalPx) * diagonalIn;
                        newPhone.display_height_mm = parseFloat((heightIn * 25.4).toFixed(2));
                        newPhone.display_width_mm = parseFloat((widthIn * 25.4).toFixed(2));
                    }
                }
            }
        }

        console.log(`[Manual-Entry] Saving ${newPhone.model} to Supabase...`);

        const { error } = await supabase
            .from('phones')
            .upsert([newPhone], { onConflict: 'model' });

        if (error) {
            console.error('[Manual-Entry] Database Error:', error);
            return res.status(500).json({ success: false, error: 'Database write failed', details: error.message });
        }

        return res.status(200).json({ success: true, phone: newPhone });

    } catch (err) {
        console.error('[Manual-Entry] Fatal Error:', err);
        return res.status(500).json({ success: false, error: 'Internal failure', details: err.message });
    }
}
