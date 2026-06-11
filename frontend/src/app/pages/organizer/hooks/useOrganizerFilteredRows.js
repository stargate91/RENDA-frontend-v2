import { useMemo } from 'react';
import {
  EXTRA_CATEGORY_BY_TAB,
  MANUAL_REVIEW_STATUSES,
  mapDiscoveryItemRow,
  mapExtraRow,
  MATCHED_STATUSES,
  normalizeItemStatus,
} from '../organizerMappers';

export function useOrganizerFilteredRows({
  discovery,
  t,
  activeMainTab,
  activeExtrasTab,
  activeManualTab,
  dismissedRowIds,
}) {
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

  return {
    reviewDiscoveryMedia,
    matchedDiscoveryMedia,
    tabCounts,
    tabFilteredRows,
  };
}
