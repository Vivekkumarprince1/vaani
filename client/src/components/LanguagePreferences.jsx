
import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const DEFAULT_LANGUAGES = [
  { value: 'en', label: 'English', nativeName: 'English' },
  { value: 'hi', label: 'Hindi', nativeName: 'हिन्दी' },
  { value: 'es', label: 'Spanish', nativeName: 'Español' },
  { value: 'fr', label: 'French', nativeName: 'Français' },
  { value: 'de', label: 'German', nativeName: 'Deutsch' },
  { value: 'it', label: 'Italian', nativeName: 'Italiano' },
  { value: 'pt', label: 'Portuguese', nativeName: 'Português' },
  { value: 'ru', label: 'Russian', nativeName: 'Русский' },
  { value: 'ja', label: 'Japanese', nativeName: '日本語' },
  { value: 'ko', label: 'Korean', nativeName: '한국어' },
  { value: 'zh-Hans', label: 'Chinese (Simplified)', nativeName: '简体中文' },
  { value: 'zh-Hant', label: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { value: 'ar', label: 'Arabic', nativeName: 'العربية' },
  { value: 'bn', label: 'Bengali', nativeName: 'বাংলা' },
  { value: 'pa', label: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { value: 'mr', label: 'Marathi', nativeName: 'मराठी' },
  { value: 'gu', label: 'Gujarati', nativeName: 'ગુજરાતી' },
  { value: 'ta', label: 'Tamil', nativeName: 'தமிழ்' },
  { value: 'te', label: 'Telugu', nativeName: 'తెలుగు' },
  { value: 'kn', label: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { value: 'ml', label: 'Malayalam', nativeName: 'മലയാളം' },
  { value: 'ur', label: 'Urdu', nativeName: 'اردو' },
  { value: 'nl', label: 'Dutch', nativeName: 'Nederlands' },
  { value: 'tr', label: 'Turkish', nativeName: 'Türkçe' },
  { value: 'vi', label: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { value: 'id', label: 'Indonesian', nativeName: 'Bahasa Indonesia' }
];

export const LanguagePreferences = ({ selectedLanguage, onLanguageChange, isMobile = false }) => {
  const [languages, setLanguages] = useState(DEFAULT_LANGUAGES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [changingLanguage, setChangingLanguage] = useState(false);

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { 'x-auth-token': token } : {};
        const response = await axios.get(`${API_URL}/translator/languages`, { headers });
        if (response.data && typeof response.data === 'object') {
          const formattedLanguages = Object.entries(response.data).map(([code, details]) => ({
            value: code,
            label: details.name || code,
            nativeName: details.nativeName || details.name || code
          }));
          if (formattedLanguages.length > 0) {
            setLanguages(formattedLanguages);
          }
        }
      } catch (err) {
        console.warn('Failed to load dynamic languages, using universal defaults:', err.message);
      }
    };

    fetchLanguages();
  }, []);

  const handleLanguageChange = async (option) => {
    try {
      setChangingLanguage(true);
      setError(null);
      const success = await onLanguageChange(option.value);
      if (!success) {
        throw new Error('Failed to update language preference');
      }
    } catch (err) {
      console.error('Error changing language:', err);
      setError('Failed to update language preference');
    } finally {
      setChangingLanguage(false);
    }
  };

  const customOption = ({ innerProps, label, data }) => (
    <div {...innerProps} className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
      <span className="font-medium">{label}</span>
      <span className="text-gray-500 ml-2 text-sm">({data.nativeName})</span>
    </div>
  );

  if (loading || changingLanguage) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
        <span className="text-sm text-gray-600">
          {loading ? 'Loading languages...' : 'Updating language...'}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 flex items-center space-x-2">
        <span>{error}</span>
        <button 
          onClick={() => setError(null)}
          className="text-emerald-600 hover:text-emerald-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={`${isMobile ? 'w-full p-2' : 'w-48'}`}>
      <Select
        value={languages.find(lang => lang.value === selectedLanguage)}
        onChange={handleLanguageChange}
        options={languages}
        className={`basic-single text-black ${isMobile ? 'text-sm' : ''}`}
        classNamePrefix="select"
        isSearchable={true}
        name="language"
        placeholder="Language"
        components={{ Option: customOption }}
        formatOptionLabel={(option) => (
          <div className={`flex items-center ${isMobile ? 'text-sm' : ''}`}>
            <span className="font-medium">{option.label}</span>
            <span className="text-gray-500 ml-2 text-xs">{option.nativeName}</span>
          </div>
        )}
      />
    </div>
  );
};