import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
    try {
        // Xiaomi 14 ID is 12626
        const url = 'https://www.gsmarena.com/garbage_slug-12626.php';
        console.log(`Fetching ${url}...`);
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        const $ = cheerio.load(res.data);
        const name = $('.specs-phone-name-title').text().trim();
        console.log('Result Name:', name);

        if (name === 'Xiaomi 14') console.log('SUCCESS: ID works with garbage slug!');
        else console.log('FAILURE: Name mismatch or redirect.');
    } catch (e) {
        console.error(e.message);
    }
}
run();
