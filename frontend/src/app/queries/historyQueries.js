import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useLibraryModeStore } from '@/stores/useLibraryModeStore';

export const useHistoryQuery = () => useInfiniteQuery({
  queryKey: ['history'],
  queryFn: ({ pageParam = 1 }) => api.history.get({ page: pageParam, limit: 20 }),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
});

export const useWatchedHistoryQuery = () => {
  const sessionMode = useLibraryModeStore((state) => state.sessionMode);
  return useInfiniteQuery({
    queryKey: ['watched-history', sessionMode],
    queryFn: ({ pageParam = 1 }) => api.history.getWatched({
      page: pageParam,
      limit: 20,
      include_adult: sessionMode === 'nsfw' ? 'true' : 'false',
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
    refetchInterval: 5000,
  });
};

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
