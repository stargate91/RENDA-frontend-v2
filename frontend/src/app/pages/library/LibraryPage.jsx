import Page from '@/ui/Page';
import PaginationBar from '@/ui/PaginationBar';
import NavButton from '@/ui/NavButton';
import { useLibraryState } from './hooks/useLibraryState';
import { useLibraryModals } from './hooks/useLibraryModals';
import LibraryModeChooser from './components/LibraryModeChooser';
import LibraryHeader from './components/LibraryHeader';
import LibraryFilters from './components/LibraryFilters';
import LibraryGrid from './components/LibraryGrid';
import UtilityBarPortal from '../../../components/UtilityBarPortal';
import { useDeleteTagMutation } from '@/queries';
import { useEffect, useMemo, useState } from 'react';
import './LibraryPage.css';

export default function LibraryPage({ initialTab = 'movies', lockTab = false, showTabs = true, pageTitle = null }) {
  const state = useLibraryState({ initialTab, lockTab, includeTagsTab: true });
  const [focusedTagName, setFocusedTagName] = useState(null);
  const deleteTagMutation = useDeleteTagMutation();
  const modals = useLibraryModals({
    state,
    focusedTagName,
    setFocusedTagName,
    deleteTagMutation,
  });

  useEffect(() => {
    if (!state.isTags && focusedTagName !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedTagName(null);
    }
  }, [state.isTags, focusedTagName]);

  const focusedTag = useMemo(() => {
    if (!state.isTags || !focusedTagName) return null;
    return state.sortedItems.find((item) => item.name === focusedTagName) || null;
  }, [focusedTagName, state.isTags, state.sortedItems]);

  const isTagFocusMode = state.isTags && !!focusedTag;



  if (state.isLoading) {
    return (
      <Page className="library-page">
        <div className="library-loading">
          <div className="library-spinner" />
        </div>
      </Page>
    );
  }

  if (state.activeSessionMode === null && initialTab !== 'tags') {
    return (
      <LibraryModeChooser
        onSelectMode={state.setSessionMode}
        t={state.t}
      />
    );
  }

  const isAdultMode = state.activeSessionMode === 'nsfw';

  return (
    <Page className={`library-page ${isAdultMode ? 'library-page--nsfw' : ''}`}>
      <UtilityBarPortal enabled={state.activeSessionMode && state.settings?.include_adult}>
        <NavButton
          onClick={() => state.setSessionMode(null)}
        >
          {state.t('library.backToSelector') || 'Back'}
        </NavButton>
      </UtilityBarPortal>

      <div className="library-main">
        <div className="organizer-panel">
          <LibraryHeader
            t={state.t}
            pageTitle={pageTitle}
            tabs={state.tabs}
            resolvedTab={state.resolvedTab}
            setActiveTab={state.setActiveTab}
            searchPlaceholder={state.searchPlaceholder}
            setSearchQuery={state.setSearchQuery}
            onAddPeople={modals.openAddPeopleModal}
            onCreateTag={modals.openCreateTagModal}
            showTabs={showTabs}
            sortKey={state.sortKey}
            setSortKey={state.setSortKey}
            sortDirection={state.sortDirection}
            setSortDirection={state.setSortDirection}
            setCurrentPage={state.setCurrentPage}
            activeSessionMode={state.activeSessionMode}
          />

          {!(state.resolvedTab === 'tags' && !showTabs) ? (
            <LibraryFilters
              t={state.t}
              settings={state.settings}
              resolvedTab={state.resolvedTab}
              isCollections={state.isCollections}
              isPeople={state.isPeople}
              activeSessionMode={state.activeSessionMode}
              sortKey={state.sortKey}
              setSortKey={state.setSortKey}
              sortDirection={state.sortDirection}
              setSortDirection={state.setSortDirection}
              setCurrentPage={state.setCurrentPage}
              collectionStatusFilter={state.collectionStatusFilter}
              setCollectionStatusFilter={state.setCollectionStatusFilter}
              peopleRoleFilter={state.peopleRoleFilter}
              setPeopleRoleFilter={state.setPeopleRoleFilter}
              genderFilter={state.genderFilter}
              setGenderFilter={state.setGenderFilter}
              ownershipFilter={state.ownershipFilter}
              setOwnershipFilter={state.setOwnershipFilter}
              watchedFilter={state.watchedFilter}
              setWatchedFilter={state.setWatchedFilter}
              genreFilter={state.genreFilter}
              setGenreFilter={state.setGenreFilter}
              decadeFilter={state.decadeFilter}
              setDecadeFilter={state.setDecadeFilter}
              yearFilter={state.yearFilter}
              setYearFilter={state.setYearFilter}
              timeFilterMode={state.timeFilterMode}
              setTimeFilterMode={state.setTimeFilterMode}
              favoriteFilter={state.favoriteFilter}
              setFavoriteFilter={state.setFavoriteFilter}
              filterData={state.filterData}
            />
          ) : null}
        </div>

        {/* Top Pagination Bar */}
        {state.shouldShowPagination && !isTagFocusMode ? (
          <PaginationBar
            summaryText={state.summaryText}
            currentPage={state.currentPage}
            totalPages={state.totalPages}
            pageSize={state.pageSize}
            pageSizeOptions={[20, 40, 80, 160]}
            showPageSizes
            onPageChange={state.setCurrentPage}
            onPageSizeChange={state.setPageSize}
            labels={state.t('organizer.pagination')}
          />
        ) : null}

        {/* Content Area */}
        <LibraryGrid
          t={state.t}
          isDataLoading={state.isDataLoading}
          paginatedItems={state.paginatedItems}
          isTags={state.isTags}
          isCollections={state.isCollections}
          resolvedTab={state.resolvedTab}
          emptyTitle={state.emptyTitle}
          emptyDescription={state.emptyDescription}
          emptyStateVariant={state.emptyStateVariant}
          emptyIcon={state.emptyIcon}
          hasActiveFilters={state.hasActiveFilters}
          onAddPeople={modals.openAddPeopleModal}
          onCreateTag={modals.openCreateTagModal}
          onEditTag={modals.openEditTagModal}
          onDeleteTag={modals.openDeleteTagModal}
          focusedTag={focusedTag}
          onFocusTag={setFocusedTagName}
          onExitTagFocus={() => setFocusedTagName(null)}
          activeSessionMode={state.activeSessionMode}
        />

        {/* Bottom Pagination Bar */}
        {state.shouldShowPagination && !isTagFocusMode && state.paginatedItems.length > 0 ? (
          <PaginationBar
            summaryText={state.summaryText}
            currentPage={state.currentPage}
            totalPages={state.totalPages}
            pageSize={state.pageSize}
            onPageChange={state.setCurrentPage}
            labels={state.t('organizer.pagination')}
          />
        ) : null}

        {state.shouldShowPagination && !isTagFocusMode && state.paginatedItems.length > 0 ? (
          <div className="library-bottom-spacer" aria-hidden="true" />
        ) : null}
      </div>
    </Page>
  );
}
