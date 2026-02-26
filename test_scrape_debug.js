import axios from 'axios';
import * as cheerio from 'cheerio';

async function testScrape() {
    const url = 'https://www.gsmarena.com/samsung_galaxy_s23_ultra-12024.php';
    console.log(`Fetching ${url}...`);
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        const $ = cheerio.load(response.data);

        // Check finding by text
        const body = $('body').text();
        console.log('Body length:', body.length);

        // Check specific selectors
        const resSpec = $('[data-spec="displayresolution"]');
        console.log('Selector [data-spec="displayresolution"]: ', resSpec.length, resSpec.text());

        // Dump all data-specs related to display
        console.log('--- Display Specs ---');
        $('[data-spec*="display"]').each((i, el) => {
            console.log($(el).attr('data-spec'), ':', $(el).text());
        });

    } catch (err) {
        console.error(err);
    }
}

testScrape();
