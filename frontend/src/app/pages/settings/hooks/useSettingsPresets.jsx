import { useCallback, useMemo } from 'react';
import { useSettingsViewContext } from '../SettingsFormContext.jsx';
import { getPresetCards, PRESETS_CONFIG } from '../settingsPresets.jsx';

export default function useSettingsPresets() {
  const { form, setForm, t, renderContext } = useSettingsViewContext();
  const isBackgroundActive = Boolean(renderContext?.isBackgroundActive);

  const presetCards = useMemo(() => getPresetCards(t), [t]);

  const setMoveToLibrary = useCallback((enabled) => {
    if (isBackgroundActive) return;
    setForm((prev) => ({
      ...prev,
      folder_move_to_library: enabled,
    }));
  }, [setForm, isBackgroundActive]);

  const applyPreset = useCallback((presetId) => {
    if (isBackgroundActive) return;
    const config = PRESETS_CONFIG[presetId];

    if (!config || form.custom_organization_enabled) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      ...config,
      organization_preset: presetId,
    }));
  }, [form.custom_organization_enabled, setForm, isBackgroundActive]);

  const setCustomOrganizationEnabled = useCallback((enabled) => {
    if (isBackgroundActive) return;
    setForm((prev) => ({
      ...prev,
      custom_organization_enabled: enabled,
    }));
  }, [setForm, isBackgroundActive]);

  return {
    form,
    t,
    presetCards,
    applyPreset,
    setMoveToLibrary,
    setCustomOrganizationEnabled,
    isScanActive: isBackgroundActive,
  };
}
