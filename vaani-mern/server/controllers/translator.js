const axios = require('axios');

// Get supported languages
const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY;
const AZURE_TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION;
const AZURE_TRANSLATOR_ENDPOINT = 'https://api.cognitive.microsofttranslator.com';

// Get supported languages from Azure Translator
exports.getLanguages = async (req, res) => {
    try {
        const response = await axios.get(`${AZURE_TRANSLATOR_ENDPOINT}/languages?api-version=3.0`, {
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
                'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION
            }
        });

        // Filter and format the languages
        const languages = {};
        Object.entries(response.data.translation).forEach(([code, details]) => {
            languages[code] = {
                name: details.name,
                nativeName: details.nativeName,
                dir: details.dir
            };
        });

        res.json(languages);
    } catch (error) {
        console.error('Error fetching languages from Azure:', error);
        res.status(500).json({ error: 'Failed to fetch languages from Azure Translator' });
    }
};

// Translate text using Azure Translator
exports.translateText = async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;

        if (!text || !targetLanguage) {
            return res.status(400).json({ error: 'Text and target language are required' });
        }

        const subscriptionKey = process.env.AZURE_TRANSLATOR_KEY;
        const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT; // e.g., https://api.cognitive.microsofttranslator.com
        const region = process.env.AZURE_TRANSLATOR_REGION;     // e.g., eastus

        const response = await axios({
            baseURL: `${endpoint}/translate`,
            method: 'post',
            params: {
                'api-version': '3.0',
                'to': targetLanguage
            },
            headers: {
                'Ocp-Apim-Subscription-Key': subscriptionKey,
                'Ocp-Apim-Subscription-Region': region,
                'Content-type': 'application/json'
            },
            data: [{ Text: text }]
        });

        const translatedText = response.data[0]?.translations[0]?.text;

        res.json({
            text: translatedText,
            to: targetLanguage
        });
    } catch (error) {
        console.error('Error translating text:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to translate text' });
    }
};
