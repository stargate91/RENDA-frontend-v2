import { useCallback } from 'react';
import { validateJsonStructure } from '@/lib/validation';
import { getInitialFormValues } from '../settingsFormValues.js';

export default function useSettingsBackup({ form, setForm, fileInputRef, toast, t, isScanActive }) {
  const handleExportSettings = useCallback(() => {
    if (isScanActive) {
      toast(t('settingsPage.dangerZone.backgroundActiveError'), 'danger');
      return;
    }
    try {
      const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(form, null, 2))}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `renda_settings_${form.user_name || t('settingsPage.sections.backup.defaultFilenameUser')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast(t('settingsPage.sections.backup.exportSuccess'), 'success');
    } catch {
      toast(t('settingsPage.sections.backup.exportError'), 'danger');
    }
  }, [form, t, toast, isScanActive]);

  const handleImportClick = useCallback(() => {
    if (isScanActive) {
      toast(t('settingsPage.dangerZone.backgroundActiveError'), 'danger');
      return;
    }
    fileInputRef.current?.click();
  }, [fileInputRef, isScanActive, toast, t]);

  const handleImportSettings = useCallback((event) => {
    if (isScanActive) {
      toast(t('settingsPage.dangerZone.backgroundActiveError'), 'danger');
      event.target.value = '';
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        const reference = getInitialFormValues({});

        if (!validateJsonStructure(imported, reference)) {
          throw new Error('Invalid structure or value types');
        }

        setForm((prev) => ({
          ...prev,
          ...imported
        }));

        toast(t('settingsPage.sections.backup.importSuccess'), 'success');
      } catch {
        toast(t('settingsPage.sections.backup.importError'), 'danger');
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  }, [setForm, t, toast, isScanActive]);

  return {
    handleExportSettings,
    handleImportClick,
    handleImportSettings,
  };
}
