import axios from 'axios';
import * as cheerio from 'cheerio';

const SCRAPE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/'
};

async function testKimovil(brand, model) {
    const slug = `${brand}-${model}`.toLowerCase()
        .replace(/[()]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-').replace(/^-|-$/g, '');
    const url = `https://www.kimovil.com/en/where-to-buy-${slug}`;  // Note: frequency-checker might 403 frequently, "where-to-buy" is the main page
    console.log(`Fetching ${url}...`);
    try {
        const res = await axios.get(url, { headers: SCRAPE_HEADERS, timeout: 10000 });
        const $ = cheerio.load(res.data);

        // Find screen details
        const specText = $('.phone-detail').text() + ' ' + $('.section-specs').text();
        const t = specText.toLowerCase();

        console.log(`--- ${brand} ${model} ---`);
        console.log('2.5d:', t.includes('2.5d'));
        console.log('curved:', t.includes('curved') || t.includes('dual edge') || t.includes('3d screen'));
        console.log('flat:', t.includes('flat'));

    } catch (e) {
        console.error('Error fetching:', e.message);
    }
}

testKimovil('Samsung', 'Galaxy A15');
testKimovil('Motorola', 'Edge 50 Pro');
testKimovil('Poco', 'F5');
