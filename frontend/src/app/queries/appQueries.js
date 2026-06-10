import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

export const useSettingsQuery = () => useQuery({
  queryKey: ['settings'],
  queryFn: () => api.settings.get(),
});

export const useUpdateSettingsMutation = () => useMutation({
  mutationFn: (settings) => api.settings.update(settings),
});

export const useStatsQuery = () => useQuery({
  queryKey: ['stats'],
  queryFn: () => api.library.getStats(),
});

export const useScanStatusQuery = () => useQuery({
  queryKey: ['scan-status'],
  queryFn: () => api.scan.getStatus(),
  refetchInterval: (query) => (query.state.data?.active ? 1200 : 10000),
});

export const useImageStatusQuery = () => useQuery({
  queryKey: ['image-status'],
  queryFn: () => api.image.getStatus(),
  refetchInterval: (query) => (query.state.data?.active ? 1500 : 10000),
});

export const useDiscoveryQuery = () => useQuery({
  queryKey: ['discovery'],
  queryFn: () => api.discovery.get(),
  enabled: false,
});

export const useDiscoveryCountQuery = () => useQuery({
  queryKey: ['discovery-count'],
  queryFn: () => api.discovery.getCount(),
});

export const useHistoryQuery = () => useQuery({
  queryKey: ['history'],
  queryFn: () => api.history.get(),
});
