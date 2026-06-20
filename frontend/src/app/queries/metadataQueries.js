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

export const useFullMetadataQuery = (itemId, mediaType, options = {}) => {
  const { language, ...queryOptions } = options;
  return useQuery({
    queryKey: ['full-metadata', itemId, mediaType || null, language || null],
    queryFn: () => api.metadata.getItemFullMetadata(itemId, mediaType, { language }),
    ...queryOptions,
  });
};

export const useSyncLanguageMutation = () => useMutation({
  mutationFn: () => api.metadata.syncLanguage(),
});

export const useLibraryItemDetailQuery = (itemId, options = {}) => useQuery({
  queryKey: ['library-item-detail', itemId],
  queryFn: () => api.library.getItemDetail(itemId),
  ...options,
});

export const useLibrarySeriesDetailQuery = (seriesId, options = {}) => {
  const { seasonsLimit = 5, initialEpisodesLimit = 4, ...queryOptions } = options;
  return useQuery({
    queryKey: ['library-series-detail', seriesId],
    queryFn: () => api.library.getSeriesDetail(seriesId, { seasonsLimit, initialEpisodesLimit }),
    ...queryOptions,
  });
};

export const useLibraryCollectionDetailQuery = (collectionId, options = {}) => {
  const { language, ...queryOptions } = options;
  return useQuery({
    queryKey: ['library-collection-detail', collectionId, language || null],
    queryFn: () => api.library.getCollectionDetail(collectionId, { language }),
    ...queryOptions,
  });
};

export const usePersonDetailQuery = (personId, options = {}) => useQuery({
  queryKey: ['person-detail', personId],
  queryFn: () => api.people.getDetail(personId),
  ...options,
});

export const usePersonCreditsQuery = (personId, mediaType, page, pageSize, options = {}) => {
  const { excludeKnownFor = false, source, ...queryOptions } = options;
  return useQuery({
  queryKey: ['person-credits', personId, mediaType, page, pageSize, excludeKnownFor, source || null],
  queryFn: () => api.people.getCredits(personId, mediaType, { page, pageSize, excludeKnownFor, source }),
  placeholderData: (previousData) => previousData,
  ...queryOptions,
});
};

export const usePersonCreditBackdropsQuery = (personId, tmdbId, mediaType, options = {}) => useQuery({
  queryKey: ['person-credit-backdrops', personId, tmdbId, mediaType],
  queryFn: () => api.people.getCreditBackdrops(personId, tmdbId, mediaType),
  ...options,
});
