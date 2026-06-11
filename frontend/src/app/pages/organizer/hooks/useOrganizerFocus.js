import {
  EXTRA_CATEGORY_BY_TAB,
  MANUAL_REVIEW_STATUSES,
  mapDiscoveryItemRow,
  mapExtraRow,
  MATCHED_STATUSES,
  normalizeItemStatus,
} from '../organizerMappers';
import { scrollOrganizerToTop } from '../organizerScroll';

export function useOrganizerFocus({
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
}) {
  const focusFirstAvailableResult = (nextDiscovery = discovery) => {
    if (activeRowId) {
      const allIds = new Set([
        ...(nextDiscovery.manual || []).map((i) => `item-${i.id}`),
        ...(nextDiscovery.movies || []).map((i) => `item-${i.id}`),
        ...(nextDiscovery.series || []).map((i) => `item-${i.id}`),
        ...(nextDiscovery.collisions || []).map((i) => `item-${i.id}`),
        ...(nextDiscovery.extras || []).map((i) => `extra-${i.id}`),
      ]);
      if (allIds.has(activeRowId)) {
        return;
      }
    }
    const reviewMedia = [
      ...(nextDiscovery.manual || []),
      ...(nextDiscovery.movies || []),
      ...(nextDiscovery.series || []),
    ];
    const matchedMedia = [
      ...(nextDiscovery.movies || []),
      ...(nextDiscovery.series || []),
      ...(nextDiscovery.collisions || []),
    ];
    const movieRows = matchedMedia
      .filter((item) => item.type === 'movie' && MATCHED_STATUSES.has(normalizeItemStatus(item.status)))
      .map((item) => mapDiscoveryItemRow(item, t));
    const episodeRows = matchedMedia
      .filter((item) => item.type === 'episode' && MATCHED_STATUSES.has(normalizeItemStatus(item.status)))
      .map((item) => mapDiscoveryItemRow(item, t));
    const manualMovieRows = reviewMedia
      .filter((item) => item.type === 'movie' && MANUAL_REVIEW_STATUSES.has(normalizeItemStatus(item.status)))
      .map((item) => mapDiscoveryItemRow(item, t));
    const manualEpisodeRows = reviewMedia
      .filter((item) => item.type !== 'movie' && MANUAL_REVIEW_STATUSES.has(normalizeItemStatus(item.status)))
      .map((item) => mapDiscoveryItemRow(item, t));
    const extraTabPriority = ['bonus', 'subtitles', 'audio', 'images', 'metadata'];
    const firstExtraTab = extraTabPriority.find((tab) =>
      (nextDiscovery.extras || []).some((item) => item.category === EXTRA_CATEGORY_BY_TAB[tab]));
    const extraRows = firstExtraTab
      ? (nextDiscovery.extras || [])
          .filter((item) => item.category === EXTRA_CATEGORY_BY_TAB[firstExtraTab])
          .map((item) => mapExtraRow(item, t))
      : [];

    const firstTarget = [
      { mainTab: 'movies', rows: movieRows },
      { mainTab: 'episodes', rows: episodeRows },
      { mainTab: 'manual', rows: manualMovieRows, manualTab: 'movies' },
      { mainTab: 'manual', rows: manualEpisodeRows, manualTab: 'episodes' },
      { mainTab: 'extras', rows: extraRows, extrasTab: firstExtraTab },
    ].find((entry) => entry.rows.length > 0);

    if (!firstTarget) {
      setActiveRowId(null);
      return;
    }

    setActiveMainTab(firstTarget.mainTab);
    if (firstTarget.extrasTab) {
      setActiveExtrasTab(firstTarget.extrasTab);
    }
    if (firstTarget.manualTab) {
      setActiveManualTab(firstTarget.manualTab);
    }
    setSearchQuery('');
    setSelectedRowIds(new Set());
    setCurrentPage(1);
    setActiveRowId(firstTarget.rows[0].id);
    setIsDetailsCollapsed(false);
    try {
      localStorage.setItem('organizer_details_collapsed', JSON.stringify(false));
    } catch {
      // Ignore storage access errors.
    }
    scrollOrganizerToTop();
  };

  return {
    focusFirstAvailableResult,
  };
}
