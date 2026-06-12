import Stack from '@/ui/Stack';
import { useSettingsField, useSettingsViewContext } from '../SettingsFormContext.jsx';
import SettingsSectionRenderer from './SettingsSectionRenderer.jsx';
import { useSyncLanguageMutation } from '@/queries';
import { useUi } from '@/providers/UiProvider';
import {
  createAdvancedThresholdSection,
  createAdvancedLanguageSection
} from '../settingsSectionConfigs.jsx';

export default function AdvancedTab() {
  const { t, metadataLanguageOptions, targetLanguageOptions, isBackgroundActive } = useSettingsViewContext();
  const metadataFollowUiField = useSettingsField('follow_app_language_for_media_library');
  const targetFollowUiField = useSettingsField('follow_app_language_for_naming');
  const syncLanguageMutation = useSyncLanguageMutation();
  const { toast } = useUi();

  const handleSyncLanguage = async () => {
    try {
      await syncLanguageMutation.mutateAsync();
      toast(t('settingsPage.languageChangeInfo.syncStarted'), 'success');
    } catch (err) {
      toast(err.message || t('settingsPage.languageChangeInfo.syncFailed'), 'danger');
    }
  };

  return (
    <Stack gap="xl">
      <SettingsSectionRenderer section={createAdvancedThresholdSection(t)} />
      <SettingsSectionRenderer
        section={createAdvancedLanguageSection(
          t,
          metadataLanguageOptions,
          targetLanguageOptions,
          handleSyncLanguage,
          syncLanguageMutation.isPending || isBackgroundActive
        )}
        context={{
          metadataFollowUi: metadataFollowUiField.checked,
          targetFollowUi: targetFollowUiField.checked,
        }}
      />
    </Stack>
  );
}
