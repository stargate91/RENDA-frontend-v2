import { useMemo } from 'react';
import SortButton from '../../ui/SortButton';
import { buildOrganizerColumns } from './organizerTableConfig';
import { useOrganizerModals } from './useOrganizerModals';

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
  const { openMatchModal } = useOrganizerModals();

  const columns = useMemo(() => {
    const renderSortableLabel = (label, key) => (
      <SortButton
        isActive={sortConfig.key === key}
        label={label}
        onToggle={() => handleSortToggle(key)}
        sortDirection={sortConfig.direction}
      />
    );

    return buildOrganizerColumns({
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
      onOpenMatch: (row) => openMatchModal(row),
    });
  }, [
    activeExtrasTab,
    activeMainTab,
    collisionStrategy,
    handleToggleAll,
    handleToggleRow,
    normalizeStatusTone,
    paginatedRows,
    selectedRowIds,
    t,
    openMatchModal,
    sortConfig.key,
    sortConfig.direction,
    handleSortToggle,
  ]);

  return { columns };
}
