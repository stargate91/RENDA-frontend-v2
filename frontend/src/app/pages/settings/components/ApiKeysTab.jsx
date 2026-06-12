import Stack from '@/ui/Stack';
import { useSettingsViewContext } from '../SettingsFormContext.jsx';
import SettingsSectionRenderer from './SettingsSectionRenderer.jsx';
import { createApiTmdbSection, createApiOmdbSection } from '../settingsSectionConfigs.jsx';

export default function ApiKeysTab() {
  const { t } = useSettingsViewContext();

  return (
    <Stack gap="xl">
      <SettingsSectionRenderer section={createApiTmdbSection(t)} />
      <hr className="settings-divider" />
      <SettingsSectionRenderer section={createApiOmdbSection(t)} />
    </Stack>
  );
}
