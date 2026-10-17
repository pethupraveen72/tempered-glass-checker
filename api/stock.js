import { supabase, supabaseAdmin, manualEntryToken, applyCors } from './config.js';

const glassTypes = ['Type A', 'Type B', 'Type C'];
// Reported to the client so it can tell "not set up yet" apart from a failure
// and fall back to browser-stored measurements.
const missingTableCodes = new Set(['42P01', 'PGRST205', 'PGRST204']);

function tokenMatches(provided) {
    if (typeof provided !== 'string' || provided.length !== manualEntryToken.length) return false;
    let mismatch = 0;
    for (let i = 0; i < provided.length; i += 1) mismatch |= provided.charCodeAt(i) ^ manualEntryToken.charCodeAt(i);
    return mismatch === 0;
}

const positive = value => (typeof value === 'string' || typeof value === 'number') && Number.isFinite(Number(value)) && Number(value) > 0;
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;

// Returns the row to store, or a string describing why the item is unusable.
export function validateStockItem(item, index) {
    const where = `item ${index + 1}`;
    if (!item || typeof item !== 'object') return `${where}: not an object`;
    if (!text(item.sku)) return `${where}: a SKU or box label is required`;
    if (!glassTypes.includes(item.glass_type)) return `${where}: glass_type must be one of ${glassTypes.join(', ')}`;
    if (!positive(item.height_mm) || !positive(item.width_mm)) return `${where}: height_mm and width_mm must be positive numbers in millimetres`;
    if (item.thickness_mm != null && String(item.thickness_mm).trim() !== '' && !positive(item.thickness_mm)) return `${where}: thickness_mm must be a positive number when given`;
    const quantity = item.quantity == null || String(item.quantity).trim() === '' ? 0 : Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) return `${where}: quantity must be a whole number of zero or more`;

    return {
        sku: text(item.sku),
        label: text(item.label),
        source_model: text(item.source_model),
        source_brand: text(item.source_brand),
        glass_type: item.glass_type,
        height_mm: Number(item.height_mm),
        width_mm: Number(item.width_mm),
        thickness_mm: positive(item.thickness_mm) ? Number(item.thickness_mm) : null,
        quantity,
        supplier: text(item.supplier),
        shelf: text(item.shelf),
        notes: text(item.notes),
    };
}

export default async function handler(req, res) {
    if (applyCors(req, res, 'GET, POST, DELETE')) return res.status(204).end();

    // Whether a method is supported does not depend on configuration, so it is
    // settled before anything else.
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (req.method === 'GET') {
        if (!supabase) return res.status(503).json({ error: 'Online database is not configured' });
        const { data, error } = await supabase.from('glass_stock').select('*').order('sku', { ascending: true });
        if (error) {
            if (missingTableCodes.has(error.code)) {
                return res.status(503).json({ error: 'The glass_stock table does not exist yet', setupRequired: true, migration: 'migrations/001_glass_stock.sql' });
            }
            console.error('[Stock-API] Read failed:', error.message);
            return res.status(500).json({ error: 'Unable to read stock', details: error.message });
        }
        return res.status(200).json({ items: data || [] });
    }

    // Writes are operator actions, guarded by the same shared secret as manual
    // phone entry. Authorisation is settled before the database is touched.
    if (!manualEntryToken) return res.status(503).json({ error: 'Stock editing is disabled: MANUAL_ENTRY_TOKEN is not configured' });
    if (!tokenMatches(req.headers?.['x-admin-token'])) return res.status(401).json({ error: 'A valid admin token is required to edit stock' });
    if (!supabase) return res.status(503).json({ error: 'Online database is not configured' });

    if (req.method === 'DELETE') {
        const sku = typeof req.query?.sku === 'string' ? req.query.sku.trim() : '';
        if (!sku) return res.status(400).json({ error: 'A sku query parameter is required' });
        const { error } = await supabaseAdmin.from('glass_stock').delete().eq('sku', sku);
        if (error) {
            console.error('[Stock-API] Delete failed:', error.message);
            return res.status(500).json({ error: 'Unable to delete the stock item', details: error.message });
        }
        return res.status(200).json({ success: true, sku });
    }

    const body = req.body || {};
    const submitted = Array.isArray(body.items) ? body.items : Array.isArray(body) ? body : [body];
    if (!submitted.length) return res.status(400).json({ error: 'No stock items were submitted' });
    if (submitted.length > 200) return res.status(400).json({ error: 'Submit at most 200 stock items per request' });

    const rows = [];
    const problems = [];
    submitted.forEach((item, index) => {
        const result = validateStockItem(item, index);
        if (typeof result === 'string') problems.push(result);
        else rows.push(result);
    });
    // All or nothing, so a bulk entry never half-saves.
    if (problems.length) return res.status(400).json({ error: 'Some stock items are invalid', problems });

    const seen = new Set();
    for (const row of rows) {
        if (seen.has(row.sku)) return res.status(400).json({ error: `The SKU "${row.sku}" appears more than once in this submission` });
        seen.add(row.sku);
    }

    const { data, error } = await supabaseAdmin.from('glass_stock').upsert(rows, { onConflict: 'sku' }).select();
    if (error) {
        if (missingTableCodes.has(error.code)) {
            return res.status(503).json({ error: 'The glass_stock table does not exist yet', setupRequired: true, migration: 'migrations/001_glass_stock.sql' });
        }
        console.error('[Stock-API] Write failed:', error.message);
        return res.status(500).json({ error: 'Unable to save stock', details: error.message });
    }

    console.log(`[Stock-API] Saved ${rows.length} stock item(s).`);
    return res.status(200).json({ success: true, saved: rows.length, items: data || [] });
}
