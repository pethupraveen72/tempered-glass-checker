// Stock lives in the database so it is shared across devices and staff, unlike
// the per-browser measurements. Every call reports whether the table exists yet
// so the interface can ask for the migration instead of showing an error.

async function parse(response) {
  try { return await response.json(); } catch { return {}; }
}

export async function loadStock(fetcher = fetch) {
  const response = await fetcher('/api/stock');
  const body = await parse(response);
  if (response.ok) return { items: body.items || [], setupRequired: false };
  if (body.setupRequired) return { items: [], setupRequired: true, migration: body.migration };
  throw new Error(body.error || 'Unable to load stock.');
}

export async function saveStock(items, token, fetcher = fetch) {
  const response = await fetcher('/api/stock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token || '' },
    body: JSON.stringify({ items }),
  });
  const body = await parse(response);
  if (response.ok) return body;
  // Per-item problems are reported together so a bulk entry can be corrected
  // in one pass rather than one row at a time.
  const detail = Array.isArray(body.problems) ? `${body.error}: ${body.problems.join('; ')}` : body.error;
  throw new Error(detail || 'Unable to save stock.');
}

export async function deleteStock(sku, token, fetcher = fetch) {
  const response = await fetcher(`/api/stock?sku=${encodeURIComponent(sku)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': token || '' },
  });
  const body = await parse(response);
  if (response.ok) return body;
  throw new Error(body.error || 'Unable to delete the stock item.');
}

export const emptyStockRow = () => ({
  sku: '', label: '', source_model: '', source_brand: '', glass_type: 'Type A',
  height_mm: '', width_mm: '', thickness_mm: '', quantity: '', supplier: '', shelf: '', notes: '',
});

// Mirrors the server's validation so a bulk entry can be checked before it is
// submitted. Returns a list of human-readable problems.
export function validateRows(rows) {
  const problems = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    const where = `Row ${index + 1}`;
    const positive = value => String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
    if (!String(row.sku || '').trim()) problems.push(`${where}: SKU or box label is required.`);
    else {
      const sku = row.sku.trim().toLowerCase();
      if (seen.has(sku)) problems.push(`${where}: the SKU "${row.sku.trim()}" is repeated.`);
      seen.add(sku);
    }
    if (!positive(row.height_mm)) problems.push(`${where}: height in mm is required.`);
    if (!positive(row.width_mm)) problems.push(`${where}: width in mm is required.`);
    if (String(row.thickness_mm || '').trim() !== '' && !positive(row.thickness_mm)) problems.push(`${where}: thickness must be a positive number.`);
    const quantity = String(row.quantity || '').trim();
    if (quantity !== '' && (!Number.isInteger(Number(quantity)) || Number(quantity) < 0)) problems.push(`${where}: quantity must be a whole number of zero or more.`);
    if (!['Type A', 'Type B', 'Type C'].includes(row.glass_type)) problems.push(`${where}: choose a glass type.`);
  });
  return problems;
}

// Rows pasted from a spreadsheet, as tab- or comma-separated columns:
// SKU, source model, type, height, width, thickness, quantity.
export function parsePastedRows(textBlock) {
  return String(textBlock || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const cells = line.includes('\t') ? line.split('\t') : line.split(',');
    const [sku, source_model, glass_type, height_mm, width_mm, thickness_mm, quantity] = cells.map(cell => cell.trim());
    const type = ['a', 'type a', 'clear'].includes(String(glass_type).toLowerCase()) ? 'Type A'
      : ['b', 'type b', 'full', 'full cover'].includes(String(glass_type).toLowerCase()) ? 'Type B'
        : ['c', 'type c', 'curved'].includes(String(glass_type).toLowerCase()) ? 'Type C'
          : glass_type || 'Type A';
    return { ...emptyStockRow(), sku: sku || '', source_model: source_model || '', glass_type: type, height_mm: height_mm || '', width_mm: width_mm || '', thickness_mm: thickness_mm || '', quantity: quantity || '' };
  });
}
