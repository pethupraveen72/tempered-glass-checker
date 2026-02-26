import axios from 'axios';
import fs from 'fs/promises';

async function run() {
    try {
        const url = 'https://www.gsmarena.com/res.php3?sSearch=Xiaomi%2014';
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        await fs.writeFile('gsm_debug.html', res.data);
        console.log('Saved gsm_debug.html');
    } catch (e) {
        console.error(e);
    }
}
run();
