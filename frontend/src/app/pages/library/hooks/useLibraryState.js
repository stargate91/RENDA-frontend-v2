import { useEffect, useState, useMemo } from 'react';
import { useSettingsQuery } from '@/queries/settingsQueries';
import { useLibraryQuery, useCollectionsQuery, useTagsQuery, useLibraryFiltersQuery } from '@/queries/libraryQueries';
import { usePaginationVisibility } from '../../../hooks/usePaginationVisibility';
import { useTranslation } from '@/providers/LanguageProvider';
import { useLocalListSearch } from '../../../hooks/useLocalListSearch';
import { Clapperboard, Tv, Users, Tag, ShieldAlert, Layers } from 'lucide-react';
import { sortLibraryItems } from '../utils/librarySort';

export function useLibraryState({ initialTab = 'movies', lockTab = false, includeTagsTab = false } = {}) {
  const { data: settings, isLoading } = useSettingsQuery();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState('owned');
  const [watchedFilter, setWatchedFilter] = useState('all');
  const [genreFilter, setGenreFilter] = useState('');
  const [collectionStatusFilter, setCollectionStatusFilter] = useState('all');
  const [peopleRoleFilter, setPeopleRoleFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [favoriteFilter, setFavoriteFilter] = useState('all');
  const [decadeFilter, setDecadeFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('');
  const [timeFilterMode, setTimeFilterMode] = useState('decade'); // 'decade' or 'year'
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortKey, setSortKey] = useState('title');
  const [sortDirection, setSortDirection] = useState('asc');

  const [sessionMode, setSessionMode] = useState(() => {
    try {
      return sessionStorage.getItem('library_session_mode');
    } catch {
      return null;
    }
  });

  const hasAdultSupport = settings?.include_adult;
  const activeSessionMode = hasAdultSupport ? sessionMode : (settings ? 'sfw' : null);

  const handleSetSessionMode = (mode) => {
    setSessionMode(mode);
    try {
      if (mode) {
        sessionStorage.setItem('library_session_mode', mode);
      } else {
        sessionStorage.removeItem('library_session_mode');
      }
    } catch {
      // Ignore storage errors.
    }
    setActiveTab('movies');
    setCurrentPage(1);
    setSearchQuery('');
    setGenreFilter('');
    setCollectionStatusFilter('all');
    setPeopleRoleFilter('all');
    setGenderFilter('all');
    setFavoriteFilter('all');
    setDecadeFilter('all');
    setYearFilter('');
  };

  const isCollections = activeTab === 'collections';
  const isTags = activeTab === 'tags';
  const isPeople = activeTab === 'people';

  const backendTab = useMemo(() => {
    if (activeSessionMode === 'nsfw') {
      if (activeTab === 'movies') return 'adult';
      if (activeTab === 'series') return 'adult_series';
      if (activeTab === 'collections') return 'adult_collections';
      if (activeTab === 'people') return 'adult_people';
    }
    return activeTab;
  }, [activeTab, activeSessionMode]);

  const resolvedGenderFilter = isPeople
    ? (activeSessionMode === 'nsfw' && settings?.adult_gender_preference && settings.adult_gender_preference !== 'all'
      ? settings.adult_gender_preference
      : genderFilter)
    : undefined;

  const { data: libraryData, isLoading: isLibraryLoading } = useLibraryQuery(
    !isCollections && !isTags && activeSessionMode
      ? {
          tab: backendTab,
          page: 1,
          pageSize: 10000,
          filter_ownership: ownershipFilter,
          filter_watched: watchedFilter,
          selected_genre: genreFilter || undefined,
          people_role: isPeople ? peopleRoleFilter : undefined,
          filter_gender: resolvedGenderFilter,
          filter_favorite: isPeople ? favoriteFilter : undefined,
          selected_decade: decadeFilter !== 'all' ? decadeFilter : undefined,
          selected_year: yearFilter !== '' ? Number(yearFilter) : undefined
        }
      : { tab: 'movies', page: 1, pageSize: 1 }
  );

  const { data: filterData } = useLibraryFiltersQuery(
    !isCollections && !isTags && activeSessionMode
      ? { tab: backendTab, filter_ownership: ownershipFilter }
      : null
  );

  const { data: collectionsData, isLoading: isCollectionsLoading } = useCollectionsQuery(
    isCollections && activeSessionMode
      ? { page: 1, pageSize: 10000, tab: activeSessionMode === 'nsfw' ? 'adult' : 'movies' }
      : null
  );

  const { data: tagsData, isLoading: isTagsLoading } = useTagsQuery();

  const processedTags = useMemo(() => {
    if (!tagsData) return [];
    const isNsfw = activeSessionMode === 'nsfw';
    return tagsData
      .map(tag => {
        const localCount = isNsfw
          ? (tag.adult?.length || 0) + (tag.adult_series?.length || 0) + (tag.adult_people?.length || 0)
          : (tag.movies?.length || 0) + (tag.series?.length || 0) + (tag.people?.length || 0);

        const modeItems = isNsfw
          ? [...(tag.adult || []), ...(tag.adult_series || []), ...(tag.adult_people || [])]
          : [...(tag.movies || []), ...(tag.series || []), ...(tag.people || [])];

        const localPreviews = [];
        const seenPosters = new Set();
        for (const item of modeItems) {
          const poster = item.displayPoster || item.local_poster_path || item.poster_path;
          const backdrop = item.local_backdrop_path || item.backdrop_path;
          if ((poster || backdrop) && !seenPosters.has(poster)) {
            localPreviews.push({
              poster,
              backdrop,
              kind: item.type,
            });
            seenPosters.add(poster);
            if (localPreviews.length >= 3) break;
          }
        }

        return {
          ...tag,
          total_count: localCount,
          sample_previews: localPreviews,
        };
      })
      .filter(tag => tag.total_count > 0);
  }, [tagsData, activeSessionMode]);

  const counts = libraryData?.counts || {};

  const tabs = [
    { value: 'movies', label: t('library.tabs.movies'), count: activeSessionMode === 'nsfw' ? counts.adult : counts.movies, icon: Clapperboard },
    ...(settings?.folder_collection_mode !== 'never' ? [
      { value: 'collections', label: t('library.tabs.collections'), count: activeSessionMode === 'nsfw' ? counts.adult_collections : counts.collections, icon: Layers }
    ] : []),
    ...(activeSessionMode !== 'nsfw' ? [
      { value: 'series', label: t('library.tabs.series'), count: counts.series, icon: Tv }
    ] : []),
    { value: 'people', label: t('library.tabs.people'), count: activeSessionMode === 'nsfw' ? counts.adult_people : counts.people, icon: Users },
    ...(includeTagsTab ? [
      { value: 'tags', label: t('library.tabs.tags'), count: processedTags.length, icon: Tag },
    ] : []),
  ];

  const fallbackTab = initialTab === 'tags' ? 'tags' : 'movies';
  const resolvedTab = tabs.some(tab => tab.value === activeTab) ? activeTab : fallbackTab;

  useEffect(() => {
    if (lockTab && activeTab !== initialTab) {
      setActiveTab(initialTab);
    }
  }, [activeTab, initialTab, lockTab]);

  const handleTabChange = (newTab) => {
    if (lockTab) return;
    setActiveTab(newTab);
    const tabToUse = tabs.some(tab => tab.value === newTab) ? newTab : fallbackTab;
    if (tabToUse === 'collections') {
      setSortKey('owned_count');
      setSortDirection('desc');
    } else if (tabToUse === 'tags') {
      setSortKey('total_count');
      setSortDirection('desc');
    } else if (tabToUse === 'people') {
      setSortKey('library_count');
      setSortDirection('desc');
    } else {
      setSortKey('title');
      setSortDirection('asc');
    }
    setCurrentPage(1);
    setGenreFilter('');
    setCollectionStatusFilter('all');
    setPeopleRoleFilter('all');
    setGenderFilter('all');
    setFavoriteFilter('all');
    setDecadeFilter('all');
    setYearFilter('');
  };

  const handleOwnershipFilterChange = (newOwnership) => {
    setOwnershipFilter(newOwnership);
    setCurrentPage(1);
    setGenreFilter('');
    setCollectionStatusFilter('all');
    setPeopleRoleFilter('all');
    setGenderFilter('all');
    setFavoriteFilter('all');
    setDecadeFilter('all');
    setYearFilter('');
  };

  const getEmptyStateIcon = () => {
    switch (resolvedTab) {
      case 'movies': return Clapperboard;
      case 'collections': return Layers;
      case 'series': return Tv;
      case 'people': return Users;
      case 'tags': return Tag;
      default: return initialTab === 'tags' ? Tag : Clapperboard;
    }
  };

  const allItems = isCollections
    ? (collectionsData?.items || [])
    : isTags
      ? processedTags
      : (libraryData?.items || []);

  let filteredItems = useLocalListSearch(allItems, searchQuery);

  if (isCollections) {
    filteredItems = filteredItems.filter(item => {
      const owned = Number(item.owned_count) || 0;
      const total = Number(item.total_count) || 0;
      if (collectionStatusFilter === 'complete') return owned === total;
      if (collectionStatusFilter === 'in_progress') return owned > 0 && owned < total;
      return true;
    });
  }

  const sortedItems = sortLibraryItems(filteredItems, resolvedTab, sortKey, sortDirection);

  const totalItems = sortedItems.length;

  const translationKey = activeSessionMode === 'nsfw' && resolvedTab === 'people' ? 'adultPeople' : resolvedTab;
  const emptyStateTranslationKey = activeSessionMode === 'nsfw'
    ? (resolvedTab === 'movies' ? 'adult' : resolvedTab === 'series' ? 'adult_series' : resolvedTab === 'people' ? 'adultPeople' : resolvedTab === 'collections' ? 'adultCollections' : resolvedTab === 'tags' ? 'adultTags' : resolvedTab)
    : resolvedTab;

  const tabTotalCount = counts[backendTab] ?? allItems.length;
  const tabLabel = t(`library.tabs.${translationKey}`);
  const searchPlaceholder = t('library.searchPlaceholder').replace('{{tab}}', tabLabel);
  const hasSearchQuery = searchQuery.trim().length > 0;
  const hasFilterSelection = Boolean(
    (isCollections && collectionStatusFilter !== 'all') ||
    (isPeople && peopleRoleFilter !== 'all') ||
    (isPeople && genderFilter !== 'all') ||
    (isPeople && favoriteFilter !== 'all') ||
    (!isCollections && !isTags && !isPeople && (
      ownershipFilter !== 'owned' ||
      watchedFilter !== 'all' ||
      genreFilter !== '' ||
      decadeFilter !== 'all' ||
      yearFilter !== ''
    ))
  );
  const hasActiveFilters = tabTotalCount > 0 && totalItems === 0 && (hasSearchQuery || hasFilterSelection);
  const emptyStateVariant = hasSearchQuery
    ? 'page-search'
    : hasFilterSelection
      ? 'page-filter'
      : 'default';
  const emptyTitle = hasSearchQuery
    ? (t('library.emptyStates.search.title', { tab: tabLabel }) || `No matching ${tabLabel} found`)
    : hasFilterSelection
      ? (t('library.emptyStates.filter.title', { tab: tabLabel }) || 'Nothing fits these filters')
      : t(`library.emptyStates.${emptyStateTranslationKey}.title`);
  const emptyDescription = hasSearchQuery
    ? (t('library.emptyStates.search.description', { tab: tabLabel }) || 'Try a different search term or check the spelling.')
    : hasFilterSelection
      ? (t('library.emptyStates.filter.description', { tab: tabLabel }) || `Try clearing or relaxing a few filters to bring ${tabLabel} back into view.`)
      : t(`library.emptyStates.${emptyStateTranslationKey}.description`);
  const emptyIcon = getEmptyStateIcon();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedItems = sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const shouldShowPagination = usePaginationVisibility(totalItems, pageSize);

  const summaryText = totalItems > 0
    ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalItems)} / ${totalItems}`
    : '0-0 / 0';

  const isDataLoading = (!isCollections && !isTags && isLibraryLoading) ||
    (isCollections && isCollectionsLoading) ||
    (isTags && isTagsLoading);

  return {
    settings,
    isLoading,
    t,
    activeTab,
    setActiveTab: handleTabChange,
    searchQuery,
    setSearchQuery,
    ownershipFilter,
    setOwnershipFilter: handleOwnershipFilterChange,
    watchedFilter,
    setWatchedFilter,
    genreFilter,
    setGenreFilter,
    collectionStatusFilter,
    setCollectionStatusFilter,
    peopleRoleFilter,
    setPeopleRoleFilter,
    genderFilter,
    setGenderFilter,
    favoriteFilter,
    setFavoriteFilter,
    decadeFilter,
    setDecadeFilter,
    yearFilter,
    setYearFilter,
    timeFilterMode,
    setTimeFilterMode,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    sortKey,
    setSortKey,
    sortDirection,
    setSortDirection,
    isCollections,
    isTags,
    isPeople,
    tabs,
    resolvedTab,
    filterData,
    emptyTitle,
    emptyDescription,
    emptyStateVariant,
    emptyIcon,
    hasActiveFilters,
    searchPlaceholder,
    sortedItems,
    paginatedItems,
    totalPages,
    shouldShowPagination,
    summaryText,
    isDataLoading,
    sessionMode,
    activeSessionMode,
    setSessionMode: handleSetSessionMode,
  };
}
