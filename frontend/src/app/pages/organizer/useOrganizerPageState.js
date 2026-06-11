import { useEffect } from 'react';
import { useOrganizerTabState } from './hooks/useOrganizerTabState';
import { useOrganizerPaginationSort } from './hooks/useOrganizerPaginationSort';
import { useOrganizerDetailsState } from './hooks/useOrganizerDetailsState';
import { useFileSelection } from './hooks/useFileSelection';
import { useOrganizerDismissState } from './hooks/useOrganizerDismissState';
import { useOrganizerFilteredRows } from './hooks/useOrganizerFilteredRows';
import { useOrganizerFocus } from './hooks/useOrganizerFocus';

export function useOrganizerPageState({ discovery, t }) {
  const {
    activeMainTab,
    setActiveMainTab,
    activeExtrasTab,
    setActiveExtrasTab,
    activeManualTab,
    setActiveManualTab,
  } = useOrganizerTabState();

  const {
    dismissedRowIds,
    dismissedCount,
    dismissRows,
    restoreDismissedRows,
  } = useOrganizerDismissState({ discovery });

  const {
    tabCounts,
    tabFilteredRows,
  } = useOrganizerFilteredRows({
    discovery,
    t,
    activeMainTab,
    activeExtrasTab,
    activeManualTab,
    dismissedRowIds,
  });

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

  const { focusFirstAvailableResult } = useOrganizerFocus({
    discovery,
    t,
    activeRowId,
    setActiveRowId,
    setActiveMainTab,
    setActiveExtrasTab,
    setActiveManualTab,
    setSearchQuery,
    setSelectedRowIds,
    setCurrentPage,
    setIsDetailsCollapsed,
  });

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
