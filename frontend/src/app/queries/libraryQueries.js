import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const useStatsQuery = () => useQuery({
  queryKey: ['stats'],
  queryFn: () => api.library.getStats(),
});

