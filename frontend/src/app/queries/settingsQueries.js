import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export const useSettingsQuery = () => useQuery({
  queryKey: ['settings'],
  queryFn: () => api.settings.get(),
});

export const useUpdateSettingsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings) => api.settings.update(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['discovery'] });
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useClearDatabaseMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options) => api.settings.clearDatabase(options),
    onSuccess: () => {
      queryClient.resetQueries();
    },
  });
};

export const useValidateFoldersMutation = () => {
  return useMutation({
    mutationFn: (payload) => api.settings.validateFolders(payload),
  });
};
