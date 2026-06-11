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
