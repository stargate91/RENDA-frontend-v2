import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import Button from '../../../ui/Button';
import OrganizerRenameModalContent from '../OrganizerRenameModalContent.jsx';
import { mapDiscoveryItemRow, mapExtraRow } from '../organizerMappers';

const EMPTY_DISCOVERY = {
  manual: [],
  movies: [],
  series: [],
  extras: [],
  collisions: [],
};

export function useOrganizerRenameAction({
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
}) {
  const [isRenameStarting, setIsRenameStarting] = useState(false);

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
    const matchedItems = allItems.filter((item) => {
      const isMatched = String(item.status || '').toLowerCase() === 'matched';
      const isDismissed = dismissedRowIds?.has(`item-${item.id}`);
      return isMatched && !isDismissed;
    });

    if (matchedItems.length === 0) {
      toast(t('organizer.toasts.noMatchedItems'), 'danger');
      return;
    }

    const matchedItemIds = new Set(matchedItems.map((item) => item.id));
    const matchedExtras = (currentDiscovery.extras || []).filter((extra) => {
      const parentIsMatched = matchedItemIds.has(extra.parent_id || extra.parent_item_id);
      const isDismissed = dismissedRowIds?.has(`extra-${extra.id}`);
      return parentIsMatched && !isDismissed;
    });

    const mappedItems = [
      ...matchedItems.map((item) => mapDiscoveryItemRow(item, t)),
      ...matchedExtras.map((extra) => mapExtraRow(extra, t)),
    ];

    const executeRename = async () => {
      closeModal();
      setIsRenameStarting(true);
      try {
        const ids = matchedItems.map((item) => item.id);
        if (renameStartedRef) {
          renameStartedRef.current = true;
        }
        await renameMutation.mutateAsync({ item_ids: ids });
        queryClient.invalidateQueries({ queryKey: ['scan-status'] });
      } catch (error) {
        if (renameStartedRef) {
          renameStartedRef.current = false;
        }
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
    handleRename,
    isRenameStarting,
  };
}
