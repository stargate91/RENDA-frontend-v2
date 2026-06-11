import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

export const useScanStatusQuery = () => useQuery({
  queryKey: ['scan-status'],
  queryFn: () => api.scan.getStatus(),
  refetchInterval: (query) => (query.state.data?.active ? 1200 : 10000),
});

export const useScanMutation = () => useMutation({
  mutationFn: (payload) => api.scan.start(payload),
});
