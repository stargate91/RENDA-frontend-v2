import { useState, useEffect, useRef, useCallback } from 'react';
import { buildSettingsPayload } from '@/lib/api/settings';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/queries';
import { getInitialFormValues } from '../settingsFormValues.js';
import { isSettingsDirty } from '../settingsMapper.js';

export default function useSettingsPersistence({
  t,
  toast,
  validateFormFolders,
  onValidationInvalid,
}) {
  const settingsQuery = useSettingsQuery();
  const settings = settingsQuery.data;
  const updateSettingsMutation = useUpdateSettingsMutation();
  const [form, setForm] = useState(() => getInitialFormValues(null, t));
  const [isSaving, setIsSaving] = useState(false);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (settings && !isInitializedRef.current) {
      setForm(getInitialFormValues(settings, t));
      isInitializedRef.current = true;
    }
  }, [settings, t]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);

    try {
      const validationResult = await validateFormFolders(form);
      if (!validationResult.valid) {
        onValidationInvalid?.();
        setIsSaving(false);
        let localizedMessage = '';

        if (validationResult.errors) {
          const firstKey = Object.keys(validationResult.errors)[0];
          const errorValue = validationResult.errors[firstKey];
          localizedMessage = t(`settingsPage.validation.${errorValue}`) || errorValue;
        } else {
          localizedMessage = t(`settingsPage.validation.${validationResult.code}`) || validationResult.code;
        }

        toast(localizedMessage || t('settingsPage.saveFailed'), 'danger');
        return;
      }

      isInitializedRef.current = false;
      await updateSettingsMutation.mutateAsync(buildSettingsPayload(form));
      toast(t('settingsPage.saved'), 'success');
    } catch (error) {
      const localizedErrorMessage = t(`settingsPage.validation.${error.message}`) || error.message;
      toast(localizedErrorMessage || t('settingsPage.saveFailed'), 'danger');
    } finally {
      setIsSaving(false);
    }
  }, [form, onValidationInvalid, t, toast, updateSettingsMutation, validateFormFolders]);

  const handleReset = useCallback(() => {
    if (settings) {
      setForm(getInitialFormValues(settings, t));
    }
  }, [settings, t]);

  return {
    settingsQuery,
    settings,
    form,
    setForm,
    isSaving,
    isDirty: isSettingsDirty(form, settings, t),
    handleSave,
    handleReset,
    resetInitialization: () => {
      isInitializedRef.current = false;
    },
  };
}
