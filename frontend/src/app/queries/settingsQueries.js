import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { settingsKeys } from './settingsKeys';
export * from './settingsKeys';
export * from './settingsMutations';

export const useSettingsQuery = () => useQuery({
  queryKey: settingsKeys.all,
  queryFn: () => api.settings.get(),
});
