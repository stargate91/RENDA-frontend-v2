import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export const useUpdateMediaMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.media.update(payload),
    onSuccess: async () => {
      try {
        const data = await api.discovery.get();
        queryClient.setQueryData(['discovery'], data);
      } catch {
        await queryClient.refetchQueries({ queryKey: ['discovery'] });
      }
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useBulkUpdateMediaMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.media.bulkUpdate(payload),
    onSuccess: async () => {
      try {
        const data = await api.discovery.get();
        queryClient.setQueryData(['discovery'], data);
      } catch {
        await queryClient.refetchQueries({ queryKey: ['discovery'] });
      }
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useUpdateMediaStatusMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, payload }) => api.media.updateStatus(itemId, payload),
    onMutate: async ({ itemId, payload, seriesId }) => {
      const targetId = seriesId || itemId;

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['library-series-detail', targetId] });
      await queryClient.cancelQueries({ queryKey: ['library-item-detail', targetId] });
      await queryClient.cancelQueries({ queryKey: ['library'] });

      // Snapshot previous values
      const prevSeries = queryClient.getQueryData(['library-series-detail', targetId]);
      const prevItem = queryClient.getQueryData(['library-item-detail', targetId]);
      const prevLibraryList = queryClient.getQueriesData({ queryKey: ['library'] });

      const updates = {};
      if (payload) {
        if ('user_rating' in payload) updates.user_rating = payload.user_rating;
        if ('is_watched' in payload) updates.is_watched = payload.is_watched;
      }

      // Optimistically update details
      if (Object.keys(updates).length > 0) {
        if (prevSeries) {
          queryClient.setQueryData(['library-series-detail', targetId], {
            ...prevSeries,
            ...updates
          });
        }
        if (prevItem) {
          queryClient.setQueryData(['library-item-detail', targetId], {
            ...prevItem,
            ...updates
          });
        }

        // Optimistically update lists
        prevLibraryList.forEach(([queryKey, queryData]) => {
          if (!queryData) return;
          let changed = false;

          const updateItem = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) {
              return obj.map(x => {
                if (x && (String(x.id) === String(targetId) || String(x.id) === `series_${targetId}`)) {
                  changed = true;
                  return { ...x, ...updates };
                }
                return updateItem(x);
              });
            }
            const nextObj = {};
            for (const key in obj) {
              nextObj[key] = updateItem(obj[key]);
            }
            return nextObj;
          };

          const updatedData = updateItem(queryData);
          if (changed) {
            queryClient.setQueryData(queryKey, updatedData);
          }
        });
      }

      return { prevSeries, prevItem, prevLibraryList, targetId };
    },
    onError: (err, variables, context) => {
      if (context?.prevSeries) {
        queryClient.setQueryData(['library-series-detail', context.targetId], context.prevSeries);
      }
      if (context?.prevItem) {
        queryClient.setQueryData(['library-item-detail', context.targetId], context.prevItem);
      }
      if (context?.prevLibraryList) {
        context.prevLibraryList.forEach(([queryKey, queryData]) => {
          queryClient.setQueryData(queryKey, queryData);
        });
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['full-metadata', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: ['library-item-detail', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: ['library-series-detail', variables.itemId] });
      if (variables.seriesId) {
        queryClient.invalidateQueries({ queryKey: ['library-series-detail', variables.seriesId] });
        queryClient.invalidateQueries({ queryKey: ['library-series-detail', `series_${variables.seriesId}`] });
        queryClient.invalidateQueries({ queryKey: ['library-item-detail', variables.seriesId] });
        queryClient.invalidateQueries({ queryKey: ['library-item-detail', `series_${variables.seriesId}`] });
      }
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['libraryTags'] });
      queryClient.invalidateQueries({ queryKey: ['allTags'] });
      queryClient.invalidateQueries({ queryKey: ['libraryFilters'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useBulkUpdateWatchedMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemIds, isWatched }) => api.media.bulkWatched(itemIds, isWatched),
    onSuccess: (data, variables) => {
      if (variables.seriesId) {
        queryClient.invalidateQueries({ queryKey: ['library-series-detail', variables.seriesId] });
      }
      queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });
};

export const usePlayMediaMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => api.media.play(itemId),
    onSuccess: (data, itemId) => {
      queryClient.invalidateQueries({ queryKey: ['library-item-detail', itemId] });
      queryClient.invalidateQueries({ queryKey: ['library-series-detail', itemId] });
    },
  });
};

export const useResetProgressMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => api.media.resetProgress(itemId),
    onSuccess: (data, itemId) => {
      queryClient.invalidateQueries({ queryKey: ['library-item-detail', itemId] });
      queryClient.invalidateQueries({ queryKey: ['library-series-detail', itemId] });
    },
  });
};

export const usePreviewMediaMutation = () => {
  return useMutation({
    mutationFn: (filePath) => api.media.preview(filePath),
  });
};

export const useOverrideBackdropMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, backdropPath }) => api.media.overrideBackdrop(itemId, backdropPath),
    onSuccess: (data, variables) => {
      const cleanId = String(variables.itemId).replace('series_', '');
      const isCollection = String(variables.itemId).startsWith('collection_');
      queryClient.invalidateQueries({ queryKey: ['full-metadata', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: ['full-metadata', cleanId] });
      queryClient.invalidateQueries({ queryKey: ['library-item-detail', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: ['library-item-detail', cleanId] });
      queryClient.invalidateQueries({ queryKey: ['library-series-detail', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: ['library-series-detail', cleanId] });
      if (isCollection) {
        const collectionId = String(variables.itemId).replace('collection_', '');
        queryClient.invalidateQueries({ queryKey: ['library-collection-detail', collectionId] });
        queryClient.invalidateQueries({ queryKey: ['library-collection-detail', variables.itemId] });
      }
    },
  });
};
