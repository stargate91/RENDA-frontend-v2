import React, { useState, useEffect } from 'react';
import { useSettingsQuery } from '@/queries/settingsQueries';
import { useLibraryQuery, useCollectionsQuery, useTagsQuery, useLibraryFiltersQuery } from '@/queries/libraryQueries';
import { API_BASE } from '@/lib/backend';
import Page from '@/ui/Page';
import { Tabs } from '@/ui/Tabs';
import Input from '@/ui/Input';
import EmptyState from '@/ui/EmptyState';
import PaginationBar from '@/ui/PaginationBar';
import PosterCard from '@/ui/PosterCard';
import PosterGrid from '@/ui/PosterGrid';
import Dropdown from '@/ui/Dropdown';
import { usePaginationVisibility } from '../../hooks/usePaginationVisibility';
import { useTranslation } from '@/providers/LanguageProvider';
import { useLocalListSearch } from '../../hooks/useLocalListSearch';
import { Search, Clapperboard, Tv, Users, Tag, ShieldAlert, Layers } from 'lucide-react';
import './LibraryPage.css';

const SearchInput = React.memo(({ placeholder, onSearchChange }) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(value);
    }, 80);
    return () => clearTimeout(timer);
  }, [value, onSearchChange]);

  return (
    <Input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
});

