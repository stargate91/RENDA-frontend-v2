/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import enCommon from '../locales/en/common.json';
import enSettings from '../locales/en/settings.json';
import enOrganizer from '../locales/en/organizer.json';

const en = {
  ...enCommon,
  settingsPage: enSettings,
  organizer: enOrganizer,
};

const translations = { en };

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState('en');

  const t = (key, options) => {
    const keys = key.split('.');
    let value = translations[locale];
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        value = undefined;
        break;
      }
    }
    let result = value;
    if (result === undefined) {
      result = (options && options.defaultValue) ? options.defaultValue : key;
    }
    if (typeof result === 'string' && options) {
      Object.keys(options).forEach((optKey) => {
        result = result.replace(new RegExp(`{{\\s*${optKey}\\s*}}`, 'g'), options[optKey]);
        result = result.replace(new RegExp(`{\\s*${optKey}\\s*}`, 'g'), options[optKey]);
      });
    }
    return result;
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}
