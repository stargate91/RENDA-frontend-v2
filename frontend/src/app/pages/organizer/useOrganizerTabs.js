import { useMemo } from 'react';
import { EXTRA_CATEGORY_BY_TAB } from './organizerMappers';
import { EXTRAS_TABS, MAIN_TABS } from './organizerConstants';

export function useOrganizerTabs({ discoveryExtras, t, tabCounts }) {
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

  const computedExtrasTabs = useMemo(() => EXTRAS_TABS.map((tab) => ({
    ...tab,
    label: t(tab.labelKey),
    count: (discoveryExtras || []).filter((item) => item.category === EXTRA_CATEGORY_BY_TAB[tab.value]).length,
  })), [discoveryExtras, t]);

  return {
    computedExtrasTabs,
    computedMainTabs,
  };
}
