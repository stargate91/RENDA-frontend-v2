import { useCallback } from 'react';
import { selectFile, selectFolder } from '@/lib/ipc';

export default function useSettingsPickers({ form, setForm, clearFolderValidation }) {
  const handleChange = useCallback((key) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));

    if (key === 'default_scan_dir' || key === 'folder_library_path') {
      clearFolderValidation();
    }
  }, [clearFolderValidation, setForm]);

  const handleCheckboxChange = useCallback((key) => (event) => {
    setForm((current) => ({
      ...current,
      [key]: event.target.checked,
    }));

    if (key === 'folder_move_to_library') {
      clearFolderValidation();
    }
  }, [clearFolderValidation, setForm]);

  const handlePickFolder = useCallback((key) => async () => {
    const selectedPath = await selectFolder(form[key]);
    if (!selectedPath) {
      return;
    }

    setForm((current) => ({ ...current, [key]: selectedPath }));
    if (key === 'default_scan_dir' || key === 'folder_library_path') {
      clearFolderValidation();
    }
  }, [form, setForm]);

  const handlePickFile = useCallback((key) => async () => {
    const selectedPath = await selectFile(form[key]);
    if (!selectedPath) {
      return;
    }

    setForm((current) => ({
      ...current,
      [key]: selectedPath,
    }));
  }, [form, setForm]);

  return {
    handleChange,
    handleCheckboxChange,
    handlePickFolder,
    handlePickFile,
  };
}
