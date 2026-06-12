import Card from '@/ui/Card';
import Stack from '@/ui/Stack';
import SettingsPathField from './fields/SettingsPathField.jsx';

export default function GeneralPlaybackSection({ t }) {
  return (
    <Card
      title={t('settingsPage.sections.playback.title')}
      eyebrow={t('settingsPage.sections.playback.eyebrow')}
    >
      <Stack>
        <SettingsPathField
          field="vlc_path"
          picker="file"
          t={t}
          label={t('settingsPage.sections.playback.vlcPath')}
          placeholder={t('settingsPage.sections.playback.vlcPlaceholder')}
          buttonLabel={t('settingsPage.sections.playback.browse')}
        />
        <SettingsPathField
          field="mpc_path"
          picker="file"
          t={t}
          label={t('settingsPage.sections.playback.mpcPath')}
          placeholder={t('settingsPage.sections.playback.mpcPlaceholder')}
          buttonLabel={t('settingsPage.sections.playback.browse')}
        />
      </Stack>
    </Card>
  );
}
