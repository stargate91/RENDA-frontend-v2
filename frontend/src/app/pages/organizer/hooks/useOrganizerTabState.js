import { useState } from 'react';

export function useOrganizerTabState() {
  const [activeMainTab, setActiveMainTab] = useState('manual');
  const [activeExtrasTab, setActiveExtrasTab] = useState('bonus');
  const [activeManualTab, setActiveManualTab] = useState('movies');

  return {
    activeMainTab,
    setActiveMainTab,
    activeExtrasTab,
    setActiveExtrasTab,
    activeManualTab,
    setActiveManualTab,
  };
}
