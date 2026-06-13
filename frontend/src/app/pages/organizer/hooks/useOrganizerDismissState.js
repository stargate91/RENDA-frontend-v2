import { useEffect, useState } from 'react';

export function useOrganizerDismissState({ discovery }) {
  const [dismissedRowIds, setDismissedRowIds] = useState(new Set());

  useEffect(() => {
    if (!discovery) {
      setDismissedRowIds(new Set());
      return;
    }

    const validIds = new Set([
      ...(discovery.manual || []).map((item) => `item-${item.id}`),
      ...(discovery.movies || []).map((item) => `item-${item.id}`),
      ...(discovery.series || []).map((item) => `item-${item.id}`),
      ...(discovery.collisions || []).map((item) => `item-${item.id}`),
      ...(discovery.extras || []).map((item) => `extra-${item.id}`),
    ]);

    setDismissedRowIds((current) => {
      const next = new Set();
      current.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        }
      });
      // Return same reference if nothing changed to prevent unnecessary re-renders
      return next.size === current.size ? current : next;
    });
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
