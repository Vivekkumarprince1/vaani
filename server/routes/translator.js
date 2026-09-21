const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Universal Provider-Agnostic Language Catalog (40+ major world & regional languages)
const UNIVERSAL_LANGUAGES = {
  en: { name: 'English', nativeName: 'English', dir: 'ltr' },
  hi: { name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
  es: { name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  fr: { name: 'French', nativeName: 'Français', dir: 'ltr' },
  de: { name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  it: { name: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
  pt: { name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
  ru: { name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  ja: { name: 'Japanese', nativeName: '日本語', dir: 'ltr' },
  ko: { name: 'Korean', nativeName: '한국어', dir: 'ltr' },
  'zh-Hans': { name: 'Chinese (Simplified)', nativeName: '简体中文', dir: 'ltr' },
  'zh-Hant': { name: 'Chinese (Traditional)', nativeName: '繁體中文', dir: 'ltr' },
  ar: { name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  bn: { name: 'Bengali', nativeName: 'বাংলা', dir: 'ltr' },
  pa: { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', dir: 'ltr' },
  mr: { name: 'Marathi', nativeName: 'मराठी', dir: 'ltr' },
  gu: { name: 'Gujarati', nativeName: 'ગુજરાતી', dir: 'ltr' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்', dir: 'ltr' },
  te: { name: 'Telugu', nativeName: 'తెలుగు', dir: 'ltr' },
  kn: { name: 'Kannada', nativeName: 'ಕನ್ನಡ', dir: 'ltr' },
  ml: { name: 'Malayalam', nativeName: 'മലയാളം', dir: 'ltr' },
  ur: { name: 'Urdu', nativeName: 'اردو', dir: 'rtl' },
  nl: { name: 'Dutch', nativeName: 'Nederlands', dir: 'ltr' },
  pl: { name: 'Polish', nativeName: 'Polski', dir: 'ltr' },
  tr: { name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' },
  th: { name: 'Thai', nativeName: 'ไทย', dir: 'ltr' },
  vi: { name: 'Vietnamese', nativeName: 'Tiếng Việt', dir: 'ltr' },
  id: { name: 'Indonesian', nativeName: 'Bahasa Indonesia', dir: 'ltr' },
  fa: { name: 'Persian', nativeName: 'فارسی', dir: 'rtl' },
  uk: { name: 'Ukrainian', nativeName: 'Українська', dir: 'ltr' },
  el: { name: 'Greek', nativeName: 'Ελληνικά', dir: 'ltr' },
  he: { name: 'Hebrew', nativeName: 'עברית', dir: 'rtl' },
  sv: { name: 'Swedish', nativeName: 'Svenska', dir: 'ltr' },
  ro: { name: 'Romanian', nativeName: 'Română', dir: 'ltr' },
  cs: { name: 'Czech', nativeName: 'Čeština', dir: 'ltr' },
  hu: { name: 'Hungarian', nativeName: 'Magyar', dir: 'ltr' },
  fi: { name: 'Finnish', nativeName: 'Suomi', dir: 'ltr' },
  da: { name: 'Danish', nativeName: 'Dansk', dir: 'ltr' },
  no: { name: 'Norwegian', nativeName: 'Norsk', dir: 'ltr' },
  ms: { name: 'Malay', nativeName: 'Bahasa Melayu', dir: 'ltr' },
  fil: { name: 'Filipino', nativeName: 'Filipino', dir: 'ltr' },
  sw: { name: 'Swahili', nativeName: 'Kiswahili', dir: 'ltr' }
};

// Cache for languages
let cachedLanguages = null;
let cacheTimestamp = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Optional authentication middleware (allows pre-login and public access to language list)
const optionalAuth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // Ignore token verification errors for language list
    }
  }
  next();
};

/**
 * GET /api/translator/languages
 * Universal language endpoint that dynamically adapts to active provider while guaranteeing full language options.
 */
router.get('/languages', optionalAuth, async (req, res) => {
  try {
    if (cachedLanguages && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
      console.log('📦 Returning cached languages');
      return res.json(cachedLanguages);
    }

    const providerManager = require('../server/providers/providerManager');
    const { providerName, config } = providerManager.getActiveProvider ? providerManager.getActiveProvider('translation') : { providerName: 'openrouter', config: {} };

    let dynamicLanguages = {};

    // 1. If Azure Translator is the active provider and configured, query Azure languages API
    if (providerName === 'azure') {
      const endpoint = config?.endpoint || process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';
      const key = config?.apiKey || process.env.AZURE_TRANSLATOR_KEY;
      const region = config?.region || process.env.AZURE_TRANSLATOR_REGION;

      if (key) {
        try {
          const headers = {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/json'
          };
          if (region) headers['Ocp-Apim-Subscription-Region'] = region;

          const response = await fetch(
            `${endpoint.replace(/\/$/, '')}/languages?api-version=3.0&scope=translation`,
            { method: 'GET', headers }
          );
          if (response.ok) {
            const data = await response.json();
            dynamicLanguages = data.translation || {};
          }
        } catch (err) {
          console.warn('Could not fetch dynamic languages from Azure, using universal catalog:', err.message);
        }
      }
    } else if (providerName === 'google' && config?.apiKey) {
      // 2. If Google Cloud Translate is active and configured, query Google languages
      try {
        const response = await fetch(
          `https://translation.googleapis.com/language/translate/v2/languages?key=${config.apiKey}&target=en`
        );
        if (response.ok) {
          const data = await response.json();
          const list = data.data?.languages || [];
          for (const item of list) {
            dynamicLanguages[item.language] = {
              name: item.name,
              nativeName: item.name,
              dir: ['ar', 'he', 'fa', 'ur'].includes(item.language) ? 'rtl' : 'ltr'
            };
          }
        }
      } catch (err) {
        console.warn('Could not fetch dynamic languages from Google, using universal catalog:', err.message);
      }
    }

    // 3. Build comprehensive formatted languages (priority first)
    const priorityCodes = [
      'en', 'hi', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh-Hans', 'zh-Hant',
      'ar', 'bn', 'pa', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'ur', 'nl', 'pl', 'tr', 'th', 'vi', 'id'
    ];

    const finalLanguages = {};

    // First add priority codes from dynamic or universal catalog
    for (const code of priorityCodes) {
      if (dynamicLanguages[code]) {
        finalLanguages[code] = dynamicLanguages[code];
      } else if (UNIVERSAL_LANGUAGES[code]) {
        finalLanguages[code] = UNIVERSAL_LANGUAGES[code];
      }
    }

    // Next add any additional languages from dynamic source
    for (const [code, val] of Object.entries(dynamicLanguages)) {
      if (!finalLanguages[code]) {
        finalLanguages[code] = val;
      }
    }

    // Add remaining from universal catalog
    for (const [code, val] of Object.entries(UNIVERSAL_LANGUAGES)) {
      if (!finalLanguages[code]) {
        finalLanguages[code] = val;
      }
    }

    // Cache the result (ensure it is never empty)
    if (Object.keys(finalLanguages).length > 0) {
      cachedLanguages = finalLanguages;
      cacheTimestamp = Date.now();
    }

    return res.json(finalLanguages);
  } catch (err) {
    console.error('❌ Error getting languages, returning universal fallback:', err);
    return res.json(UNIVERSAL_LANGUAGES);
  }
});

// Stub for model-metadata
router.get('/model-metadata/:lang', optionalAuth, (req, res) => {
  res.json({ model: 'stub', language: req.params.lang });
});

module.exports = router;