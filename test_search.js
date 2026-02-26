import axios from 'axios';

async function testSearch() {
    try {
        const res = await axios.get('http://localhost:3000/api/search?model=OnePlus%2015');
        console.log('Search Result:', res.data);
    } catch (error) {
        console.error('Search Failed:', error.response ? error.response.data : error.message);
    }
}

testSearch();
