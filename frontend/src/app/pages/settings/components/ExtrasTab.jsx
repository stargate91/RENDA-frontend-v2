import Stack from '@/ui/Stack';
import { useSettingsField, useSettingsViewContext } from '../SettingsFormContext.jsx';
import ExtrasGeneralSection from './ExtrasGeneralSection.jsx';
import ExtrasExtensionsSection from './ExtrasExtensionsSection.jsx';
import ExtrasRulesSection from './ExtrasRulesSection.jsx';
import SettingsLiveImpact from './SettingsLiveImpact.jsx';

export default function ExtrasTab() {
  const { t, form } = useSettingsViewContext();
  const extrasEnabledField = useSettingsField('extras_enabled');

  return (
    <Stack gap="xl">
      <ExtrasGeneralSection t={t} />

      {extrasEnabledField.checked && (
        <>
          <ExtrasExtensionsSection t={t} />
          <ExtrasRulesSection t={t} />
        </>
      )}

      <SettingsLiveImpact
        form={form}
        t={t}
        title={t('settingsPage.sections.liveImpact.title')}
        eyebrow={t('settingsPage.sections.liveImpact.eyebrow')}
        hint={t('settingsPage.sections.liveImpact.extrasHint')}
      />
    </Stack>
  );
}
