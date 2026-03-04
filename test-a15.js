import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
    console.log('Fetching Samsung Galaxy A15...');
    const res = await axios.get('https://www.gsmarena.com/samsung_galaxy_a15-12637.php', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const $ = cheerio.load(res.data);

    console.log('--- displaytype ---');
    console.log($('[data-spec="displaytype"]').text());

    console.log('\n--- displayresolution ---');
    console.log($('[data-spec="displayresolution"]').text());

    console.log('\n--- Entire #specs-list text ---');
    // only get td text
    console.log($('#specs-list td').map((i, el) => $(el).text()).get().join(' | '));

    console.log('\n--- Meta Match ---');
    console.log($('meta[name="description"]').attr('content'));

    console.log('\n--- Does "notch", "drop", "infinity" exist anywhere in the page? ---');
    const bodyText = $('body').text().toLowerCase();
    console.log('notch:', bodyText.includes('notch'));
    console.log('drop:', bodyText.includes('drop'));
    console.log('infinity:', bodyText.includes('infinity'));
}

test();
