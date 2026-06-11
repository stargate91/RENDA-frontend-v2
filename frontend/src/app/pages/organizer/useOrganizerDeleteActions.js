import api from '../../lib/api';

export const removeDiscoveryRow = (currentDiscovery, row) => {
  if (!currentDiscovery) {
    return currentDiscovery;
  }

  if (row.rawType === 'extra') {
    return {
      ...currentDiscovery,
      extras: (currentDiscovery.extras || []).filter((item) => item.id !== row.itemId),
    };
  }

  const mediaId = row.itemId;
  return {
    ...currentDiscovery,
    manual: (currentDiscovery.manual || []).filter((item) => item.id !== mediaId),
    movies: (currentDiscovery.movies || []).filter((item) => item.id !== mediaId),
    series: (currentDiscovery.series || []).filter((item) => item.id !== mediaId),
    collisions: (currentDiscovery.collisions || []).filter((item) => item.id !== mediaId),
    extras: (currentDiscovery.extras || []).filter((item) => item.parent_id !== mediaId),
  };
};

export const removeDiscoveryRows = (currentDiscovery, rows) => rows.reduce(
  (nextDiscovery, row) => removeDiscoveryRow(nextDiscovery, row),
  currentDiscovery,
);

export function useOrganizerDeleteActions({
  t,
  closeModal,
  toast,
  queryClient,
  focusFirstAvailableResult,
  clearSelectedRows,
}) {
  const refreshOrganizerDiscovery = async () => {
    const data = await api.discovery.get();
    queryClient.setQueryData(['discovery'], data);
    focusFirstAvailableResult(data);
    queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const handleResolveDiscoveryRow = async (row) => {
    closeModal();
    const previousDiscovery = queryClient.getQueryData(['discovery']);
    const nextDiscovery = removeDiscoveryRow(previousDiscovery, row);
    if (nextDiscovery) {
      queryClient.setQueryData(['discovery'], nextDiscovery);
      focusFirstAvailableResult(nextDiscovery);
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }

    try {
      await refreshOrganizerDiscovery();
    } catch {
      if (previousDiscovery) {
        queryClient.setQueryData(['discovery'], previousDiscovery);
        focusFirstAvailableResult(previousDiscovery);
      }
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }
  };

  const handleResolveDiscoveryRows = async (rows) => {
    closeModal();
    const previousDiscovery = queryClient.getQueryData(['discovery']);
    const nextDiscovery = removeDiscoveryRows(previousDiscovery, rows);
    if (nextDiscovery) {
      queryClient.setQueryData(['discovery'], nextDiscovery);
      focusFirstAvailableResult(nextDiscovery);
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }

    try {
      await refreshOrganizerDiscovery();
    } catch (error) {
      if (previousDiscovery) {
        queryClient.setQueryData(['discovery'], previousDiscovery);
        focusFirstAvailableResult(previousDiscovery);
      }
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      throw error;
    }
  };

  const handleDeleteDiscoveryRow = async (row, mode) => {
    closeModal();
    const previousDiscovery = queryClient.getQueryData(['discovery']);
    const nextDiscovery = removeDiscoveryRow(previousDiscovery, row);
    if (nextDiscovery) {
      queryClient.setQueryData(['discovery'], nextDiscovery);
      focusFirstAvailableResult(nextDiscovery);
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }

    try {
      await api.discovery.delete({
        item_ids: row.rawType === 'extra' ? [] : [row.itemId],
        extra_ids: row.rawType === 'extra' ? [row.itemId] : [],
        mode,
      });
      await refreshOrganizerDiscovery();
      const toastKey = mode === 'ignore' ? 'organizer.toasts.deleteIgnoreSuccess'
        : mode === 'trash' ? 'organizer.toasts.deleteTrashSuccess'
        : 'organizer.toasts.deleteDbOnlySuccess';
      toast(t(toastKey), 'success');
    } catch (error) {
      if (previousDiscovery) {
        queryClient.setQueryData(['discovery'], previousDiscovery);
        focusFirstAvailableResult(previousDiscovery);
      }
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      throw error;
    }
  };

  const handleDeleteDiscoveryRows = async (rows, mode) => {
    closeModal();
    clearSelectedRows();
    const previousDiscovery = queryClient.getQueryData(['discovery']);
    const nextDiscovery = removeDiscoveryRows(previousDiscovery, rows);
    if (nextDiscovery) {
      queryClient.setQueryData(['discovery'], nextDiscovery);
      focusFirstAvailableResult(nextDiscovery);
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }

    try {
      await api.discovery.delete({
        item_ids: rows.filter((row) => row.rawType !== 'extra').map((row) => row.itemId),
        extra_ids: rows.filter((row) => row.rawType === 'extra').map((row) => row.itemId),
        mode,
      });
      await refreshOrganizerDiscovery();
      const count = rows.length;
      const toastKey = count === 1
        ? (mode === 'ignore' ? 'organizer.toasts.deleteIgnoreSuccess' : mode === 'trash' ? 'organizer.toasts.deleteTrashSuccess' : 'organizer.toasts.deleteDbOnlySuccess')
        : (mode === 'ignore' ? 'organizer.toasts.deleteIgnoreSuccessPlural' : mode === 'trash' ? 'organizer.toasts.deleteTrashSuccessPlural' : 'organizer.toasts.deleteDbOnlySuccessPlural');
      toast(t(toastKey).replace('{count}', count), 'success');
    } catch (error) {
      if (previousDiscovery) {
        queryClient.setQueryData(['discovery'], previousDiscovery);
        focusFirstAvailableResult(previousDiscovery);
      }
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      throw error;
    }
  };

  return {
    refreshOrganizerDiscovery,
    handleResolveDiscoveryRow,
    handleResolveDiscoveryRows,
    handleDeleteDiscoveryRow,
    handleDeleteDiscoveryRows,
  };
}
