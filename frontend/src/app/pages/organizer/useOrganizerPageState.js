import { useEffect, useMemo, useState } from 'react';
import {
  compareOrganizerValues,
  EXTRA_CATEGORY_BY_TAB,
  MANUAL_REVIEW_STATUSES,
  mapDiscoveryItemRow,
  mapExtraRow,
  MATCHED_STATUSES,
  normalizeItemStatus,
} from './organizerMappers';
import { scrollOrganizerToTop } from './organizerScroll';
import { useOrganizerSort } from './useOrganizerSort';

export function useOrganizerPageState({ discovery, t }) {
  const [activeMainTab, setActiveMainTab] = useState('manual');
  const [activeExtrasTab, setActiveExtrasTab] = useState('bonus');
  const [activeManualTab, setActiveManualTab] = useState('movies');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [activeRowId, setActiveRowId] = useState(null);
  const [pageSize, setPageSize] = useState(40);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const { sortConfig, setSortConfig, handleSortToggle } = useOrganizerSort('source', 'asc');
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('organizer_details_collapsed');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });
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

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return tabFilteredRows;
    }

    return tabFilteredRows.filter(
      (row) =>
        row.source.toLowerCase().includes(query)
        || row.target.toLowerCase().includes(query)
        || (row.type && row.type.toLowerCase().includes(query))
        || (row.status && row.status.toLowerCase().includes(query))
        || (row.category && row.category.toLowerCase().includes(query))
        || (row.language && row.language.toLowerCase().includes(query))
        || (row.extension && row.extension.toLowerCase().includes(query)),
    );
  }, [searchQuery, tabFilteredRows]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((left, right) => {
      const comparison = compareOrganizerValues(left?.[sortConfig.key], right?.[sortConfig.key]);
      return sortConfig.direction === 'desc' ? comparison * -1 : comparison;
    });
    return rows;
  }, [filteredRows, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedRows.slice(startIndex, startIndex + pageSize);
  }, [currentPage, pageSize, sortedRows]);

  const pageStart = sortedRows.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
  const pageEnd = Math.min(sortedRows.length, currentPage * pageSize);
  const activeRow = useMemo(
    () => sortedRows.find((row) => row.id === activeRowId) || null,
    [activeRowId, sortedRows],
  );
  const selectedRows = useMemo(
    () => sortedRows.filter((row) => selectedRowIds.has(row.id)),
    [selectedRowIds, sortedRows],
  );
  const activeImages = activeRow?.images || [];
  const activeImage = activeImages[activeImageIndex] || activeImages[0] || null;
  const shouldShowDetailsPoster = activeRow?.rawStatus === 'matched'
    && (activeRow?.rawType === 'movie' || activeRow?.rawType === 'episode');
  const shouldShowDetailsCarousel = activeRow?.rawType === 'episode' && activeImages.length > 1;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [activeMainTab, activeExtrasTab, activeManualTab, searchQuery]);

  useEffect(() => {
    setSortConfig({ key: 'source', direction: 'asc' });
  }, [activeExtrasTab, activeMainTab, activeManualTab, setSortConfig]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveRowId((current) => (paginatedRows.some((row) => row.id === current) ? current : null));
  }, [paginatedRows]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedRowIds((current) => {
      const visibleIds = new Set(paginatedRows.map((row) => row.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [paginatedRows]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveImageIndex(0);
  }, [activeRow?.id]);

  const setPageAndScrollToTop = (nextPage) => {
    setCurrentPage(nextPage);
    scrollOrganizerToTop();
  };

  const handleToggleDetails = () => {
    setIsDetailsCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem('organizer_details_collapsed', JSON.stringify(next));
      } catch {
        // Ignore storage access errors.
      }
      return next;
    });
  };

  const handleAdvanceDetailsImage = () => {
    if (activeImages.length <= 1) {
      return;
    }
    setActiveImageIndex((current) => (current + 1) % activeImages.length);
  };

  const handleToggleRow = (id) => {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    setSelectedRowIds((current) => {
      const allSelected = paginatedRows.length > 0 && paginatedRows.every((row) => current.has(row.id));
      const next = new Set(current);
      if (allSelected) {
        paginatedRows.forEach((row) => next.delete(row.id));
      } else {
        paginatedRows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  };

  const clearSelectedRows = () => {
    setSelectedRowIds(new Set());
  };



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

    const currentTabRows = activeMainTab === 'movies' ? movieRows
      : activeMainTab === 'episodes' ? episodeRows
      : activeMainTab === 'manual'
        ? (activeManualTab === 'movies' ? manualMovieRows : manualEpisodeRows)
        : activeMainTab === 'extras'
          ? (nextDiscovery.extras || [])
              .filter((item) => item.category === EXTRA_CATEGORY_BY_TAB[activeExtrasTab])
              .map((item) => mapExtraRow(item, t))
          : [];



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
