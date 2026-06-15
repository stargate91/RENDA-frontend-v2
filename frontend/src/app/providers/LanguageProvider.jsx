import { useState } from 'react';
import enCommon from '../locales/en/common.json';
import enSettings from '../locales/en/settings.json';
import enOrganizer from '../locales/en/organizer.json';
import enLibrary from '../locales/en/library.json';
import enHistory from '../locales/en/history.json';
import enOnboarding from '../locales/en/onboarding.json';
import { LanguageContext } from './LanguageContext';

const en = {
  ...enCommon,
  settingsPage: enSettings,
  organizer: enOrganizer,
  library: enLibrary,
  historyPage: enHistory,
  onboarding: enOnboarding,
};

const translations = { en };

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
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing translation key: "${key}" for locale: "${locale}"`);
      }
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
