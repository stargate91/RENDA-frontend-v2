import { useEffect, useRef, useState } from 'react';
import { selectFolder } from '../../lib/ipc';
import { scrollOrganizerToTop } from './organizerScroll';
import { useScanMutation, useRenameMutation } from '../../queries/organizerQueries';
import OrganizerRenameModalContent from './OrganizerRenameModalContent.jsx';
import { Sparkles } from 'lucide-react';
import Button from '../../ui/Button';
import { mapDiscoveryItemRow, mapExtraRow } from './organizerMappers';

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

export function useOrganizerActions({
  defaultScanDir,
  discoveryCountQuery,
  discoveryQuery,
  isScanActive,
  onResultsReady,
  queryClient,
  t,
  toast,
  openModal,
  closeModal,
}) {
  const [isBrowseStarting, setIsBrowseStarting] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [isRenameStarting, setIsRenameStarting] = useState(false);
  const previousScanActiveRef = useRef(false);
  const lastScanPathsRef = useRef([]);

  const scanMutation = useScanMutation();
  const renameMutation = useRenameMutation();

  useEffect(() => {
    const wasActive = previousScanActiveRef.current;
    if (wasActive && !isScanActive) {
      const finalizeScan = async () => {
        const currentVisibleDiscovery = queryClient.getQueryData(['discovery']) || EMPTY_DISCOVERY;

        queryClient.invalidateQueries({ queryKey: ['discovery'] });
        queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });

        try {
          const result = await discoveryQuery.refetch();
          const nextDiscovery = result.data || EMPTY_DISCOVERY;
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
        } catch {
          toast(t('organizer.toasts.scanCompleteFallback'), 'success');
        }
        lastScanPathsRef.current = [];
      };

      finalizeScan();
      scrollOrganizerToTop();
    }
    previousScanActiveRef.current = isScanActive;
  }, [isScanActive, onResultsReady, queryClient, t, toast, discoveryQuery]);

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

  const handleLoadAll = async () => {
    if (isLoadingAll) {
      return;
    }

    setIsLoadingAll(true);
    try {
      const result = await discoveryQuery.refetch();
      if (result.data) {
        queryClient.setQueryData(['discovery'], result.data);
        onResultsReady?.(result.data);
      }
      await discoveryCountQuery.refetch();
      toast(t('organizer.toasts.loadAllSuccess'), 'success');
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleRename = async () => {
    if (isRenameStarting || isScanActive) {
      return;
    }

    const currentDiscovery = discoveryQuery.data || EMPTY_DISCOVERY;
    const allItems = [
      ...(currentDiscovery.manual || []),
      ...(currentDiscovery.movies || []),
      ...(currentDiscovery.series || []),
      ...(currentDiscovery.collisions || []),
    ];
    const matchedItems = allItems.filter((item) => String(item.status || '').toLowerCase() === 'matched');

    if (matchedItems.length === 0) {
      toast(t('organizer.toasts.noMatchedItems'), 'danger');
      return;
    }

    const matchedItemIds = new Set(matchedItems.map((item) => item.id));
    const matchedExtras = (currentDiscovery.extras || []).filter(
      (extra) => matchedItemIds.has(extra.parent_id || extra.parent_item_id)
    );

    const mappedItems = [
      ...matchedItems.map((item) => mapDiscoveryItemRow(item, t)),
      ...matchedExtras.map((extra) => mapExtraRow(extra, t)),
    ];

    const executeRename = async () => {
      closeModal();
      setIsRenameStarting(true);
      try {
        const ids = matchedItems.map((item) => item.id);
        await renameMutation.mutateAsync({ item_ids: ids });
        queryClient.invalidateQueries({ queryKey: ['scan-status'] });
      } catch (error) {
        toast(error.message || t('organizer.toasts.renameStartFailed'), 'danger');
      } finally {
        setIsRenameStarting(false);
      }
    };

    openModal({
      title: t('organizer.renameModal.title') || 'Confirm Rename',
      description: t('organizer.renameModal.description') || 'Review the files that will be renamed.',
      icon: Sparkles,
      className: 'ui-modal--extra-wide',
      content: (
        <OrganizerRenameModalContent
          items={mappedItems}
          t={t}
        />
      ),
      footer: (
        <>
          <Button variant="secondary-neutral" onClick={closeModal}>
            {t('organizer.details.delete.cancel') || 'Cancel'}
          </Button>
          <Button variant="primary" onClick={executeRename}>
            {t('organizer.actions.rename') || 'Rename'}
          </Button>
        </>
      ),
    });
  };



  return {
    handleBrowseAndScan,
    handleLoadAll,
    handleRename,
    handleScanPaths,
    isBrowseStarting,
    isLoadingAll,
    isRenameStarting,
  };
}
