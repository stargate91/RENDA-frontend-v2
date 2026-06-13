import Page from '@/ui/Page';
import PaginationBar from '@/ui/PaginationBar';
import { useLibraryState } from './hooks/useLibraryState';
import LibraryHeader from './components/LibraryHeader';
import LibraryFilters from './components/LibraryFilters';
import LibraryGrid from './components/LibraryGrid';
import './LibraryPage.css';

export default function LibraryPage() {
  const state = useLibraryState();

  if (state.isLoading) {
    return (
      <Page className="library-page">
        <div className="library-loading">
          <div className="library-spinner" />
        </div>
      </Page>
    );
  }

  return (
    <Page className="library-page">
      <div className="library-main">
        <div className="organizer-panel">
          <LibraryHeader
            t={state.t}
            tabs={state.tabs}
            resolvedTab={state.resolvedTab}
            setActiveTab={state.setActiveTab}
            searchPlaceholder={state.searchPlaceholder}
            setSearchQuery={state.setSearchQuery}
          />

          <LibraryFilters
            t={state.t}
            settings={state.settings}
            resolvedTab={state.resolvedTab}
            isCollections={state.isCollections}
            isPeople={state.isPeople}
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
        </div>

        {/* Top Pagination Bar */}
        {state.shouldShowPagination ? (
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
          emptyIcon={state.emptyIcon}
        />

        {/* Bottom Pagination Bar */}
        {state.shouldShowPagination && state.paginatedItems.length > 0 ? (
          <PaginationBar
            summaryText={state.summaryText}
            currentPage={state.currentPage}
            totalPages={state.totalPages}
            pageSize={state.pageSize}
            onPageChange={state.setCurrentPage}
            labels={state.t('organizer.pagination')}
          />
        ) : null}

        {state.shouldShowPagination && state.paginatedItems.length > 0 ? (
          <div className="library-bottom-spacer" aria-hidden="true" />
        ) : null}
      </div>
    </Page>
  );
}
