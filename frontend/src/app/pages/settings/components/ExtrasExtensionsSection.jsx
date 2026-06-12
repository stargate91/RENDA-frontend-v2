import Card from '@/ui/Card';
import Stack from '@/ui/Stack';
import SettingsTextField from './fields/SettingsTextField.jsx';

export default function ExtrasExtensionsSection({ t }) {
  return (
    <Card
      title={t('settingsPage.sections.extras.extensionsTitle')}
      eyebrow={t('settingsPage.sections.extras.extensionsEyebrow')}
    >
      <Stack gap="xl">
        <div className="settings-section-stack">
          <h3 className="settings-section-heading">
            {t('settingsPage.sections.extras.mediaSideFilesTitle')}
          </h3>
          <Stack gap="md">
            <SettingsTextField
              field="extras_sub_exts"
              label={t('settingsPage.sections.extras.subExts')}
              placeholder=".srt, .sub, .ass"
            />
            <SettingsTextField
              field="extras_audio_exts"
              label={t('settingsPage.sections.extras.audioExts')}
              placeholder=".mka, .ac3, .dts"
            />
          </Stack>
        </div>
        <div className="settings-section-stack">
          <h3 className="settings-section-heading">
            {t('settingsPage.sections.extras.supportFilesTitle')}
          </h3>
          <Stack gap="md">
            <SettingsTextField
              field="extras_img_exts"
              label={t('settingsPage.sections.extras.imgExts')}
              placeholder=".jpg, .png, .gif"
            />
            <SettingsTextField
              field="extras_meta_exts"
              label={t('settingsPage.sections.extras.metaExts')}
              placeholder=".nfo, .xml, .txt"
            />
          </Stack>
        </div>
      </Stack>
    </Card>
  );
}
