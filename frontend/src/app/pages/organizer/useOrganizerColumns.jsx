import { useMemo } from 'react';
import SortButton from '../../ui/SortButton';
import { buildOrganizerColumns } from './organizerTableConfig';

export function useOrganizerColumns({
  activeExtrasTab,
  activeMainTab,
  collisionStrategy,
  handleSortToggle,
  handleToggleAll,
  handleToggleRow,
  normalizeStatusTone,
  paginatedRows,
  selectedRowIds,
  sortConfig,
  t,
}) {
  const renderSortableLabel = (label, key) => (
    <SortButton
      isActive={sortConfig.key === key}
      label={label}
      onToggle={() => handleSortToggle(key)}
      sortDirection={sortConfig.direction}
    />
  );

  const columns = useMemo(() => buildOrganizerColumns({
    activeExtrasTab,
    activeMainTab,
    collisionStrategy,
    handleToggleAll,
    handleToggleRow,
    normalizeStatusTone,
    paginatedRows,
    renderSortableLabel,
    selectedRowIds,
    t,
  }), [
    activeExtrasTab,
    activeMainTab,
    collisionStrategy,
    handleToggleAll,
    handleToggleRow,
    normalizeStatusTone,
    paginatedRows,
    renderSortableLabel,
    selectedRowIds,
    t,
  ]);

  return { columns };
}
