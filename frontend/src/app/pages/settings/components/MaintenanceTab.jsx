/* eslint-disable react-hooks/refs */
import Card from '@/ui/Card';
import Stack from '@/ui/Stack';
import Inline from '@/ui/Inline';
import Button from '@/ui/Button';

export default function MaintenanceTab({
  t,
  isSaving,
  isWiping,
  isScanActive,
  handleExportSettings,
  handleImportClick,
  handleImportSettings,
  handleWipeDatabase,
  formInputs
}) {
  return (
    <Stack gap="xl">
      <Card
        title={t('settingsPage.sections.backup.title')}
        eyebrow={t('settingsPage.sections.backup.eyebrow')}
      >
        <Stack>
          <span className="ui-field__hint">
            {t('settingsPage.sections.backup.description')}
          </span>
          <Inline gap="md" className="settings-inline-actions">
            <Button variant="secondary" onClick={handleExportSettings} disabled={isSaving}>
              {t('settingsPage.sections.backup.exportBtn')}
            </Button>
            <Button variant="secondary" onClick={handleImportClick} disabled={isSaving}>
              {t('settingsPage.sections.backup.importBtn')}
            </Button>
            <input
              type="file"
              ref={formInputs.backupFile}
              onChange={handleImportSettings}
              accept=".json"
              className="settings-hidden-input"
            />
          </Inline>
        </Stack>
      </Card>

      <Card title={t('settingsPage.dangerZone.title')} eyebrow={t('settingsPage.dangerZone.eyebrow')} className="ui-card--danger">
        <Stack>
          <span className="ui-field__hint">
            {t('settingsPage.dangerZone.desc')}
          </span>
          <Inline className="settings-inline-actions">
            <Button variant="danger" onClick={handleWipeDatabase} disabled={isWiping || isSaving || isScanActive}>
              {isWiping ? t('settingsPage.dangerZone.buttonWiping') : t('settingsPage.dangerZone.button')}
            </Button>
          </Inline>
        </Stack>
      </Card>
    </Stack>
  );
}
