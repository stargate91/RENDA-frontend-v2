import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const useDiscoveryQuery = () => useQuery({
  queryKey: ['discovery'],
  queryFn: () => api.discovery.get(),
  enabled: false,
});

export const useDiscoveryCountQuery = () => useQuery({
  queryKey: ['discovery-count'],
  queryFn: () => api.discovery.getCount(),
});
