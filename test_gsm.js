
import axios from 'axios';

async function checkConnection() {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    console.log('Testing connection to https://www.gsmarena.com/...');
    console.log(`User-Agent: ${ua}`);

    try {
        const res = await axios.get('https://www.gsmarena.com/', {
            headers: {
                'User-Agent': ua,
                'Referer': 'https://www.google.com/'
            },
            validateStatus: () => true // Don't throw on error
        });

        console.log(`Status: ${res.status} ${res.statusText}`);
        console.log('Headers:', res.headers);

        if (res.status === 200) {
            console.log('SUCCESS: Connection established.');
        } else if (res.status === 429) {
            console.log('FAILURE: Rate Limited (429). The IP is temporarily blocked.');
            if (res.headers['retry-after']) {
                console.log(`Retry-After: ${res.headers['retry-after']} seconds`);
            }
        } else {
            console.log('FAILURE: Unexpected status.');
        }

    } catch (err) {
        console.error('Network Error:', err.message);
    }
}

checkConnection();
