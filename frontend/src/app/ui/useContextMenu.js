import { useState, useCallback } from 'react';

export function useContextMenu(selectedRows = []) {
  const [contextMenu, setContextMenu] = useState(null);

  const handleRowContextMenu = useCallback((event, row) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      row,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const activeRow = contextMenu?.row || null;
  const isClickedRowSelected = Boolean(
    activeRow && selectedRows.some((r) => r.id === activeRow.id)
  );
  const useBulkActions = isClickedRowSelected && selectedRows.length > 0;

  return {
    contextMenu,
    handleRowContextMenu,
    closeContextMenu,
    activeRow,
    isClickedRowSelected,
    useBulkActions,
  };
}
