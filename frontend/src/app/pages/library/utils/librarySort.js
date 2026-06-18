import {
  isLibraryCollectionTab,
  isLibraryPeopleTab,
  isLibraryTagsTab,
  isLibraryVideoTab,
} from '@/lib/libraryTabs';

export function sortLibraryItems(items, resolvedTab, sortKey, sortDirection) {
  if (!items || items.length === 0) return [];

  const getSortValue = (item) => {
    if (isLibraryVideoTab(resolvedTab)) {
      if (sortKey === 'title') {
        return String(item.title || '').toLowerCase();
      }
      if (sortKey === 'year') {
        return Number(item.year) || 0;
      }
      if (sortKey === 'release_date') {
        return item.release_date || item.year || '';
      }
      if (sortKey === 'rating_imdb') {
        return parseFloat(item.rating_imdb) || 0;
      }
      if (sortKey === 'rating') {
        return parseFloat(item.rating) || 0;
      }
      if (sortKey === 'user_rating') {
        return parseFloat(item.user_rating) || 0;
      }
      if (sortKey === 'duration') {
        return Number(item.duration) || 0;
      }
      if (sortKey === 'file_size') {
        return Number(item.file_size || item.size || item.size_mb) || 0;
      }
      if (sortKey === 'last_watched') {
        return item.last_watched_at ? new Date(item.last_watched_at).getTime() : 0;
      }
    }

    if (isLibraryCollectionTab(resolvedTab)) {
      if (sortKey === 'title') {
        return String(item.title || '').toLowerCase();
      }
      return Number(item.owned_count) || 0;
    }

    if (isLibraryPeopleTab(resolvedTab)) {
      if (sortKey === 'name' || sortKey === 'title') {
        return String(item.name || '').toLowerCase();
      }
      if (sortKey === 'library_count') {
        return Number(item.library_count) || 0;
      }
      if (sortKey === 'rating') {
        return parseFloat(item.rating) || 0;
      }
      if (sortKey === 'birthday') {
        return item.birthday ? new Date(item.birthday).getTime() : 0;
      }
      if (sortKey === 'user_rating') {
        return parseFloat(item.user_rating) || 0;
      }
    }

    if (isLibraryTagsTab(resolvedTab)) {
      if (sortKey === 'name' || sortKey === 'title') {
        return String(item.name || '').toLowerCase();
      }
      return Number(item.total_count) || 0;
    }

    return '';
  };

  const mapped = items.map((item, index) => ({
    index,
    value: getSortValue(item),
    item
  }));

  mapped.sort((a, b) => {
    const valA = a.value;
    const valB = b.value;

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return a.index - b.index;
  });

  return mapped.map(x => x.item);
}
