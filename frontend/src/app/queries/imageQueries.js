import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const useImageStatusQuery = () => useQuery({
  queryKey: ['image-status'],
  queryFn: () => api.image.getStatus(),
  refetchInterval: (query) => (query.state.data?.active ? 1500 : 10000),
});
