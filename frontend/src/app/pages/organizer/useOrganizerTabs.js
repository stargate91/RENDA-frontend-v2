import { useMemo } from 'react';
import { EXTRA_CATEGORY_BY_TAB } from './organizerMappers';
import { EXTRAS_TABS, MAIN_TABS, MANUAL_TABS } from './organizerConstants';

export function useOrganizerTabs({ discoveryExtras, t, tabCounts, dismissedRowIds }) {
  const computedMainTabs = useMemo(() => MAIN_TABS.map((tab) => ({
    ...tab,
    label: t(tab.labelKey),
    count: tab.value === 'manual'
      ? tabCounts.manualCount
      : tab.value === 'movies'
        ? tabCounts.moviesCount
        : tab.value === 'episodes'
          ? tabCounts.episodesCount
          : tabCounts.extrasCount,
  })), [t, tabCounts]);

  const computedManualTabs = useMemo(() => MANUAL_TABS.map((tab) => ({
    ...tab,
    label: t(tab.labelKey),
    count: tab.value === 'movies'
      ? tabCounts.manualMoviesCount
      : tabCounts.manualEpisodesCount,
  })), [t, tabCounts]);

  const computedExtrasTabs = useMemo(() => EXTRAS_TABS.map((tab) => ({
    ...tab,
    label: t(tab.labelKey),
    count: (discoveryExtras || []).filter((item) => {
      if (item.category !== EXTRA_CATEGORY_BY_TAB[tab.value]) {
        return false;
      }
      if (dismissedRowIds) {
        const id = `extra-${item.id}`;
        const parentId = `item-${item.parent_id || item.parent_item_id}`;
        if (dismissedRowIds.has(id) || dismissedRowIds.has(parentId)) {
          return false;
        }
      }
      return true;
    }).length,
  })), [discoveryExtras, t, dismissedRowIds]);

  return {
    computedExtrasTabs,
    computedManualTabs,
    computedMainTabs,
  };
}
