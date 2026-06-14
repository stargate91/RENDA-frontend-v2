import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const useStatsQuery = () => useQuery({
  queryKey: ['stats'],
  queryFn: () => api.library.getStats(),
});

export const useLibraryQuery = (params) => useQuery({
  queryKey: ['library', params],
  queryFn: ({ signal }) => api.library.getItems(params, { signal }),
  placeholderData: (previousData, previousQuery) => {
    if (!previousData || !previousQuery) return undefined;
    const prevParams = previousQuery.queryKey[1] || {};
    const currentParams = params || {};
    if (prevParams.tab !== currentParams.tab) {
      return undefined;
    }
    return previousData;
  },
});

export const useCollectionsQuery = (params) => useQuery({
  queryKey: ['libraryCollections', params],
  queryFn: ({ signal }) => api.library.getCollections(params, { signal }),
  placeholderData: (previousData, previousQuery) => {
    if (!previousData || !previousQuery) return undefined;
    const prevParams = previousQuery.queryKey[1] || {};
    const currentParams = params || {};
    if (prevParams.tab !== currentParams.tab) {
      return undefined;
    }
    return previousData;
  },
});

export const useTagsQuery = (isAdult = false) => useQuery({
  queryKey: ['libraryTags', isAdult],
  queryFn: () => api.library.getTags(isAdult),
});

export const useAllTagsQuery = (isAdult = false) => useQuery({
  queryKey: ['allTags', isAdult],
  queryFn: () => api.tags.getAll(isAdult),
});

export const useCreateTagMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.tags.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryTags'] });
      queryClient.invalidateQueries({ queryKey: ['allTags'] });
      queryClient.invalidateQueries({ queryKey: ['libraryFilters'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useUpdateTagMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, payload }) => api.tags.update(tagId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryTags'] });
      queryClient.invalidateQueries({ queryKey: ['allTags'] });
      queryClient.invalidateQueries({ queryKey: ['libraryFilters'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useDeleteTagMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId) => api.tags.delete(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryTags'] });
      queryClient.invalidateQueries({ queryKey: ['allTags'] });
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['libraryFilters'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useLibraryFiltersQuery = (params) => useQuery({
  queryKey: ['libraryFilters', params],
  queryFn: ({ signal }) => api.library.getFilters(params, { signal }),
  staleTime: 5 * 60 * 1000,
});

export const usePeopleQuery = (params) => useQuery({
  queryKey: ['people', params],
  queryFn: () => api.people.getAll(params),
  placeholderData: (previousData) => previousData,
});

export const usePeopleInfiniteQuery = (params) => useInfiniteQuery({
  queryKey: ['people-infinite', params],
  queryFn: ({ pageParam = 0 }) => api.people.getAll({ ...params, offset: pageParam, limit: 20 }),
  initialPageParam: 0,
  getNextPageParam: (lastPage) => {
    if (!lastPage.has_more) return undefined;
    return lastPage.offset + lastPage.limit;
  },
});

export const useAddPersonTmdbMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tmdbId) => api.people.addTmdb(tmdbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useUpdatePersonStatusMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, payload }) => api.people.updateStatus(personId, payload),
    onMutate: async ({ personId, payload }) => {
      await queryClient.cancelQueries({ queryKey: ['people'] });
      await queryClient.cancelQueries({ queryKey: ['people-infinite'] });
      await queryClient.cancelQueries({ queryKey: ['library'] });

      const previousLibraryQueries = queryClient.getQueriesData({ queryKey: ['library'] });
      const previousPeopleQueries = queryClient.getQueriesData({ queryKey: ['people'] });
      const previousPeopleInfiniteQueries = queryClient.getQueriesData({ queryKey: ['people-infinite'] });

      let foundPerson = null;

      for (const [, cacheData] of previousPeopleInfiniteQueries) {
        if (cacheData?.pages) {
          for (const page of cacheData.pages) {
            const item = page.items?.find(p => p.id === personId);
            if (item) {
              foundPerson = { ...item, is_active: payload.is_active };
              break;
            }
          }
        }
        if (foundPerson) break;
      }

      if (!foundPerson) {
        for (const [, cacheData] of previousPeopleQueries) {
          const item = cacheData?.items?.find(p => p.id === personId);
          if (item) {
            foundPerson = { ...item, is_active: payload.is_active };
            break;
          }
        }
      }

      // 1. Update people-infinite queries
      queryClient.setQueriesData({ queryKey: ['people-infinite'] }, (oldData) => {
        if (!oldData?.pages) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map(page => ({
            ...page,
            items: page.items.map(p => p.id === personId ? { ...p, is_active: payload.is_active } : p)
          }))
        };
      });

      // 2. Update people queries
      queryClient.setQueriesData({ queryKey: ['people'] }, (oldData) => {
        if (!oldData?.items) return oldData;
        return {
          ...oldData,
          items: oldData.items.map(p => p.id === personId ? { ...p, is_active: payload.is_active } : p)
        };
      });

      // 3. Update library queries (which renders the active people grid)
      queryClient.setQueriesData({ queryKey: ['library'] }, (oldData) => {
        if (!oldData?.items) return oldData;

        if (payload.is_active === false) {
          return {
            ...oldData,
            items: oldData.items.filter(p => p.id !== personId)
          };
        } else if (payload.is_active === true && foundPerson) {
          if (oldData.items.some(p => p.id === personId)) return oldData;

          const libraryPerson = {
            id: foundPerson.id,
            title: foundPerson.name,
            poster_path: foundPerson.profile_path,
            people_role: foundPerson.known_for || foundPerson.people_role || 'Actor',
            gender: foundPerson.gender,
            is_active: true
          };

          return {
            ...oldData,
            items: [...oldData.items, libraryPerson]
          };
        }
        return oldData;
      });

      return { previousLibraryQueries, previousPeopleQueries, previousPeopleInfiniteQueries };
    },
    onError: (err, variables, context) => {
      if (context?.previousLibraryQueries) {
        context.previousLibraryQueries.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
      if (context?.previousPeopleQueries) {
        context.previousPeopleQueries.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
      if (context?.previousPeopleInfiniteQueries) {
        context.previousPeopleInfiniteQueries.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};
