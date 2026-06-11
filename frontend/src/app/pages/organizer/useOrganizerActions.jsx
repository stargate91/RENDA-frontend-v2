import { useRef, useState } from 'react';
import { useRenameMutation } from '../../queries';
import { useOrganizerRename } from './hooks/useOrganizerRename';
import { useOrganizerScan } from './hooks/useOrganizerScan';

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
  dismissedRowIds,
  scanStatusQuery,
}) {
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const renameStartedRef = useRef(false);
  const renameMutation = useRenameMutation();

  const {
    handleScanPaths,
    handleBrowseAndScan,
    isBrowseStarting,
  } = useOrganizerScan({
    defaultScanDir,
    discoveryQuery,
    isScanActive,
    onResultsReady,
    queryClient,
    t,
    toast,
    scanStatusQuery,
    renameStartedRef,
  });

  const { handleRename, isRenameStarting } = useOrganizerRename({
    discoveryQuery,
    dismissedRowIds,
    isScanActive,
    renameMutation,
    queryClient,
    renameStartedRef,
    t,
    toast,
    openModal,
    closeModal,
  });

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
