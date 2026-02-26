import axios from 'axios';

// Function to update a single phone
async function updatePhoneSpecs(modelName) {
    try {
        const url = `http://localhost:3000/api/search?model=${encodeURIComponent(modelName)}&force=true`;
        console.log(`Fetching specs for: ${modelName} from ${url}...`);

        const response = await axios.get(url);

        const data = response.data;
        // Log what we found
        console.log(`Response Data:`, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error updating ${modelName}:`, error.message);
        if (error.response) {
            console.error('Data:', error.response.data);
            console.error('Status:', error.response.status);
        }
        return false;
    }
}

updatePhoneSpecs('Realme 12 5G');
