import React, { useState, useEffect } from 'react';
import { useSettingsQuery } from '@/queries/settingsQueries';
import { useLibraryQuery, useCollectionsQuery, useTagsQuery } from '@/queries/libraryQueries';
import { API_BASE } from '@/lib/backend';
import Page from '@/ui/Page';
import { Tabs } from '@/ui/Tabs';
import Input from '@/ui/Input';
import EmptyState from '@/ui/EmptyState';
import PaginationBar from '@/ui/PaginationBar';
import PosterCard from '@/ui/PosterCard';
import PosterGrid from '@/ui/PosterGrid';
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  if (isLoading) {
    return (
      <Page className="library-page">
        <div className="library-loading">
          <div className="library-spinner" />
        </div>
      </Page>
    );
  }

  // Construct tabs based on include_adult setting
  const tabs = [
    { value: 'movies', label: t('library.tabs.movies') },
    ...(settings?.folder_collection_mode !== 'never' ? [
      { value: 'collections', label: t('library.tabs.collections') }
    ] : []),
    { value: 'series', label: t('library.tabs.series') },
    { value: 'people', label: t('library.tabs.people') },
    ...(settings?.include_adult ? [
      { value: 'adult', label: t('library.tabs.adult') },
      { value: 'adult_people', label: t('library.tabs.adultPeople') },
    ] : []),
    { value: 'tags', label: t('library.tabs.tags') },
  ];

  const resolvedTab = tabs.some(tab => tab.value === activeTab) ? activeTab : 'movies';

  // Reset page when switching tabs
  useEffect(() => {
    setCurrentPage(1);
  }, [resolvedTab]);

  const isCollections = resolvedTab === 'collections';
  const isTags = resolvedTab === 'tags';

  const { data: libraryData, isLoading: isLibraryLoading } = useLibraryQuery(
    !isCollections && !isTags
      ? { tab: resolvedTab, page: 1, pageSize: 10000 }
      : null
  );

  const { data: collectionsData, isLoading: isCollectionsLoading } = useCollectionsQuery(
    isCollections
      ? { page: 1, pageSize: 10000 }
      : null
  );

  const { data: tagsData, isLoading: isTagsLoading } = useTagsQuery();

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

  const filteredItems = useLocalListSearch(allItems, searchQuery);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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

          {/* Row 3: Sorters and Filters (empty visible row) */}
          <div className="organizer-panel__row library-filters-row">
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
