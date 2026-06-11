import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export const useSearchMetadataQuery = (query, itemType, year, options = {}) => useQuery({
  queryKey: ['metadata-search', query, itemType, year],
  queryFn: () => api.metadata.search({ query, itemType, year }),
  ...options,
});

export const useTvSeasonsQuery = (tvId, options = {}) => {
  const { language = 'en-US', ...queryOptions } = options;
  return useQuery({
    queryKey: ['tv-seasons', tvId, language],
    queryFn: () => api.tv.getSeasons(tvId, { language }),
    ...queryOptions,
  });
};

export const useTvEpisodesQuery = (tvId, seasonNumber, options = {}) => {
  const { language = 'en-US', ...queryOptions } = options;
  return useQuery({
    queryKey: ['tv-episodes', tvId, seasonNumber, language],
    queryFn: () => api.tv.getEpisodes(tvId, seasonNumber, { language }),
    ...queryOptions,
  });
};

export const useResolveMetadataMutation = () => useMutation({
  mutationFn: (payload) => api.metadata.resolve(payload),
});

export const useFullMetadataQuery = (itemId, options = {}) => useQuery({
  queryKey: ['full-metadata', itemId],
  queryFn: () => api.metadata.getItemFullMetadata(itemId),
  ...options,
});

export const useScanMutation = () => useMutation({
  mutationFn: (payload) => api.scan.start(payload),
});

export const useRenameMutation = () => useMutation({
  mutationFn: (payload) => api.rename.start(payload),
});

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
