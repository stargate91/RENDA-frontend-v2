import { useCallback, useState } from 'react';
import {
  getFolderValidationFieldErrors,
  normalizeFolderValidationResult,
} from '@/lib/api/settings';
import { useValidateFoldersMutation } from '@/queries';

export default function useFolderValidation({ t, onInvalid }) {
  const validateFoldersMutation = useValidateFoldersMutation();
  const [validationErrors, setValidationErrors] = useState({});

  const validateFolders = useCallback(async (scanDir, libraryPath, moveToLibrary) => {
    try {
      return await validateFoldersMutation.mutateAsync({
        default_scan_dir: scanDir,
        folder_library_path: libraryPath,
        folder_move_to_library: moveToLibrary,
      });
    } catch {
      return normalizeFolderValidationResult({ valid: false, message: 'backendUnavailable' });
    }
  }, [validateFoldersMutation]);

  const clearFolderValidation = useCallback(() => {
    setValidationErrors((prev) => ({
      ...prev,
      folders: null,
      scanFolder: null,
      targetFolder: null,
    }));
  }, []);

  const validateFormFolders = useCallback(async (form) => {
    const result = await validateFolders(
      form.default_scan_dir,
      form.folder_library_path,
      form.folder_move_to_library
    );

    if (!result.valid) {
      const fieldErrors = getFolderValidationFieldErrors(result);
      const scanError = fieldErrors.scanFolder
        ? (t(`settingsPage.validation.${fieldErrors.scanFolder}`) || fieldErrors.scanFolder)
        : null;
      const targetError = fieldErrors.targetFolder
        ? (t(`settingsPage.validation.${fieldErrors.targetFolder}`) || fieldErrors.targetFolder)
        : null;
      const generalError = fieldErrors.general
        ? (t(`settingsPage.validation.${fieldErrors.general}`) || fieldErrors.general)
        : null;
      const firstField = scanError
        ? 'scanFolder'
        : targetError
          ? 'targetFolder'
          : null;

      setValidationErrors((prev) => ({
        ...prev,
        scanFolder: scanError,
        targetFolder: targetError,
        folders: generalError,
      }));

      onInvalid?.({
        firstField,
        scanError,
        targetError,
        generalError,
      });
    } else {
      clearFolderValidation();
    }

    return result;
  }, [clearFolderValidation, onInvalid, t, validateFolders]);

  return {
    validationErrors,
    setValidationErrors,
    clearFolderValidation,
    validateFormFolders,
  };
}
