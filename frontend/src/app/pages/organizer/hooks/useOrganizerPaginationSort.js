import { useState, useEffect, useMemo } from 'react';
import { useOrganizerSort } from '../useOrganizerSort';
import { compareOrganizerValues } from '../organizerMappers';
import { scrollOrganizerToTop } from '../organizerScroll';

export function useOrganizerPaginationSort({
  tabFilteredRows = [],
  activeMainTab,
  activeExtrasTab,
  activeManualTab,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(40);
  const { sortConfig, setSortConfig, handleSortToggle } = useOrganizerSort('source', 'asc');

  // Reset currentPage to 1 on tab or search query change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [activeMainTab, activeExtrasTab, activeManualTab, searchQuery]);

  // Reset sort config on tab changes
  useEffect(() => {
    setSortConfig({ key: 'source', direction: 'asc' });
  }, [activeExtrasTab, activeMainTab, activeManualTab, setSortConfig]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return tabFilteredRows;
    }

    return tabFilteredRows.filter(
      (row) =>
        row.source.toLowerCase().includes(query) ||
        row.target.toLowerCase().includes(query) ||
        (row.type && row.type.toLowerCase().includes(query)) ||
        (row.status && row.status.toLowerCase().includes(query)) ||
        (row.category && row.category.toLowerCase().includes(query)) ||
        (row.language && row.language.toLowerCase().includes(query)) ||
        (row.extension && row.extension.toLowerCase().includes(query))
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

  // Sync current page with total pages
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const setPageAndScrollToTop = (nextPage) => {
    setCurrentPage(nextPage);
    scrollOrganizerToTop();
  };

  return {
    searchQuery,
    setSearchQuery,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    sortConfig,
    setSortConfig,
    handleSortToggle,
    filteredRows,
    sortedRows,
    totalPages,
    paginatedRows,
    pageStart,
    pageEnd,
    setPageAndScrollToTop,
  };
}
