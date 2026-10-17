// Catalogue rows can be edited, so a stored URL is treated as untrusted input
// before it reaches an iframe or a new tab.
export function safeHttpsUrl(value) {
  if (value == null || String(value).trim() === '') return null;
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch { return null; }
}
