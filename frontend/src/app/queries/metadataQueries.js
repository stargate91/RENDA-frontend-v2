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

export const useFullMetadataQuery = (itemId, mediaType, options = {}) => useQuery({
  queryKey: ['full-metadata', itemId, mediaType || null],
  queryFn: () => api.metadata.getItemFullMetadata(itemId, mediaType),
  ...options,
});

export const useSyncLanguageMutation = () => useMutation({
  mutationFn: () => api.metadata.syncLanguage(),
});

export const useLibraryItemDetailQuery = (itemId, options = {}) => useQuery({
  queryKey: ['library-item-detail', itemId],
  queryFn: () => api.library.getItemDetail(itemId),
  ...options,
});

export const useLibrarySeriesDetailQuery = (seriesId, options = {}) => useQuery({
  queryKey: ['library-series-detail', seriesId],
  queryFn: () => api.library.getSeriesDetail(seriesId),
  ...options,
});

export const useLibraryCollectionDetailQuery = (collectionId, options = {}) => useQuery({
  queryKey: ['library-collection-detail', collectionId],
  queryFn: () => api.library.getCollectionDetail(collectionId),
  ...options,
});

export const usePersonDetailQuery = (personId, options = {}) => useQuery({
  queryKey: ['person-detail', personId],
  queryFn: () => api.people.getDetail(personId),
  ...options,
});

export const usePersonCreditsQuery = (personId, mediaType, page, pageSize, options = {}) => {
  const { excludeKnownFor = false, ...queryOptions } = options;
  return useQuery({
  queryKey: ['person-credits', personId, mediaType, page, pageSize, excludeKnownFor],
  queryFn: () => api.people.getCredits(personId, mediaType, { page, pageSize, excludeKnownFor }),
  placeholderData: (previousData) => previousData,
  ...queryOptions,
});
};

export const usePersonCreditBackdropsQuery = (personId, tmdbId, mediaType, options = {}) => useQuery({
  queryKey: ['person-credit-backdrops', personId, tmdbId, mediaType],
  queryFn: () => api.people.getCreditBackdrops(personId, tmdbId, mediaType),
  ...options,
});
