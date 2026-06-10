import { useMemo } from 'react';
import { Database, Inbox } from 'lucide-react';

export function useOrganizerViewModel({
  discovery,
  discoveryItemCount,
  isBrowseStarting,
  isDiscoveryCountReady,
  isLoadingAll,
  isRenameStarting,
  isScanActive,
  pageEnd,
  pageStart,
  scanPhase,
  sortedRows,
  t,
}) {
  return useMemo(() => {
    const loadedMediaCount = (discovery.manual?.length || 0)
      + (discovery.movies?.length || 0)
      + (discovery.series?.length || 0)
      + (discovery.collisions?.length || 0);
    const hasVisibleItems = loadedMediaCount > 0 || (discovery.extras?.length || 0) > 0;
    const hasDatabaseItems = isDiscoveryCountReady && discoveryItemCount > 0;
    const remainingDiscoveryCount = isDiscoveryCountReady
      ? Math.max(0, discoveryItemCount - loadedMediaCount)
      : null;
    const shouldShowLoadRest = hasVisibleItems && isDiscoveryCountReady && remainingDiscoveryCount > 0;
    const summaryText = `${pageStart}-${pageEnd} / ${sortedRows.length}`;

    const loadingState = isLoadingAll
      ? {
        label: t('organizer.loadingStates.loadAll.label'),
        description: t('organizer.loadingStates.loadAll.description'),
      }
      : isScanActive && scanPhase === 'organizing'
        ? {
          label: t('organizer.loadingStates.rename.label'),
          description: t('organizer.loadingStates.rename.description'),
        }
        : isScanActive
          ? {
            label: t('organizer.loadingStates.scan.label'),
            description: t('organizer.loadingStates.scan.description'),
          }
          : null;

    const emptyState = !hasVisibleItems
      && !loadingState
      ? hasDatabaseItems
        ? {
          icon: Inbox,
          title: t('organizer.emptyStates.notLoaded.title'),
          description: t('organizer.emptyStates.notLoaded.description'),
        }
        : {
          icon: Database,
          title: t('organizer.emptyStates.emptyDatabase.title'),
          description: t('organizer.emptyStates.emptyDatabase.description'),
        }
      : null;

    return {
      browseButtonLabel: isBrowseStarting ? t('organizer.buttons.opening') : isScanActive ? t('organizer.buttons.scanning') : t('organizer.buttons.browseAndScan'),
      emptyState,
      hasDatabaseItems,
      hasVisibleItems,
      loadAllButtonLabel: isLoadingAll
        ? t('organizer.buttons.loadingAll')
        : isDiscoveryCountReady
          ? `${t('organizer.buttons.loadAll')} (${discoveryItemCount})`
          : t('organizer.buttons.loadAll'),
      loadRestButtonLabel: isLoadingAll
        ? t('organizer.buttons.loadingAll')
        : isDiscoveryCountReady
          ? `${t('organizer.buttons.loadTheRest')} (${remainingDiscoveryCount})`
          : t('organizer.buttons.loadTheRest'),
      loadingState,
      renameButtonLabel: isRenameStarting || (isScanActive && scanPhase === 'organizing')
        ? t('organizer.buttons.organizing')
        : t('organizer.buttons.rename'),
      shouldShowDetailsPanel: !emptyState && !loadingState,
      shouldShowLoadRest,
      summaryText,
    };
  }, [
    discovery,
    discoveryItemCount,
    isBrowseStarting,
    isDiscoveryCountReady,
    isLoadingAll,
    isRenameStarting,
    isScanActive,
    pageEnd,
    pageStart,
    scanPhase,
    sortedRows.length,
    t,
  ]);
}
