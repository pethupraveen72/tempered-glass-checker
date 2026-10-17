import { supabase, manualEntryToken, applyCors, safeHttpsUrl } from './config.js';
import { mergeStoredPhone, storedPhoneColumns } from './specs.js';

// Timing-safe enough for a short shared secret: compares every character.
function tokenMatches(provided) {
    if (typeof provided !== 'string' || provided.length !== manualEntryToken.length) return false;
    let mismatch = 0;
    for (let i = 0; i < provided.length; i += 1) mismatch |= provided.charCodeAt(i) ^ manualEntryToken.charCodeAt(i);
    return mismatch === 0;
}

export default async function handler(req, res) {
    if (applyCors(req, res, 'POST')) return res.status(204).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body || {};
        const positive = value => (typeof value === 'string' || typeof value === 'number') && Number.isFinite(Number(value)) && Number(value) > 0;
        if (typeof body.model !== 'string' || !body.model.trim() || typeof body.brand !== 'string' || !body.brand.trim() ||
            !positive(body.height_mm) || !positive(body.width_mm) || !positive(body.screen_size)) {
            return res.status(400).json({ success: false, error: 'Model, brand and positive height, width and screen size are required' });
        }
        if (body.resolution != null && typeof body.resolution !== 'string') {
            return res.status(400).json({ success: false, error: 'Resolution must be text' });
        }
        const imageUrl = safeHttpsUrl(body.image_url);
        const view360Url = safeHttpsUrl(body.view360_url);
        // These are rendered in an iframe and opened in new tabs, so a non-https
        // or unparseable URL is rejected rather than stored.
        if (imageUrl === undefined || view360Url === undefined) {
            return res.status(400).json({ success: false, error: 'Image and 360° URLs must be absolute https links' });
        }

        // Writes are refused unless a shared secret is configured and supplied,
        // so the endpoint cannot be used to edit the catalogue anonymously.
        if (!manualEntryToken) {
            return res.status(503).json({ success: false, error: 'Manual entry is disabled: MANUAL_ENTRY_TOKEN is not configured' });
        }
        if (!tokenMatches(req.headers?.['x-admin-token'])) {
            return res.status(401).json({ success: false, error: 'A valid admin token is required to save phone specifications' });
        }
        if (!supabase) return res.status(503).json({ success: false, error: 'Online database is not configured' });

        // Read the stored row first so an edit cannot erase the columns this
        // request does not carry.
        const { data: stored } = await supabase
            .from('phones')
            .select(storedPhoneColumns)
            .eq('model', body.model.trim())
            .maybeSingle();

        const newPhone = mergeStoredPhone(body, stored || {}, { image_url: imageUrl, view360_url: view360Url });

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
