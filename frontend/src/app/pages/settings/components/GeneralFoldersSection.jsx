import { AlertTriangle } from 'lucide-react';
import Card from '@/ui/Card';
import Stack from '@/ui/Stack';
import { useSettingsField, useSettingsFormContext, useSettingsInputRef } from '../SettingsFormContext.jsx';
import SettingsPathField from './fields/SettingsPathField.jsx';

export default function GeneralFoldersSection({ t }) {
  const { validationErrors } = useSettingsFormContext();
  const targetFolderField = useSettingsField('folder_library_path');
  const moveToLibraryField = useSettingsField('folder_move_to_library');
  const scanFolderInputRef = useSettingsInputRef('scanFolder');
  const targetFolderInputRef = useSettingsInputRef('targetFolder');

  return (
    <Card
      title={t('settingsPage.sections.folders.title')}
      eyebrow={t('settingsPage.sections.folders.eyebrow')}
    >
      <Stack>
        {validationErrors.folders && !validationErrors.scanFolder && !validationErrors.targetFolder && (
          <div className="settings-alert settings-alert--danger settings-alert--spaced">
            <AlertTriangle size={16} />
            <span>{validationErrors.folders}</span>
          </div>
        )}

        <div className="settings-field-stack">
          <SettingsPathField
            field="default_scan_dir"
            t={t}
            label={t('settingsPage.sections.folders.scanFolder')}
            placeholder={t('settingsPage.sections.folders.scanFolderPlaceholder')}
            inputRef={scanFolderInputRef}
          />
        </div>

        {moveToLibraryField.checked && (
          <div className="settings-field-stack settings-field-stack--spaced">
            <SettingsPathField
              field="folder_library_path"
              t={t}
              label={t('settingsPage.sections.folders.targetFolder')}
              placeholder={t('settingsPage.sections.folders.targetFolderPlaceholder')}
              inputRef={targetFolderInputRef}
            />
            {!targetFolderField.value.trim() && (
              <div className="settings-alert settings-alert--warning settings-alert--soft">
                <AlertTriangle size={16} className="settings-icon-shrink-0" />
                <span>{t('settingsPage.sections.mode.warningHint')}</span>
              </div>
            )}
          </div>
        )}
      </Stack>
    </Card>
  );
}
