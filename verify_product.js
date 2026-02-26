import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
    try {
        const url = 'https://www.gsmarena.com/xiaomi_14-12626.php';
        console.log(`Fetching ${url}...`);
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const $ = cheerio.load(res.data);
        const name = $('.specs-phone-name-title').text().trim();
        const dim = $('[data-spec="dimensions"]').text();
        console.log('Name:', name);
        console.log('Dimensions:', dim);

        if (!name) console.log('Product page might be encrypted/blocked.');
    } catch (e) {
        console.error(e.message);
    }
}
run();
