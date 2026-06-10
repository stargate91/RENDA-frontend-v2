import { useState, useCallback } from 'react';

export function useOrganizerSort(initialKey = 'source', initialDirection = 'asc') {
  const [sortConfig, setSortConfig] = useState({ key: initialKey, direction: initialDirection });

  const handleSortToggle = useCallback((key) => {
    setSortConfig((current) => (
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    ));
  }, []);

  return {
    sortConfig,
    setSortConfig,
    handleSortToggle,
  };
}
