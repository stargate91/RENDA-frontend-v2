/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import en from '../locales/en.json';

const translations = { en };

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState('en');

  const t = (key) => {
    const keys = key.split('.');
    let value = translations[locale];
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        return key;
      }
    }
    return value || key;
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