export default function LibraryPage() {
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortKey, setSortKey] = useState('title');
  const [sortDirection, setSortDirection] = useState('asc');

  if (isLoading) {
    return (
      <Page className="library-page">
        <div className="library-loading">
          <div className="library-spinner" />
        </div>
      </Page>
    );
  }

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
      ? { tab: activeTab, page: 1, pageSize: 10000, filter_ownership: ownershipFilter, filter_watched: watchedFilter, selected_genre: genreFilter || undefined, people_role: isPeople ? peopleRoleFilter : undefined, filter_gender: resolvedGenderFilter, filter_favorite: isPeople ? favoriteFilter : undefined }
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

  // Construct tabs based on include_adult setting
  const tabs = [
    { value: 'movies', label: t('library.tabs.movies'), count: counts.movies },
    ...(settings?.folder_collection_mode !== 'never' ? [
      { value: 'collections', label: t('library.tabs.collections'), count: counts.collections }
    ] : []),
    { value: 'series', label: t('library.tabs.series'), count: counts.series },
    { value: 'people', label: t('library.tabs.people'), count: counts.people },
    ...(settings?.include_adult ? [
      { value: 'adult', label: t('library.tabs.adult'), count: counts.adult },
      ...(settings?.folder_collection_mode !== 'never' ? [
        { value: 'adult_collections', label: t('library.tabs.adultCollections'), count: counts.adult_collections }
      ] : []),
      { value: 'adult_people', label: t('library.tabs.adultPeople'), count: counts.adult_people },
    ] : []),
    { value: 'tags', label: t('library.tabs.tags'), count: counts.tags },
  ];

  const resolvedTab = tabs.some(tab => tab.value === activeTab) ? activeTab : 'movies';

  // Reset page and sorting when switching tabs
  useEffect(() => {
    if (resolvedTab === 'collections' || resolvedTab === 'adult_collections') {
      setSortKey('owned_count');
      setSortDirection('desc');
    } else if (resolvedTab === 'people' || resolvedTab === 'adult_people') {
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
  }, [resolvedTab, ownershipFilter]);

  const getEmptyStateIcon = () => {
    switch (resolvedTab) {
      case 'movies':
        return Clapperboard;
      case 'collections':
        return Layers;
      case 'series':
        return Tv;
      case 'people':
      case 'adult_people':
        return Users;
      case 'adult':
        return ShieldAlert;
      case 'tags':
        return Tag;
      default:
        return Clapperboard;
    }
  };

  const translationKey = resolvedTab === 'adult_people' ? 'adultPeople' : resolvedTab;
  const emptyTitle = t(`library.emptyStates.${translationKey}.title`);
  const emptyDescription = t(`library.emptyStates.${translationKey}.description`);
  const emptyIcon = getEmptyStateIcon();

  const tabLabel = t(`library.tabs.${translationKey}`);
  const searchPlaceholder = t('library.searchPlaceholder').replace('{{tab}}', tabLabel);

  // Determine items and pagination details based on active tab
  let allItems = [];
  if (isCollections) {
    allItems = collectionsData?.items || [];
  } else if (isTags) {
    allItems = tagsData || [];
  } else {
    allItems = libraryData?.items || [];
  }

  let filteredItems = useLocalListSearch(allItems, searchQuery);

  if (isCollections) {
    filteredItems = filteredItems.filter(item => {
      const owned = Number(item.owned_count) || 0;
      const total = Number(item.total_count) || 0;
      if (collectionStatusFilter === 'complete') {
        return owned === total;
      }
      if (collectionStatusFilter === 'in_progress') {
        return owned > 0 && owned < total;
      }
      return true;
    });
  }

  // Sort items locally
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (resolvedTab === 'movies' || resolvedTab === 'series' || resolvedTab === 'adult') {
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

    if (resolvedTab === 'collections') {
      let valA, valB;
      if (sortKey === 'title') {
        valA = String(a.title || '').toLowerCase();
        valB = String(b.title || '').toLowerCase();
      } else { // default to owned_count
        valA = Number(a.owned_count) || 0;
        valB = Number(b.owned_count) || 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    }

    if (resolvedTab === 'people' || resolvedTab === 'adult_people') {
      let valA, valB;
      if (sortKey === 'title') {
        valA = String(a.title || '').toLowerCase();
        valB = String(b.title || '').toLowerCase();
      } else if (sortKey === 'library_count') {
        valA = Number(a.library_count) || 0;
        valB = Number(b.library_count) || 0;
      } else if (sortKey === 'rating') { // popularity
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
    return 0;
  });

  const totalItems = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedItems = sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const shouldShowPagination = usePaginationVisibility(totalItems, pageSize);

  const summaryText = totalItems > 0
    ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalItems)} / ${totalItems}`
    : '0-0 / 0';

  const resolvePosterUrl = (path) => {
    if (!path) return '';
    if (String(path).startsWith('http://') || String(path).startsWith('https://')) {
      return path;
    }
    if (String(path).startsWith('/')) {
      return `https://image.tmdb.org/t/p/w342${path}`;
    }
    return `${API_BASE}${path}`;
  };

  const isDataLoading = (!isCollections && !isTags && isLibraryLoading) ||
    (isCollections && isCollectionsLoading) ||
    (isTags && isTagsLoading);

  const getCardProps = (item) => {
    if (isTags) {
      return {
        title: item.name,
        subtitle: t('library.tags.itemsCount', { count: item.total_count }),
        icon: emptyIcon,
      };
    }
    if (isCollections) {
      return {
        title: item.name || item.title,
        subtitle: t('library.collections.partsCount', { owned: item.owned_count, total: item.total_count }),
        imageUrl: resolvePosterUrl(item.poster_path),
        icon: emptyIcon,
        ratingImdb: item.rating_imdb,
        ratingTmdb: item.rating,
      };
    }
    if (resolvedTab === 'people' || resolvedTab === 'adult_people') {
      return {
        title: item.title,
        subtitle: item.people_role ? t(`library.people.roles.${item.people_role}`, { defaultValue: item.people_role }) : '',
        imageUrl: resolvePosterUrl(item.poster_path),
        icon: emptyIcon,
      };
    }
    const subtitleParts = [];
    if (item.year) subtitleParts.push(item.year);
    if (item.info) {
      subtitleParts.push(item.info);
    }
    return {
      title: item.title,
      subtitle: subtitleParts.join(' • '),
      imageUrl: resolvePosterUrl(item.poster_path || item.local_poster_path),
      icon: emptyIcon,
      backgroundColor: item.color,
      ratingImdb: item.rating_imdb,
      ratingTmdb: item.rating,
    };
  };

  return (
    <Page className="library-page">
      <div className="library-main">
        <div className="organizer-panel">
          {/* Row 1: Title */}
          <div className="organizer-panel__row">
            <span className="organizer-panel__title">{t('library.title')}</span>
          </div>

          {/* Row 2: Tabs and Search */}
          <div className="organizer-panel__row">
            <Tabs
              tabs={tabs}
              value={resolvedTab}
              onChange={setActiveTab}
            />
            <div className="organizer-search">
              <Search size={14} className="organizer-search__icon" />
              <SearchInput
                key={resolvedTab}
                placeholder={searchPlaceholder}
                onSearchChange={setSearchQuery}
              />
            </div>
          </div>

          {/* Row 3: Sorters and Filters */}
          <div className="organizer-panel__row library-filters-row">
            <div className="library-filters-left">
              {(resolvedTab === 'movies' || resolvedTab === 'series' || resolvedTab === 'collections' || resolvedTab === 'adult_collections' || resolvedTab === 'adult' || resolvedTab === 'people' || resolvedTab === 'adult_people') && (
                <div className="library-sorter-container">
                  <span className="library-sorter-label">{t('library.sort.label') || 'Sort:'}</span>
                  <Dropdown
                    variant="sorter"
                    value={sortKey}
                    onChange={(e) => {
                      setSortKey(e.target.value);
                      setCurrentPage(1);
                    }}
                    sortDirection={sortDirection}
                    onSortDirectionToggle={() => {
                      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                      setCurrentPage(1);
                    }}
                    options={
                      (resolvedTab === 'collections' || resolvedTab === 'adult_collections')
                        ? [
                            { value: 'owned_count', label: t('library.sort.ownedCount') || 'Item Count' },
                            { value: 'title', label: t('library.sort.title') || 'Title' },
                          ]
                        : (resolvedTab === 'people' || resolvedTab === 'adult_people')
                        ? [
                            { value: 'library_count', label: t('library.sort.libraryCount') || 'Library Count' },
                            { value: 'rating', label: t('library.sort.popularity') || 'Popularity' },
                            { value: 'title', label: t('library.sort.title') || 'Name' },
                            { value: 'birthday', label: t('library.sort.birthday') || 'Birthdate' },
                            { value: 'user_rating', label: t('library.sort.userRating') || 'User Rating' },
                          ]
                        : [
                            { value: 'title', label: t('library.sort.title') || 'Title' },
                            { value: 'year', label: resolvedTab === 'series' ? (t('library.sort.firstAirYear') || 'First Air Year') : (t('library.sort.year') || 'Year') },
                            { value: 'release_date', label: resolvedTab === 'series' ? (t('library.sort.firstAirDate') || 'First Air Date') : (t('library.sort.releaseDate') || 'Release Date') },
                            { value: 'rating_imdb', label: t('library.sort.imdbRating') || 'IMDb Rating' },
                            { value: 'rating', label: t('library.sort.tmdbRating') || 'TMDb Rating' },
                            { value: 'user_rating', label: t('library.sort.userRating') || 'User Rating' },
                            { value: 'duration', label: t('library.sort.duration') || 'Duration' },
                            { value: 'file_size', label: t('library.sort.fileSize') || 'File Size' },
                            { value: 'last_watched', label: t('library.sort.lastWatched') || 'Last Watched' },
                          ]
                    }
                  />
                </div>
              )}

              {isCollections && (
                <div className="library-sorter-container">
                  <span className="library-sorter-label">{t('library.filter.statusLabel') || 'Status:'}</span>
                  <Dropdown
                    variant="sorter"
                    value={collectionStatusFilter}
                    onChange={(e) => {
                      setCollectionStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 'all', label: t('library.filter.all') || 'All' },
                      { value: 'complete', label: t('library.filter.complete') || 'Complete' },
                      { value: 'in_progress', label: t('library.filter.inProgress') || 'In Progress' },
                    ]}
                  />
                </div>
              )}

              {isPeople && (
                <div className="library-sorter-container">
                  <span className="library-sorter-label">{t('library.filter.roleLabel') || 'Role:'}</span>
                  <Dropdown
                    variant="sorter"
                    value={peopleRoleFilter}
                    onChange={(e) => {
                      setPeopleRoleFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 'all', label: t('library.filter.all') || 'All' },
                      { value: 'actor', label: t('library.people.roles.actor') || 'Actor' },
                      { value: 'director', label: t('library.people.roles.director') || 'Director' },
                      { value: 'writer', label: t('library.people.roles.writer') || 'Writer' },
                    ]}
                  />
                </div>
              )}

              {isPeople && (resolvedTab !== 'adult_people' || !settings?.adult_gender_preference || settings.adult_gender_preference === 'all') && (
                <div className="library-sorter-container">
                  <span className="library-sorter-label">{t('library.filter.genderLabel') || 'Gender:'}</span>
                  <Dropdown
                    variant="sorter"
                    value={genderFilter}
                    onChange={(e) => {
                      setGenderFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 'all', label: t('library.filter.all') || 'All' },
                      { value: 'female', label: t('library.filter.female') || 'Female' },
                      { value: 'male', label: t('library.filter.male') || 'Male' },
                    ]}
                  />
                </div>
              )}

              {(resolvedTab === 'movies' || resolvedTab === 'series' || resolvedTab === 'adult') && (
                <div className="library-sorter-container">
                  <span className="library-sorter-label">{t('library.filter.label') || 'Filter:'}</span>
                  <Dropdown
                    variant="sorter"
                    value={ownershipFilter}
                    onChange={(e) => {
                      setOwnershipFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 'owned', label: t('library.filter.have') || 'Have' },
                      { value: 'unowned', label: t('library.filter.missing') || 'Missing' },
                    ]}
                  />
                </div>
              )}

              {(resolvedTab === 'movies' || resolvedTab === 'series' || resolvedTab === 'adult') && (
                <div className="library-sorter-container">
                  <span className="library-sorter-label">{t('library.filter.statusLabel') || 'Status:'}</span>
                  <Dropdown
                    variant="sorter"
                    value={watchedFilter}
                    onChange={(e) => {
                      setWatchedFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 'all', label: t('library.filter.all') || 'All' },
                      { value: 'watched', label: t('library.filter.watched') || 'Watched' },
                      { value: 'unwatched', label: t('library.filter.unwatched') || 'Unwatched' },
                    ]}
                  />
                </div>
              )}

              {(resolvedTab === 'movies' || resolvedTab === 'series' || resolvedTab === 'adult') && (
                <div className="library-sorter-container">
                  <span className="library-sorter-label">{t('library.filter.genreLabel') || 'Genre:'}</span>
                  <Dropdown
                    variant="sorter"
                    value={genreFilter}
                    onChange={(e) => {
                      setGenreFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: '', label: t('library.filter.allGenres') || 'All Genres' },
                      ...(filterData?.genres || []).map(g => ({ value: g, label: g })),
                    ]}
                  />
                </div>
              )}
            </div>

            {isPeople && (
              <button
                type="button"
                className={`library-favorite-pill ${favoriteFilter === 'favorites' ? 'active' : ''}`}
                onClick={() => {
                  setFavoriteFilter(prev => prev === 'favorites' ? 'all' : 'favorites');
                  setCurrentPage(1);
                }}
              >
                {t('library.filter.favorite') || 'Favourite'}
              </button>
            )}
          </div>
        </div>

        {/* Top Pagination Bar */}
        {shouldShowPagination ? (
          <PaginationBar
            summaryText={summaryText}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={[20, 40, 80, 160]}
            showPageSizes
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            labels={t('organizer.pagination')}
          />
        ) : null}

        {/* Content Area */}
        <div className="library-content">
          {isDataLoading && paginatedItems.length === 0 ? (
            <div className="library-loading">
              <div className="library-spinner" />
            </div>
          ) : paginatedItems.length > 0 ? (
            <PosterGrid>
              {paginatedItems.map((item) => (
                <PosterCard
                  key={isTags ? item.name : item.id}
                  {...getCardProps(item)}
                />
              ))}
            </PosterGrid>
          ) : (
            <EmptyState
              title={emptyTitle}
              description={emptyDescription}
              icon={emptyIcon}
            />
          )}
        </div>

        {/* Bottom Pagination Bar */}
        {shouldShowPagination && paginatedItems.length > 0 ? (
          <PaginationBar
            summaryText={summaryText}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            labels={t('organizer.pagination')}
          />
        ) : null}

        {shouldShowPagination && paginatedItems.length > 0 ? (
          <div className="library-bottom-spacer" aria-hidden="true" />
        ) : null}
      </div>
    </Page>
  );
}
