import Stack from '@/ui/Stack';
import { useSettingsField, useSettingsViewContext } from '../SettingsFormContext.jsx';
import SettingsSectionRenderer from './SettingsSectionRenderer.jsx';
import {
  createAdvancedThresholdSection,
  createAdvancedLanguageSection
} from '../settingsSectionConfigs.jsx';

export default function AdvancedTab() {
  const { t, metadataLanguageOptions, targetLanguageOptions } = useSettingsViewContext();
  const metadataFollowUiField = useSettingsField('follow_app_language_for_media_library');
  const targetFollowUiField = useSettingsField('follow_app_language_for_naming');

  return (
    <Stack gap="xl">
      <SettingsSectionRenderer section={createAdvancedThresholdSection(t)} />
      <SettingsSectionRenderer
        section={createAdvancedLanguageSection(t, metadataLanguageOptions, targetLanguageOptions)}
        context={{
          metadataFollowUi: metadataFollowUiField.checked,
          targetFollowUi: targetFollowUiField.checked,
        }}
      />
    </Stack>
  );
}
