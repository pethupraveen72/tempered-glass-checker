import axios from 'axios';

async function run() {
    try {
        // From gsm_debug.html: AUTOCOMPLETE_LIST_URL = "/quicksearch-81821.jpg";
        // Note: The hash 81821 might change, so in production we should scrape it from home page.
        // But for now let's test this specific URL.
        const url = 'https://www.gsmarena.com/quicksearch-81821.jpg';
        console.log(`Fetching ${url}...`);

        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        console.log('Status:', res.status);
        console.log('Type:', typeof res.data);
        if (typeof res.data === 'object') {
            const keys = Object.keys(res.data); // It might be an array
            console.log('First item structure:', JSON.stringify(res.data[0], null, 2));
            console.log('Second item structure:', JSON.stringify(res.data[1], null, 2));

            // Search for "Nothing" in it
            const matches = res.data.filter(item => {
                const str = JSON.stringify(item).toLowerCase();
                return str.includes('nothing');
            });
            console.log('Matches for "nothing":', JSON.stringify(matches, null, 2));
        } else {
            console.log('Content (first 500 chars):', res.data.substring(0, 500));
        }

    } catch (e) {
        console.error(e.message);
    }
}
run();
