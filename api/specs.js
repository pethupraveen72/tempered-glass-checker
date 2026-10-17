// Display dimensions derived from the diagonal and pixel resolution. These are
// estimates: they assume the panel's aspect ratio matches its pixel ratio.
export function displayDimensions(resolution, screenSize) {
    const diagonal = parseFloat(String(screenSize ?? '').match(/([\d.]+)/)?.[1]);
    const resMatch = String(resolution ?? '').match(/(\d+)\s*x\s*(\d+)/);
    if (!resMatch || !Number.isFinite(diagonal) || diagonal <= 0) return { height: null, width: null };
    const widthPx = Math.min(parseInt(resMatch[1]), parseInt(resMatch[2]));
    const heightPx = Math.max(parseInt(resMatch[1]), parseInt(resMatch[2]));
    const diagonalPx = Math.sqrt(widthPx ** 2 + heightPx ** 2);
    if (!Number.isFinite(diagonalPx) || diagonalPx <= 0) return { height: null, width: null };
    return {
        height: parseFloat(((heightPx / diagonalPx) * diagonal * 25.4).toFixed(2)),
        width: parseFloat(((widthPx / diagonalPx) * diagonal * 25.4).toFixed(2)),
    };
}

const optionalFields = ['screen_type', 'notch_type', 'resolution', 'image_url', 'view360_url'];

// Builds the row to upsert. An upsert replaces the whole row, so every optional
// column the caller omits has to be carried over from the stored row: sending
// null for absent fields erased specifications, and a phone edited without its
// resolution lost its display dimensions and became permanently "needs
// verification". An explicitly submitted empty value is a deliberate "unknown"
// and does clear the stored value.
export function mergeStoredPhone(body, existing = {}, urls = {}) {
    const positiveOrNull = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
    const present = field => Object.prototype.hasOwnProperty.call(body, field);

    const phone = {
        model: body.model.trim(),
        brand: body.brand.trim() || 'Unknown',
        screen_size: Number(body.screen_size),
        height_mm: parseFloat(body.height_mm),
        width_mm: parseFloat(body.width_mm),
    };

    const submittedValue = {
        screen_type: body.screen_type || null,
        notch_type: body.notch_type || null,
        resolution: body.resolution || null,
        image_url: urls.image_url ?? null,
        view360_url: urls.view360_url ?? null,
    };
    for (const field of optionalFields) {
        phone[field] = present(field) ? submittedValue[field] : (existing[field] ?? null);
    }

    // A submitted display dimension wins. Otherwise a submitted resolution is
    // recalculated from, since changing it should update the estimate; a
    // resolution merely carried over from storage is not, so a stored value
    // that was measured or corrected by hand is not overwritten by an estimate.
    const derived = displayDimensions(phone.resolution, phone.screen_size);
    const fromResolution = present('resolution') ? derived : { height: null, width: null };
    phone.display_height_mm = positiveOrNull(body.display_height_mm) ?? fromResolution.height ?? existing.display_height_mm ?? derived.height ?? null;
    phone.display_width_mm = positiveOrNull(body.display_width_mm) ?? fromResolution.width ?? existing.display_width_mm ?? derived.width ?? null;

    return phone;
}

export const storedPhoneColumns = [...optionalFields, 'display_height_mm', 'display_width_mm'].join(', ');
