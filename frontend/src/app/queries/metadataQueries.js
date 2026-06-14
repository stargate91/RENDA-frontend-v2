import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

export const useSearchMetadataQuery = (query, itemType, year, season, episode, options = {}) => useQuery({
  queryKey: ['metadata-search', query, itemType, year, season, episode],
  queryFn: () => api.metadata.search({ query, itemType, year, season, episode }),
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

export const useBulkResolveMetadataMutation = () => useMutation({
  mutationFn: (payload) => api.metadata.bulkResolve(payload),
});

export const useFullMetadataQuery = (itemId, options = {}) => useQuery({
  queryKey: ['full-metadata', itemId],
  queryFn: () => api.metadata.getItemFullMetadata(itemId),
  ...options,
});

export const useSyncLanguageMutation = () => useMutation({
  mutationFn: () => api.metadata.syncLanguage(),
});
