import { useEffect, useMemo, useState } from 'react';
import {
  EXTRA_CATEGORY_BY_TAB,
  MANUAL_REVIEW_STATUSES,
  mapDiscoveryItemRow,
  mapExtraRow,
  MATCHED_STATUSES,
  normalizeItemStatus,
} from './organizerMappers';
import { scrollOrganizerToTop } from './organizerScroll';
import { useOrganizerTabState } from './hooks/useOrganizerTabState';
import { useOrganizerPaginationSort } from './hooks/useOrganizerPaginationSort';
import { useOrganizerDetailsState } from './hooks/useOrganizerDetailsState';
import { useFileSelection } from './hooks/useFileSelection';

export function useOrganizerPageState({ discovery, t }) {
  const {
    activeMainTab,
    setActiveMainTab,
    activeExtrasTab,
    setActiveExtrasTab,
    activeManualTab,
    setActiveManualTab,
  } = useOrganizerTabState();

  const [dismissedRowIds, setDismissedRowIds] = useState(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissedRowIds(new Set());
  }, [discovery]);

  const reviewDiscoveryMedia = useMemo(
    () => [
      ...(discovery.manual || []),
      ...(discovery.movies || []),
      ...(discovery.series || []),
    ],
    [discovery],
  );

  const matchedDiscoveryMedia = useMemo(
    () => [
      ...(discovery.movies || []),
      ...(discovery.series || []),
      ...(discovery.collisions || []),
    ],
    [discovery],
  );

  const tabCounts = useMemo(() => {
    const manualCount = reviewDiscoveryMedia.filter((item) => {
      const id = `item-${item.id}`;
      return !dismissedRowIds.has(id) && MANUAL_REVIEW_STATUSES.has(normalizeItemStatus(item.status));
    }).length;

    const manualMoviesCount = reviewDiscoveryMedia.filter((item) => {
      const id = `item-${item.id}`;
      return !dismissedRowIds.has(id) && item.type === 'movie' && MANUAL_REVIEW_STATUSES.has(normalizeItemStatus(item.status));
    }).length;

    const manualEpisodesCount = reviewDiscoveryMedia.filter((item) => {
      const id = `item-${item.id}`;
      return !dismissedRowIds.has(id) && item.type !== 'movie' && MANUAL_REVIEW_STATUSES.has(normalizeItemStatus(item.status));
    }).length;

    const moviesCount = matchedDiscoveryMedia.filter((item) => {
      const id = `item-${item.id}`;
      return !dismissedRowIds.has(id) && item.type === 'movie' && MATCHED_STATUSES.has(normalizeItemStatus(item.status));
    }).length;

    const episodesCount = matchedDiscoveryMedia.filter((item) => {
      const id = `item-${item.id}`;
      return !dismissedRowIds.has(id) && item.type === 'episode' && MATCHED_STATUSES.has(normalizeItemStatus(item.status));
    }).length;

    const extrasCount = (discovery.extras || []).filter((item) => {
      const id = `extra-${item.id}`;
      const parentId = `item-${item.parent_id || item.parent_item_id}`;
      return !dismissedRowIds.has(id) && !dismissedRowIds.has(parentId);
    }).length;

    return { manualCount, manualMoviesCount, manualEpisodesCount, moviesCount, episodesCount, extrasCount };
  }, [discovery, matchedDiscoveryMedia, reviewDiscoveryMedia, dismissedRowIds]);

  const tabFilteredRows = useMemo(() => {
    let rows = [];
    if (activeMainTab === 'manual') {
      rows = reviewDiscoveryMedia
        .filter((item) => {
          const isTargetType = activeManualTab === 'movies' ? item.type === 'movie' : item.type !== 'movie';
          return isTargetType && MANUAL_REVIEW_STATUSES.has(normalizeItemStatus(item.status));
        })
        .map((item) => mapDiscoveryItemRow(item, t));
    } else if (activeMainTab === 'movies') {
      rows = matchedDiscoveryMedia
        .filter((item) => item.type === 'movie' && MATCHED_STATUSES.has(normalizeItemStatus(item.status)))
        .map((item) => mapDiscoveryItemRow(item, t));
    } else if (activeMainTab === 'episodes') {
      rows = matchedDiscoveryMedia
        .filter((item) => item.type === 'episode' && MATCHED_STATUSES.has(normalizeItemStatus(item.status)))
        .map((item) => mapDiscoveryItemRow(item, t));
    } else if (activeMainTab === 'extras') {
      rows = (discovery.extras || [])
        .filter((item) => item.category === EXTRA_CATEGORY_BY_TAB[activeExtrasTab])
        .map((item) => mapExtraRow(item, t));
    }

    return rows.filter(
      (row) =>
        !dismissedRowIds.has(row.id) &&
        (row.rawType !== 'extra' || !dismissedRowIds.has(`item-${row.parent_id}`))
    );
  }, [activeExtrasTab, activeManualTab, activeMainTab, discovery, matchedDiscoveryMedia, reviewDiscoveryMedia, t, dismissedRowIds]);

  const {
    searchQuery,
    setSearchQuery,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    sortConfig,
    handleSortToggle,
    sortedRows,
    totalPages,
    paginatedRows,
    pageStart,
    pageEnd,
    setPageAndScrollToTop,
  } = useOrganizerPaginationSort({
    tabFilteredRows,
    activeMainTab,
    activeExtrasTab,
    activeManualTab,
  });

  const {
    activeRowId,
    setActiveRowId,
    activeImageIndex,
    isDetailsCollapsed,
    setIsDetailsCollapsed,
    activeRow,
    activeImages,
    activeImage,
    shouldShowDetailsPoster,
    shouldShowDetailsCarousel,
    handleToggleDetails,
    handleAdvanceDetailsImage,
  } = useOrganizerDetailsState({
    sortedRows,
    paginatedRows,
  });

  const {
    selectedRowIds,
    setSelectedRowIds,
    selectedRows,
    handleToggleRow,
    handleToggleAll,
    clearSelectedRows,
  } = useFileSelection({
    sortedRows,
    paginatedRows,
  });

  // Sync selected rows with paginated rows to prune out-of-view/deleted items
  useEffect(() => {
    setSelectedRowIds((current) => {
      const visibleIds = new Set(paginatedRows.map((row) => row.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [paginatedRows, setSelectedRowIds]);

  const focusFirstAvailableResult = (nextDiscovery = discovery) => {
    if (activeRowId) {
      const allIds = new Set([
        ...(nextDiscovery.manual || []).map((i) => `item-${i.id}`),
        ...(nextDiscovery.movies || []).map((i) => `item-${i.id}`),
        ...(nextDiscovery.series || []).map((i) => `item-${i.id}`),
        ...(nextDiscovery.collisions || []).map((i) => `item-${i.id}`),
        ...(nextDiscovery.extras || []).map((i) => `extra-${i.id}`),
      ]);
      if (allIds.has(activeRowId)) {
        return;
      }
    }
    const reviewMedia = [
      ...(nextDiscovery.manual || []),
      ...(nextDiscovery.movies || []),
      ...(nextDiscovery.series || []),
    ];
    const matchedMedia = [
      ...(nextDiscovery.movies || []),
      ...(nextDiscovery.series || []),
      ...(nextDiscovery.collisions || []),
    ];
    const movieRows = matchedMedia
      .filter((item) => item.type === 'movie' && MATCHED_STATUSES.has(normalizeItemStatus(item.status)))
      .map((item) => mapDiscoveryItemRow(item, t));
    const episodeRows = matchedMedia
      .filter((item) => item.type === 'episode' && MATCHED_STATUSES.has(normalizeItemStatus(item.status)))
      .map((item) => mapDiscoveryItemRow(item, t));
    const manualMovieRows = reviewMedia
      .filter((item) => item.type === 'movie' && MANUAL_REVIEW_STATUSES.has(normalizeItemStatus(item.status)))
      .map((item) => mapDiscoveryItemRow(item, t));
    const manualEpisodeRows = reviewMedia
      .filter((item) => item.type !== 'movie' && MANUAL_REVIEW_STATUSES.has(normalizeItemStatus(item.status)))
      .map((item) => mapDiscoveryItemRow(item, t));
    const extraTabPriority = ['bonus', 'subtitles', 'audio', 'images', 'metadata'];
    const firstExtraTab = extraTabPriority.find((tab) =>
      (nextDiscovery.extras || []).some((item) => item.category === EXTRA_CATEGORY_BY_TAB[tab]));
    const extraRows = firstExtraTab
      ? (nextDiscovery.extras || [])
          .filter((item) => item.category === EXTRA_CATEGORY_BY_TAB[firstExtraTab])
          .map((item) => mapExtraRow(item, t))
      : [];

    const firstTarget = [
      { mainTab: 'movies', rows: movieRows },
      { mainTab: 'episodes', rows: episodeRows },
      { mainTab: 'manual', rows: manualMovieRows, manualTab: 'movies' },
      { mainTab: 'manual', rows: manualEpisodeRows, manualTab: 'episodes' },
      { mainTab: 'extras', rows: extraRows, extrasTab: firstExtraTab },
    ].find((entry) => entry.rows.length > 0);

    if (!firstTarget) {
      setActiveRowId(null);
      return;
    }

    setActiveMainTab(firstTarget.mainTab);
    if (firstTarget.extrasTab) {
      setActiveExtrasTab(firstTarget.extrasTab);
    }
    if (firstTarget.manualTab) {
      setActiveManualTab(firstTarget.manualTab);
    }
    setSearchQuery('');
    setSelectedRowIds(new Set());
    setCurrentPage(1);
    setActiveRowId(firstTarget.rows[0].id);
    setIsDetailsCollapsed(false);
    try {
      localStorage.setItem('organizer_details_collapsed', JSON.stringify(false));
    } catch {
      // Ignore storage access errors.
    }
    scrollOrganizerToTop();
  };

  const dismissRows = (rowIds) => {
    const parentRowIds = rowIds.filter((id) => id.startsWith('item-'));
    if (parentRowIds.length === 0) return;
    setDismissedRowIds((current) => {
      const next = new Set(current);
      parentRowIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const restoreDismissedRows = () => {
    setDismissedRowIds(new Set());
  };

  const dismissedCount = dismissedRowIds.size;

  return {
    dismissRows,
    restoreDismissedRows,
    dismissedCount,
    dismissedRowIds,
    activeExtrasTab,
    activeManualTab,
    activeImage,
    activeImageIndex,
    activeImages,
    activeMainTab,
    activeRow,
    currentPage,
    handleAdvanceDetailsImage,
    handleSortToggle,
    handleToggleAll,
    handleToggleDetails,
    handleToggleRow,
    isDetailsCollapsed,
    pageSize,
    pageStart,
    pageEnd,
    paginatedRows,
    searchQuery,
    selectedRows,
    selectedRowIds,
    clearSelectedRows,
    setActiveExtrasTab,
    setActiveManualTab,
    setActiveMainTab,
    setActiveRowId,
    setPageAndScrollToTop,
    setPageSize,
    setSearchQuery,
    focusFirstAvailableResult,
    shouldShowDetailsCarousel,
    shouldShowDetailsPoster,
    sortConfig,
    sortedRows,
    tabCounts,
    totalPages,
  };
}
