import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

export const useSettingsQuery = () => useQuery({
  queryKey: ['settings'],
  queryFn: () => api.settings.get(),
});

export const useUpdateSettingsMutation = () => useMutation({
  mutationFn: (settings) => api.settings.update(settings),
});

export const useClearDatabaseMutation = () => useMutation({
  mutationFn: (options) => api.settings.clearDatabase(options),
});
