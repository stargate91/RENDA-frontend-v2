import Page from '@/ui/Page';
import PaginationBar from '@/ui/PaginationBar';
import NavButton from '@/ui/NavButton';
import { Info, X } from 'lucide-react';
import Button from '@/ui/Button';
import { useLibraryState } from './hooks/useLibraryState';
import { useLibraryModals } from './hooks/useLibraryModals';
import LibraryModeChooser from './components/LibraryModeChooser';
import LibraryHeader from './components/LibraryHeader';
import LibraryFilters from './components/LibraryFilters';
import LibraryGrid from './components/LibraryGrid';
import UtilityBarPortal from '../../../components/UtilityBarPortal';
import { useDeleteTagMutation, useScanStatusQuery } from '@/queries';
import { useUi } from '@/providers/UiProvider';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import './LibraryPage.css';

const getBulkImportBannerStorageKey = (isAdultMode) => isAdultMode ? 'showBulkImportBanner:nsfw' : 'showBulkImportBanner:sfw';
const getBulkImportResolveStatePrefix = (isAdultMode) => `bulkImportResolvedRows:${isAdultMode ? 'nsfw' : 'sfw'}:`;

export default function LibraryPage({ initialTab = 'movies', lockTab = false, showTabs = true, pageTitle = null }) {
  const state = useLibraryState({ initialTab, lockTab, includeTagsTab: true });
  const queryClient = useQueryClient();
  const { openModal, closeModal } = useUi();
  const [focusedTagName, setFocusedTagName] = useState(null);
  const deleteTagMutation = useDeleteTagMutation();
  const modals = useLibraryModals({
    state,
    focusedTagName,
    setFocusedTagName,
    deleteTagMutation,
  });

  const isAdultMode = state.activeSessionMode === 'nsfw';
  const [showBulkImportBanner, setShowBulkImportBanner] = useState(() => localStorage.getItem(getBulkImportBannerStorageKey(isAdultMode)) === 'true');
  const isPeopleTab = state.resolvedTab === 'people' || state.resolvedTab === 'adult_people';

  const scanStatusQuery = useScanStatusQuery({ enabled: isPeopleTab });
  const prevPeopleImportCurrent = useRef(0);

  useEffect(() => {
    const data = scanStatusQuery.data;
    if (!data) {
      return;
    }

    if (data.active && data.phase === 'people_importing') {
      const current = Number(data.current || 0);
      if (current > prevPeopleImportCurrent.current) {
        prevPeopleImportCurrent.current = current;
        queryClient.invalidateQueries({ queryKey: ['library'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      }
    } else {
      prevPeopleImportCurrent.current = 0;
    }
  }, [queryClient, scanStatusQuery.data]);

  useEffect(() => {
    if (!state.isTags && focusedTagName !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedTagName(null);
    }
  }, [state.isTags, focusedTagName]);

  useEffect(() => {
    setShowBulkImportBanner(localStorage.getItem(getBulkImportBannerStorageKey(isAdultMode)) === 'true');
  }, [isAdultMode]);

  useEffect(() => {
    const handlePeopleBulkImportComplete = (event) => {
      if (event.detail?.hasUnresolved && Boolean(event.detail?.adultOnly) === isAdultMode) {
        setShowBulkImportBanner(true);
      }
    };

    window.addEventListener('people-bulk-import-complete', handlePeopleBulkImportComplete);
    return () => {
      window.removeEventListener('people-bulk-import-complete', handlePeopleBulkImportComplete);
    };
  }, []);

  const focusedTag = useMemo(() => {
    if (!state.isTags || !focusedTagName) return null;
    return state.sortedItems.find((item) => item.name === focusedTagName) || null;
  }, [focusedTagName, state.isTags, state.sortedItems]);

  const isTagFocusMode = state.isTags && !!focusedTag;

  const dismissBulkImportBanner = () => {
    setShowBulkImportBanner(false);
    localStorage.removeItem(getBulkImportBannerStorageKey(isAdultMode));
    try {
      const resolveStatePrefix = getBulkImportResolveStatePrefix(isAdultMode);
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(resolveStatePrefix)) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore storage cleanup failures.
    }
  };

  const handleDismissBulkImportBanner = () => {
    openModal({
      title: state.t(isAdultMode ? 'library.addPeople.adultBulkPendingConfirmTitle' : 'library.addPeople.bulkPendingConfirmTitle'),
      description: state.t(isAdultMode ? 'library.addPeople.adultBulkPendingConfirmDescription' : 'library.addPeople.bulkPendingConfirmDescription'),
      variant: 'danger',
      content: (
        <div className="ui-modal__body-text">
          {state.t(isAdultMode ? 'library.addPeople.adultBulkPendingConfirmBody' : 'library.addPeople.bulkPendingConfirmBody')}
        </div>
      ),
      footer: (
        <div className="library-modal-footer">
          <Button variant="secondary-neutral" onClick={closeModal}>
            {state.t('common.cancel') || 'Cancel'}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              dismissBulkImportBanner();
              closeModal();
            }}
          >
            {state.t(isAdultMode ? 'library.addPeople.adultBulkPendingConfirmConfirm' : 'library.addPeople.bulkPendingConfirmConfirm')}
          </Button>
        </div>
      ),
    });
  };

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

        {showBulkImportBanner && (state.resolvedTab === 'people' || state.resolvedTab === 'adult_people') && (
          <div className="library-bulk-banner">
            <div className="library-bulk-banner__message">
              <span className="library-bulk-banner__icon" aria-hidden="true">
                <Info size={16} />
              </span>
              <span className="library-bulk-banner__text">
                {state.t(isAdultMode ? 'library.addPeople.adultBannerPendingActions' : 'library.addPeople.bannerPendingActions')}
              </span>
            </div>
            <div className="library-bulk-banner__actions">
              <button
                type="button"
                onClick={modals.openBulkImportResolveModal}
                className="ui-button ui-button--sm ui-button--secondary"
              >
                {state.t(isAdultMode ? 'library.addPeople.adultResolveMatches' : 'library.addPeople.resolveMatches')}
              </button>
              <button
                type="button"
                aria-label={state.t('common.close') || 'Close'}
                onClick={handleDismissBulkImportBanner}
                className="library-bulk-banner__dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

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

        <LibraryGrid
          key={`${state.resolvedTab}:${state.currentPage}:${state.pageSize}:${state.sortKey}:${state.sortDirection}`}
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
