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
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['full-metadata', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: ['library-item-detail', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: ['library-series-detail', variables.itemId] });
      queryClient.invalidateQueries({ queryKey: ['library'] });
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
