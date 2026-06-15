import { createContext, useContext, createElement } from 'react';

const MediaDetailContext = createContext(null);

export function MediaDetailProvider({ children, value }) {
  return createElement(MediaDetailContext.Provider, { value }, children);
}

export function useMediaDetailContext() {
  const context = useContext(MediaDetailContext);
  if (!context) {
    throw new Error('useMediaDetailContext must be used within a MediaDetailProvider');
  }
  return context;
}
