import { createContext, useContext } from 'react';

export const LanguageContext = createContext(null);

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}
