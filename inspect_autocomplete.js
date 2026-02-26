import axios from 'axios';

async function run() {
    try {
        const url = 'https://fdn.gsmarena.com/vv/assets12/js/autocomplete.js?v=16';
        console.log(`Fetching ${url}...`);
        const res = await axios.get(url);
        console.log(res.data);
    } catch (e) {
        console.error(e.message);
    }
}
run();
