import { useMemo } from 'react';

export function useLocalListSearch(items, searchQuery, searchKeys = ['title', 'name', 'original_title']) {
  return useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return items;

    return items.filter(item =>
      searchKeys.some(key => {
        const val = item[key];
        return val != null && String(val).toLowerCase().includes(query);
      })
    );
  }, [items, searchQuery, searchKeys]);
}
