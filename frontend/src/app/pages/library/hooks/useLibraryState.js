import { useState } from 'react';
import { useSettingsQuery } from '@/queries/settingsQueries';
import { useLibraryQuery, useCollectionsQuery, useTagsQuery, useLibraryFiltersQuery } from '@/queries/libraryQueries';
import { usePaginationVisibility } from '../../../hooks/usePaginationVisibility';
import { useTranslation } from '@/providers/LanguageProvider';
import { useLocalListSearch } from '../../../hooks/useLocalListSearch';
import { Clapperboard, Tv, Users, Tag, ShieldAlert, Layers } from 'lucide-react';
import { sortLibraryItems } from '../utils/librarySort';

export function useLibraryState() {
  const { data: settings, isLoading } = useSettingsQuery();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('movies');
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

  const isCollections = activeTab === 'collections' || activeTab === 'adult_collections';
  const isTags = activeTab === 'tags';
  const isPeople = activeTab === 'people' || activeTab === 'adult_people';

  const resolvedGenderFilter = isPeople
    ? (activeTab === 'adult_people' && settings?.adult_gender_preference && settings.adult_gender_preference !== 'all'
      ? settings.adult_gender_preference
      : genderFilter)
    : undefined;

  const { data: libraryData, isLoading: isLibraryLoading } = useLibraryQuery(
    !isCollections && !isTags
      ? {
          tab: activeTab,
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
    !isCollections && !isTags
      ? { tab: activeTab, filter_ownership: ownershipFilter }
      : null
  );

  const { data: collectionsData, isLoading: isCollectionsLoading } = useCollectionsQuery(
    isCollections
      ? { page: 1, pageSize: 10000, tab: activeTab === 'adult_collections' ? 'adult' : 'movies' }
      : null
  );

  const { data: tagsData, isLoading: isTagsLoading } = useTagsQuery();

  const counts = libraryData?.counts || {};

  const tabs = [
    { value: 'movies', label: t('library.tabs.movies'), count: counts.movies, icon: Clapperboard },
    ...(settings?.folder_collection_mode !== 'never' ? [
      { value: 'collections', label: t('library.tabs.collections'), count: counts.collections, icon: Layers }
    ] : []),
    { value: 'series', label: t('library.tabs.series'), count: counts.series, icon: Tv },
    { value: 'people', label: t('library.tabs.people'), count: counts.people, icon: Users },
    ...(settings?.include_adult ? [
      { value: 'adult', label: t('library.tabs.adult'), count: counts.adult, icon: ShieldAlert },
      ...(settings?.folder_collection_mode !== 'never' ? [
        { value: 'adult_collections', label: t('library.tabs.adultCollections'), count: counts.adult_collections, icon: Layers }
      ] : []),
      { value: 'adult_people', label: t('library.tabs.adultPeople'), count: counts.adult_people, icon: Users },
    ] : []),
    { value: 'tags', label: t('library.tabs.tags'), count: counts.tags, icon: Tag },
  ];

  const resolvedTab = tabs.some(tab => tab.value === activeTab) ? activeTab : 'movies';

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    const tabToUse = tabs.some(tab => tab.value === newTab) ? newTab : 'movies';
    if (tabToUse === 'collections' || tabToUse === 'adult_collections') {
      setSortKey('owned_count');
      setSortDirection('desc');
    } else if (tabToUse === 'tags') {
      setSortKey('total_count');
      setSortDirection('desc');
    } else if (tabToUse === 'people' || tabToUse === 'adult_people') {
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
      case 'people':
      case 'adult_people': return Users;
      case 'adult': return ShieldAlert;
      case 'tags': return Tag;
      default: return Clapperboard;
    }
  };

  const allItems = isCollections
    ? (collectionsData?.items || [])
    : isTags
      ? (tagsData || [])
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

  const translationKey = resolvedTab === 'adult_people' ? 'adultPeople' : resolvedTab;
  const tabTotalCount = counts[resolvedTab] ?? allItems.length;
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
      : t(`library.emptyStates.${translationKey}.title`);
  const emptyDescription = hasSearchQuery
    ? (t('library.emptyStates.search.description', { tab: tabLabel }) || 'Try a different search term or check the spelling.')
    : hasFilterSelection
      ? (t('library.emptyStates.filter.description', { tab: tabLabel }) || `Try clearing or relaxing a few filters to bring ${tabLabel} back into view.`)
      : t(`library.emptyStates.${translationKey}.description`);
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
  };
}
