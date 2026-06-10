import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/http';

export const useSettingsQuery = () => useQuery({
  queryKey: ['settings'],
  queryFn: () => fetchJson('/api/settings'),
});

export const useStatsQuery = () => useQuery({
  queryKey: ['stats'],
  queryFn: () => fetchJson('/api/library/stats'),
});

export const useScanStatusQuery = () => useQuery({
  queryKey: ['scan-status'],
  queryFn: () => fetchJson('/api/scan-status'),
  refetchInterval: (query) => (query.state.data?.active ? 1200 : 10000),
});

export const useImageStatusQuery = () => useQuery({
  queryKey: ['image-status'],
  queryFn: () => fetchJson('/api/image-status'),
  refetchInterval: (query) => (query.state.data?.active ? 1500 : 10000),
});

export const useDiscoveryQuery = () => useQuery({
  queryKey: ['discovery'],
  queryFn: () => fetchJson('/api/discovery'),
  enabled: false,
});

export const useDiscoveryCountQuery = () => useQuery({
  queryKey: ['discovery-count'],
  queryFn: () => fetchJson('/api/discovery/count'),
});

export const useHistoryQuery = () => useQuery({
  queryKey: ['history'],
  queryFn: () => fetchJson('/api/history'),
});
