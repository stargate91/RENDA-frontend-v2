import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

export const useRenameMutation = () => useMutation({
  mutationFn: (payload) => api.rename.start(payload),
});
