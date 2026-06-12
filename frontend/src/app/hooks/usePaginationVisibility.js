import { useMemo } from 'react';

/**
 * Custom hook to determine if pagination should be displayed.
 * Returns true if totalItems exceeds the current pageSize.
 *
 * @param {number} totalItems - Total number of items in the list.
 * @param {number} pageSize - Number of items displayed per page.
 * @returns {boolean} Whether to display the pagination controls.
 */
export function usePaginationVisibility(totalItems, pageSize) {
  return useMemo(() => totalItems > pageSize, [totalItems, pageSize]);
}
