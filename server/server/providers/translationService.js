const axios = require('axios');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const providerManager = require('./providerManager');

/**
 * Universal text translation dispatcher supporting active provider
 */
async function translateBatch({ texts, sourceLang, targetLang }) {
  const { providerName, config } = providerManager.getActiveProvider('translation');

  if (['openai', 'groq', 'openrouter', 'nvidia'].includes(providerName)) {
    if (!config.apiKey) {
      throw new Error(`${providerName.toUpperCase()} API key is not configured for translation`);
    }

    let defaultBaseUrl = 'https://api.openai.com/v1';
    let defaultModel = 'gpt-4o-mini';

    if (providerName === 'groq') {
      defaultBaseUrl = 'https://api.groq.com/openai/v1';
      defaultModel = 'llama-3.3-70b-versatile';
    } else if (providerName === 'openrouter') {
      defaultBaseUrl = 'https://openrouter.ai/api/v1';
      defaultModel = 'meta-llama/llama-3.3-70b-instruct';
    } else if (providerName === 'nvidia') {
      defaultBaseUrl = 'https://integrate.api.nvidia.com/v1';
      defaultModel = 'meta/llama-3.3-70b-instruct';
    }

    const baseUrl = (config.endpoint || defaultBaseUrl).replace(/\/$/, '');
    const model = config.model || defaultModel;

    const prompt = `Translate the following JSON array of strings into target language "${targetLang}". ${
      sourceLang ? `Source language is "${sourceLang}".` : ''
    } Return ONLY a JSON array of translated strings in the exact same order with no markdown wrapper or extra text:\n${JSON.stringify(texts)}`;

    const headers = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    };

    if (providerName === 'openrouter') {
      headers['HTTP-Referer'] = 'https://vaani.internal';
      headers['X-Title'] = 'Vaani Translation Platform';
    }

    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: 'You are an accurate real-time speech and chat translator. Always respond with a raw JSON array of translated strings.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      },
      {
        headers,
        timeout: 15000
      }
    );

    const rawContent = response.data.choices[0]?.message?.content?.trim() || '[]';
    let cleanContent = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Strip common safety preamble headers from OpenRouter / Llama Guard
    cleanContent = cleanContent
      .replace(/^user safety:\s*safe\s*/i, '')
      .replace(/^system:\s*/i, '')
      .replace(/^assistant:\s*/i, '')
      .trim();

    let parsed = null;
    try {
      parsed = JSON.parse(cleanContent);
    } catch (e) {
      // Regex extraction for JSON array
      const arrayMatch = cleanContent.match(/\[\s*["'][\s\S]*?["']\s*\]/) || cleanContent.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          parsed = JSON.parse(arrayMatch[0]);
        } catch (e2) {}
      }
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((translatedText) => ({
        text: String(translatedText),
        detectedLanguage: sourceLang || 'en'
      }));
    }

    // Fallback: If single string input, treat the cleaned output directly as the translation
    if (texts.length === 1 && cleanContent) {
      const stripped = cleanContent.replace(/^["']|["']$/g, '').trim();
      if (stripped && !stripped.toLowerCase().startsWith('user safety:')) {
        return [{
          text: stripped,
          detectedLanguage: sourceLang || 'en'
        }];
      }
    }

    console.warn(`[translationService] Could not parse JSON array from ${providerName} (raw: "${rawContent}"), returning original`);
    return texts.map(t => ({
      text: t,
      detectedLanguage: sourceLang || 'en'
    }));
  }

  if (providerName === 'google') {
    if (!config.apiKey) {
      throw new Error('Google Translate API key is not configured');
    }
    const model = config.model || 'nmt';
    const url = `https://translation.googleapis.com/language/translate/v2?key=${config.apiKey}`;
    const payload = {
      q: texts,
      target: targetLang,
      format: 'text'
    };
    if (sourceLang) payload.source = sourceLang;
    if (model && model !== 'base') payload.model = model;

    const response = await axios.post(url, payload, { timeout: 10000 });

    const translations = response.data?.data?.translations || [];
    return translations.map(t => ({
      text: t.translatedText,
      detectedLanguage: t.detectedSourceLanguage || sourceLang
    }));
  }

  // Default: Azure Translator
  const apiKey = config.apiKey || process.env.AZURE_TRANSLATOR_KEY;
  const region = config.region || process.env.AZURE_TRANSLATOR_REGION;
  const endpoint = config.endpoint || process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';

  if (!apiKey) {
    throw new Error('Azure Translator credentials not configured');
  }

  const url = `${endpoint.replace(/\/$/, '')}/translate`;
  const params = {
    'api-version': '3.0',
    'to': targetLang
  };
  if (sourceLang) {
    params.from = sourceLang;
  }

  const headers = {
    'Ocp-Apim-Subscription-Key': apiKey,
    'Content-Type': 'application/json',
    'X-ClientTraceId': uuidv4()
  };
  if (region) {
    headers['Ocp-Apim-Subscription-Region'] = region;
  }

  const response = await axios.post(url, texts.map(text => ({ text })), {
    params,
    headers,
    timeout: 10000
  });

  return response.data.map(item => ({
    text: item.translations[0].text,
    detectedLanguage: item.detectedLanguage?.language || sourceLang
  }));
}

module.exports = {
  translateBatch
};
