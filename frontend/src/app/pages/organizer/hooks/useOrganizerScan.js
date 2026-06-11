import { useEffect, useRef, useState } from 'react';
import { selectFolder } from '../../../lib/ipc';
import { scrollOrganizerToTop } from '../organizerScroll';
import { useScanMutation } from '../../../queries';

const EMPTY_DISCOVERY = {
  manual: [],
  movies: [],
  series: [],
  extras: [],
  collisions: [],
};

const normalizePath = (value) => String(value || '').replace(/\\/g, '/').toLowerCase();

const isPathInsideFolder = (pathValue, folderPath) => {
  const path = normalizePath(pathValue);
  const folder = normalizePath(folderPath).replace(/\/+$/, '');
  return path === folder || path.startsWith(`${folder}/`);
};

const matchesAnyDroppedPath = (value, paths) => paths.some((path) => isPathInsideFolder(value, path));

const filterDiscoveryByPaths = (discovery, paths) => ({
  manual: (discovery.manual || []).filter((item) => matchesAnyDroppedPath(item.current_path || item.filename, paths)),
  movies: (discovery.movies || []).filter((item) => matchesAnyDroppedPath(item.current_path || item.filename, paths)),
  series: (discovery.series || []).filter((item) => matchesAnyDroppedPath(item.current_path || item.filename, paths)),
  collisions: (discovery.collisions || []).filter((item) => matchesAnyDroppedPath(item.current_path || item.filename, paths)),
  extras: (discovery.extras || []).filter((item) => matchesAnyDroppedPath(item.path || item.filename, paths)),
});

const mergeById = (currentItems = [], nextItems = []) => {
  const byId = new Map();
  currentItems.forEach((item) => byId.set(item.id, item));
  nextItems.forEach((item) => byId.set(item.id, item));
  return [...byId.values()];
};

const mergeDiscoveryGroups = (currentDiscovery, nextDiscovery) => {
  const nextItemIds = new Set([
    ...(nextDiscovery.manual || []).map((i) => i.id),
    ...(nextDiscovery.movies || []).map((i) => i.id),
    ...(nextDiscovery.series || []).map((i) => i.id),
    ...(nextDiscovery.collisions || []).map((i) => i.id),
  ]);

  const nextExtraIds = new Set([
    ...(nextDiscovery.extras || []).map((i) => i.id),
  ]);

  const cleanCurrent = {
    manual: (currentDiscovery.manual || []).filter((i) => !nextItemIds.has(i.id)),
    movies: (currentDiscovery.movies || []).filter((i) => !nextItemIds.has(i.id)),
    series: (currentDiscovery.series || []).filter((i) => !nextItemIds.has(i.id)),
    collisions: (currentDiscovery.collisions || []).filter((i) => !nextItemIds.has(i.id)),
    extras: (currentDiscovery.extras || []).filter((i) => !nextExtraIds.has(i.id)),
  };

  return {
    manual: mergeById(cleanCurrent.manual, nextDiscovery.manual),
    movies: mergeById(cleanCurrent.movies, nextDiscovery.movies),
    series: mergeById(cleanCurrent.series, nextDiscovery.series),
    collisions: mergeById(cleanCurrent.collisions, nextDiscovery.collisions),
    extras: mergeById(cleanCurrent.extras, nextDiscovery.extras),
  };
};

export function useOrganizerScan({
  defaultScanDir,
  discoveryQuery,
  isScanActive,
  onResultsReady,
  queryClient,
  t,
  toast,
  scanStatusQuery,
  renameStartedRef,
}) {
  const [isBrowseStarting, setIsBrowseStarting] = useState(false);
  const previousScanActiveRef = useRef(false);
  const lastScanPathsRef = useRef([]);
  const scanMutation = useScanMutation();
  const wasStopRequestedRef = useRef(false);
  const lastProcessedCountRef = useRef(0);
  const scanStatus = scanStatusQuery?.data || null;

  useEffect(() => {
    if (isScanActive && scanStatus) {
      if (scanStatus.stop_requested) {
        wasStopRequestedRef.current = true;
      }
      if (scanStatus.current !== undefined) {
        lastProcessedCountRef.current = scanStatus.current;
      }
    }
  }, [isScanActive, scanStatus]);

  useEffect(() => {
    const wasActive = previousScanActiveRef.current;
    if (wasActive && !isScanActive) {
      const finalizeScan = async () => {
        const wasRename = renameStartedRef.current;
        renameStartedRef.current = false;

        const wasAborted = wasStopRequestedRef.current;
        wasStopRequestedRef.current = false;
        const processedCount = lastProcessedCountRef.current;
        lastProcessedCountRef.current = 0;

        const currentVisibleDiscovery = queryClient.getQueryData(['discovery']) || EMPTY_DISCOVERY;

        queryClient.invalidateQueries({ queryKey: ['discovery'] });
        queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });

        try {
          const result = await discoveryQuery.refetch();
          const nextDiscovery = result.data || EMPTY_DISCOVERY;

          if (wasRename) {
            queryClient.setQueryData(['discovery'], nextDiscovery);
            onResultsReady?.(nextDiscovery);
            if (wasAborted) {
              toast(t('organizer.toasts.renameAborted').replace('{count}', processedCount), 'warning');
            } else {
              toast(t('organizer.toasts.renameComplete') || 'Renaming complete!', 'success');
            }
          } else {
            const scanSubset = lastScanPathsRef.current.length > 0
              ? filterDiscoveryByPaths(nextDiscovery, lastScanPathsRef.current)
              : nextDiscovery;
            const mergedDiscovery = mergeDiscoveryGroups(currentVisibleDiscovery, scanSubset);
            queryClient.setQueryData(['discovery'], mergedDiscovery);
            onResultsReady?.(mergedDiscovery);
            const matchedMovies = (nextDiscovery.movies || []).length;
            const matchedEpisodes = (nextDiscovery.series || []).filter((item) => item.type === 'episode').length;
            const matchedReady = matchedMovies + matchedEpisodes;
            toast(t('organizer.toasts.scanComplete').replace('{count}', matchedReady), 'success');
          }
        } catch {
          toast(wasRename ? t('organizer.toasts.renameStartFailed') : t('organizer.toasts.scanCompleteFallback'), 'success');
        }
        lastScanPathsRef.current = [];
      };

      finalizeScan();
      scrollOrganizerToTop();
    }
    previousScanActiveRef.current = isScanActive;
  }, [isScanActive, onResultsReady, queryClient, t, toast, discoveryQuery, renameStartedRef]);

  const handleScanPaths = async (paths) => {
    if (isScanActive || isBrowseStarting) {
      return;
    }

    const uniquePaths = [...new Set((paths || []).filter(Boolean))];
    if (uniquePaths.length === 0) {
      return;
    }

    setIsBrowseStarting(true);
    try {
      lastScanPathsRef.current = uniquePaths;

      await scanMutation.mutateAsync({
        paths: uniquePaths,
      });

      queryClient.invalidateQueries({ queryKey: ['scan-status'] });
      queryClient.invalidateQueries({ queryKey: ['discovery'] });
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
    } catch (error) {
      toast(error.message || t('organizer.toasts.scanStartFailed'), 'danger');
    } finally {
      setIsBrowseStarting(false);
    }
  };

  const handleBrowseAndScan = async () => {
    const folder = await selectFolder(defaultScanDir);
    if (!folder) {
      return;
    }

    await handleScanPaths([folder]);
  };

  return {
    handleScanPaths,
    handleBrowseAndScan,
    isBrowseStarting,
  };
}
