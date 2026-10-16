export async function loadPhones(client, fetcher = fetch) {
  if (client) {
    try {
      const phones = [];
      // Continue until an empty page, including when the server caps page size.
      while (true) {
        const { data, error } = await client.from('phones').select('*')
          .order('model', { ascending: true }).range(phones.length, phones.length + 999);
        if (error) throw error;
        if (!data?.length) break;
        phones.push(...data);
      }
      if (phones.length) return { phones, offline: false };
    } catch { /* Use the bundled catalogue when the database is unreachable. */ }
  }
  const response = await fetcher('/phones.json');
  if (!response.ok) throw new Error('Unable to load the phone catalogue. Please retry.');
  const phones = await response.json();
  if (!Array.isArray(phones)) throw new Error('Invalid phone catalogue.');
  return { phones, offline: true };
}
