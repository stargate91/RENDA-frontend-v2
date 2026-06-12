import { useCallback, useMemo } from 'react';
import { useSettingsViewContext } from '../SettingsFormContext.jsx';
import { getPresetCards, PRESETS_CONFIG } from '../settingsPresets.jsx';

export default function useSettingsPresets() {
  const { form, setForm, t } = useSettingsViewContext();

  const presetCards = useMemo(() => getPresetCards(t), [t]);

  const setMoveToLibrary = useCallback((enabled) => {
    setForm((prev) => ({
      ...prev,
      folder_move_to_library: enabled,
    }));
  }, [setForm]);

  const applyPreset = useCallback((presetId) => {
    const config = PRESETS_CONFIG[presetId];

    if (!config || form.custom_organization_enabled) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      ...config,
      organization_preset: presetId,
    }));
  }, [form.custom_organization_enabled, setForm]);

  const setCustomOrganizationEnabled = useCallback((enabled) => {
    setForm((prev) => ({
      ...prev,
      custom_organization_enabled: enabled,
    }));
  }, [setForm]);

  return {
    form,
    t,
    presetCards,
    applyPreset,
    setMoveToLibrary,
    setCustomOrganizationEnabled,
  };
}
