import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const useStatsQuery = () => useQuery({
  queryKey: ['stats'],
  queryFn: () => api.library.getStats(),
});

export const useLibraryQuery = (params) => useQuery({
  queryKey: ['library', params],
  queryFn: ({ signal }) => api.library.getItems(params, { signal }),
  placeholderData: (previousData) => previousData,
});

export const useCollectionsQuery = (params) => useQuery({
  queryKey: ['libraryCollections', params],
  queryFn: ({ signal }) => api.library.getCollections(params, { signal }),
  placeholderData: (previousData) => previousData,
});

export const useTagsQuery = () => useQuery({
  queryKey: ['libraryTags'],
  queryFn: () => api.library.getTags(),
});

