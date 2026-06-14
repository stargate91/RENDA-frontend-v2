import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export const useHistoryQuery = () => useQuery({
  queryKey: ['history'],
  queryFn: () => api.history.get(),
});

export const useUndoMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId) => api.rename.undo(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['scan-status'] });
    },
  });
};
