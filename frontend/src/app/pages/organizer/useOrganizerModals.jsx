import { useContext } from 'react';
import { OrganizerModalContext } from './providers/OrganizerModalContext';

export function useOrganizerModals() {
  const context = useContext(OrganizerModalContext);
  if (!context) {
    throw new Error('useOrganizerModals must be used within OrganizerModalProvider');
  }
  return context;
}
