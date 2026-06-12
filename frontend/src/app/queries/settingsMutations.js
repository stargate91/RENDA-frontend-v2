import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { settingsKeys } from './settingsKeys';

const SETTINGS_INVALIDATION_KEYS = [
  settingsKeys.all,
  ['discovery'],
  ['discovery-count'],
  ['stats'],
];

export const useUpdateSettingsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings) => api.settings.update(settings),
    onSuccess: () => {
      SETTINGS_INVALIDATION_KEYS.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });
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

export const useValidateFoldersMutation = () => useMutation({
  mutationFn: (payload) => api.settings.validateFolders(payload),
});
