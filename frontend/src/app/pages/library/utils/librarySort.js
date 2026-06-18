import {
  isLibraryCollectionTab,
  isLibraryPeopleTab,
  isLibraryTagsTab,
  isLibraryVideoTab,
} from '@/lib/libraryTabs';

export function sortLibraryItems(items, resolvedTab, sortKey, sortDirection) {
  return [...items].sort((a, b) => {
    if (isLibraryVideoTab(resolvedTab)) {
      let valA, valB;
      if (sortKey === 'title') {
        valA = String(a.title || '').toLowerCase();
        valB = String(b.title || '').toLowerCase();
      } else if (sortKey === 'year') {
        valA = Number(a.year) || 0;
        valB = Number(b.year) || 0;
      } else if (sortKey === 'release_date') {
        valA = a.release_date || a.year || '';
        valB = b.release_date || b.year || '';
      } else if (sortKey === 'rating_imdb') {
        valA = parseFloat(a.rating_imdb) || 0;
        valB = parseFloat(b.rating_imdb) || 0;
      } else if (sortKey === 'rating') {
        valA = parseFloat(a.rating) || 0;
        valB = parseFloat(b.rating) || 0;
      } else if (sortKey === 'user_rating') {
        valA = parseFloat(a.user_rating) || 0;
        valB = parseFloat(b.user_rating) || 0;
      } else if (sortKey === 'duration') {
        valA = Number(a.duration) || 0;
        valB = Number(b.duration) || 0;
      } else if (sortKey === 'file_size') {
        valA = Number(a.file_size || a.size || a.size_mb) || 0;
        valB = Number(b.file_size || b.size || b.size_mb) || 0;
      } else if (sortKey === 'last_watched') {
        valA = a.last_watched_at ? new Date(a.last_watched_at).getTime() : 0;
        valB = b.last_watched_at ? new Date(b.last_watched_at).getTime() : 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    }

    if (isLibraryCollectionTab(resolvedTab)) {
      let valA, valB;
      if (sortKey === 'title') {
        valA = String(a.title || '').toLowerCase();
        valB = String(b.title || '').toLowerCase();
      } else {
        valA = Number(a.owned_count) || 0;
        valB = Number(b.owned_count) || 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    }

    if (isLibraryPeopleTab(resolvedTab)) {
      let valA, valB;
      if (sortKey === 'name' || sortKey === 'title') {
        valA = String(a.name || '').toLowerCase();
        valB = String(b.name || '').toLowerCase();
      } else if (sortKey === 'library_count') {
        valA = Number(a.library_count) || 0;
        valB = Number(b.library_count) || 0;
      } else if (sortKey === 'rating') {
        valA = parseFloat(a.rating) || 0;
        valB = parseFloat(b.rating) || 0;
      } else if (sortKey === 'birthday') {
        valA = a.birthday ? new Date(a.birthday).getTime() : 0;
        valB = b.birthday ? new Date(b.birthday).getTime() : 0;
      } else if (sortKey === 'user_rating') {
        valA = parseFloat(a.user_rating) || 0;
        valB = parseFloat(b.user_rating) || 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    }

    if (isLibraryTagsTab(resolvedTab)) {
      let valA, valB;
      if (sortKey === 'name' || sortKey === 'title') {
        valA = String(a.name || '').toLowerCase();
        valB = String(b.name || '').toLowerCase();
      } else {
        valA = Number(a.total_count) || 0;
        valB = Number(b.total_count) || 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    }

    return 0;
  });
}
