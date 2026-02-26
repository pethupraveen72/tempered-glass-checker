import axios from 'axios';
import fs from 'fs/promises';

async function run() {
    try {
        const url = 'https://www.gsmarena.com/quicksearch-81821.jpg';
        console.log(`Fetching ${url}...`);
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        await fs.writeFile('dump.json', JSON.stringify(res.data, null, 2));
        console.log('Saved dump.json');

        console.log('First Item:', res.data[0]);
    } catch (e) {
        console.error(e.message);
    }
}
run();
