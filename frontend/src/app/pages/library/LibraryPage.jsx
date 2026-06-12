import React, { useState, useEffect } from 'react';
import { useSettingsQuery } from '@/queries/settingsQueries';
import Page from '@/ui/Page';
import { Tabs } from '@/ui/Tabs';
import Input from '@/ui/Input';
import EmptyState from '@/ui/EmptyState';
import PaginationBar from '@/ui/PaginationBar';
import PosterCard from '@/ui/PosterCard';
import PosterGrid from '@/ui/PosterGrid';
import { usePaginationVisibility } from '../../hooks/usePaginationVisibility';
import { useTranslation } from '@/providers/LanguageProvider';
import { Search, Clapperboard, Tv, Users, Tag, ShieldAlert, Layers } from 'lucide-react';
import './LibraryPage.css';

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

  // Mock data for library demonstration
  const mockData = {
    movies: [
      { id: 1, title: 'Interstellar', year: 2014, rating: '8.6', info: 'Sci-Fi, Drama', color: 'linear-gradient(135deg, #0b132b 0%, #1c2541 100%)' },
      { id: 2, title: 'Inception', year: 2010, rating: '8.8', info: 'Sci-Fi, Action', color: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)' },
      { id: 3, title: 'The Dark Knight', year: 2008, rating: '9.0', info: 'Action, Crime', color: 'linear-gradient(135deg, #090a0f 0%, #1f2421 100%)' },
      { id: 4, title: 'Pulp Fiction', year: 1994, rating: '8.9', info: 'Crime, Drama', color: 'linear-gradient(135deg, #7c2d12 0%, #3c0c00 100%)' },
      { id: 5, title: 'Blade Runner 2049', year: 2017, rating: '8.0', info: 'Sci-Fi, Mystery', color: 'linear-gradient(135deg, #04383f 0%, #0a0f1d 100%)' },
      { id: 6, title: 'Dune: Part Two', year: 2024, rating: '8.7', info: 'Sci-Fi, Adventure', color: 'linear-gradient(135deg, #2d1e02 0%, #120b00 100%)' },
      { id: 7, title: 'The Matrix', year: 1999, rating: '8.7', info: 'Sci-Fi, Action', color: 'linear-gradient(135deg, #022c22 0%, #064e3b 100%)' },
      { id: 8, title: 'Gladiator', year: 2000, rating: '8.5', info: 'Action, Drama', color: 'linear-gradient(135deg, #451a03 0%, #78350f 100%)' },
      { id: 9, title: 'Avatar: The Way of Water', year: 2022, rating: '7.6', info: 'Sci-Fi, Adventure', color: 'linear-gradient(135deg, #0369a1 0%, #0c4a6e 100%)' },
      { id: 10, title: 'Spider-Man: Into the Spider-Verse', year: 2018, rating: '8.4', info: 'Animation, Action', color: 'linear-gradient(135deg, #4d0725 0%, #1f000c 100%)' },
      { id: 11, title: 'Oppenheimer', year: 2023, rating: '8.4', info: 'Biography, Drama', color: 'linear-gradient(135deg, #172554 0%, #080e21 100%)' },
      { id: 12, title: 'Whiplash', year: 2014, rating: '8.5', info: 'Drama, Music', color: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)' },
      { id: 13, title: 'The Prestige', year: 2006, rating: '8.5', info: 'Drama, Mystery', color: 'linear-gradient(135deg, #2e1065 0%, #0f052d 100%)' },
      { id: 14, title: 'Parasite', year: 2019, rating: '8.5', info: 'Drama, Thriller', color: 'linear-gradient(135deg, #14532d 0%, #052e16 100%)' },
      { id: 15, title: 'Shutter Island', year: 2010, rating: '8.2', info: 'Mystery, Thriller', color: 'linear-gradient(135deg, #374151 0%, #111827 100%)' },
      { id: 16, title: 'Fight Club', year: 1999, rating: '8.8', info: 'Drama', color: 'linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)' },
      { id: 17, title: 'The Departed', year: 2006, rating: '8.5', info: 'Crime, Thriller', color: 'linear-gradient(135deg, #075985 0%, #0369a1 100%)' },
      { id: 18, title: 'Django Unchained', year: 2012, rating: '8.4', info: 'Drama, Western', color: 'linear-gradient(135deg, #7c2d12 0%, #431407 100%)' },
      { id: 19, title: 'Se7en', year: 1995, rating: '8.6', info: 'Crime, Drama', color: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)' },
      { id: 20, title: 'The Fellowship of the Ring', year: 2001, rating: '8.8', info: 'Fantasy, Adventure', color: 'linear-gradient(135deg, #064e3b 0%, #0f291e 100%)' },
    ],
    collections: [],
    series: [
      { id: 1, title: 'Breaking Bad', year: '2008-2013', rating: '9.5', info: '5 Seasons', color: 'linear-gradient(135deg, #052e16 0%, #022c22 100%)' },
      { id: 2, title: 'Stranger Things', year: '2016-Present', rating: '8.7', info: '4 Seasons', color: 'linear-gradient(135deg, #4c0519 0%, #1e0010 100%)' },
      { id: 3, title: 'Chernobyl', year: '2019', rating: '9.4', info: '1 Season', color: 'linear-gradient(135deg, #2e2e00 0%, #141400 100%)' },
      { id: 4, title: 'Game of Thrones', year: '2011-2019', rating: '9.2', info: '8 Seasons', color: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)' },
    ],
    people: [
      { id: 1, title: 'Christopher Nolan', year: 'Director', rating: null, info: '12 Movies', color: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' },
      { id: 2, name: 'Leonardo DiCaprio', title: 'Leonardo DiCaprio', year: 'Actor', rating: '8.2', info: '24 Movies', color: 'linear-gradient(135deg, #172554 0%, #0f172a 100%)' },
      { id: 3, name: 'Hans Zimmer', title: 'Hans Zimmer', year: 'Composer', rating: null, info: '45 Albums', color: 'linear-gradient(135deg, #3b0764 0%, #0f172a 100%)' },
    ],
    adult: [],
    adult_people: [],
    tags: [
      { id: 1, title: '4K Ultra HD', year: 'Tag', rating: null, info: '120 items', color: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)' },
      { id: 2, title: 'Favorites', year: 'Tag', rating: null, info: '32 items', color: 'linear-gradient(135deg, #451a03 0%, #1c1917 100%)' },
      { id: 3, title: 'Sci-Fi', year: 'Tag', rating: null, info: '88 items', color: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' },
    ]
  };

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

  // Filter items matching the query
  const rawItems = mockData[resolvedTab] || [];
  const filteredItems = rawItems.filter(item => 
    item.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalItems = filteredItems.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const shouldShowPagination = usePaginationVisibility(totalItems, pageSize);

  const summaryText = totalItems > 0 
    ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalItems)} / ${totalItems}`
    : '0-0 / 0';

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
              <Input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
          {paginatedItems.length > 0 ? (
            <PosterGrid>
              {paginatedItems.map((item) => (
                <PosterCard
                  key={item.id}
                  backgroundColor={item.color}
                  icon={emptyIcon}
                  title={item.title}
                  subtitle={`${item.year}${item.info ? ` • ${item.info}` : ''}`}
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
