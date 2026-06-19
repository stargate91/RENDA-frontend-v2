import { create } from 'zustand';

export const useLibraryModeStore = create((set) => ({
  sessionMode: (() => {
    try {
      return sessionStorage.getItem('library_session_mode') || 'sfw';
    } catch {
      return 'sfw';
    }
  })(),
  setSessionMode: (mode) => {
    try {
      if (mode) {
        sessionStorage.setItem('library_session_mode', mode);
      } else {
        sessionStorage.removeItem('library_session_mode');
      }
    } catch {
      // Ignore
    }
    set({ sessionMode: mode || 'sfw' });
  },
  toggleSessionMode: () => {
    set((state) => {
      const nextMode = state.sessionMode === 'nsfw' ? 'sfw' : 'nsfw';
      try {
        sessionStorage.setItem('library_session_mode', nextMode);
      } catch {
        // Ignore
      }
      return { sessionMode: nextMode };
    });
  },
}));
