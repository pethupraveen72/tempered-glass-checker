import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
    try {
        const query = 'Samsung Galaxy S24 site:gsmarena.com';
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        console.log(`Searching DDG: ${url}`);

        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        const fs = await import('fs/promises');
        await fs.writeFile('ddg_debug.html', res.data);
        console.log('Saved ddg_debug.html');

        const $ = cheerio.load(res.data);
        // DDG HTML results usually have links in .result__a
        let firstLink = null;
        $('.result__a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('gsmarena.com') && !firstLink && !href.includes('google')) {
                firstLink = href;
            }
        });

        console.log('First Link:', firstLink);
    } catch (e) {
        console.error(e.message);
    }
}
run();
