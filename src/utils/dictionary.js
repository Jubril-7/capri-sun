import axios from 'axios';

export async function validateWord(word) {
    try {
        const response = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, {
            timeout: 5000
        });
        return response.status === 200;
    } catch {
        return false;
    }
}