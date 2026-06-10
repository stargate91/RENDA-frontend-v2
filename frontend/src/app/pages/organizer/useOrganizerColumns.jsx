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
  onOpenMatch,
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
    onOpenMatch,
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
    onOpenMatch,
  ]);

  return { columns };
}
