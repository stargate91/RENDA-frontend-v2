import { useEffect, useState } from 'react';

export function useOrganizerDismissState({ discovery }) {
  const [dismissedRowIds, setDismissedRowIds] = useState(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissedRowIds(new Set());
  }, [discovery]);

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
    dismissedRowIds,
    dismissedCount,
    dismissRows,
    restoreDismissedRows,
    setDismissedRowIds,
  };
}
