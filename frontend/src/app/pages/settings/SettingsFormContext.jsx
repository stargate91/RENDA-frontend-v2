import { createContext, useContext, useMemo } from 'react';
import { ORGANIZATION_TAB_IDS } from './settingsConstants.js';

const SettingsFormContext = createContext(null);

export function SettingsFormProvider({
  children,
  form,
  validationErrors,
  isSaving,
  formInputs,
  actions,
  renderContext,
}) {
  const value = useMemo(() => ({
    form,
    validationErrors,
    isSaving,
    formInputs,
    actions,
    renderContext,
  }), [form, validationErrors, isSaving, formInputs, actions, renderContext]);

  return (
    <SettingsFormContext.Provider value={value}>
      {children}
    </SettingsFormContext.Provider>
  );
}

export function useSettingsFormContext() {
  const context = useContext(SettingsFormContext);

  if (!context) {
    throw new Error('useSettingsFormContext must be used inside SettingsFormProvider');
  }

  return context;
}

export function useSettingsField(name) {
  const { form, actions, validationErrors, renderContext } = useSettingsFormContext();
  const value = form[name];
  const isBooleanField = typeof value === 'boolean';
  
  const isScanActive = Boolean(renderContext?.isScanActive);
  const isBackgroundActive = Boolean(renderContext?.isBackgroundActive);
  const activeTab = renderContext?.activeTab;
  const isOrgTab = ORGANIZATION_TAB_IDS.includes(activeTab);
  const isApiKeysTab = activeTab === 'apiKeys';
  const isAdvancedTab = activeTab === 'advanced';
  const isMaintenanceTab = activeTab === 'maintenance';
  const isFolderField = name === 'folder_library_path' || name === 'default_scan_dir';
  
  let disabled = Boolean(
    isBackgroundActive && (isOrgTab || isFolderField || isApiKeysTab || isAdvancedTab || isMaintenanceTab)
  );

  if (name === 'ui_language' && isBackgroundActive) {
    const followMedia = Boolean(form.follow_app_language_for_media_library);
    const followNaming = Boolean(form.follow_app_language_for_naming);
    if (followMedia || followNaming) {
      disabled = true;
    }
  }

  const errorMap = {
    default_scan_dir: validationErrors?.scanFolder,
    folder_library_path: validationErrors?.targetFolder,
  };

  return {
    value,
    checked: Boolean(value),
    error: errorMap[name] || null,
    disabled,
    onChange: disabled
      ? () => {}
      : (isBooleanField ? actions.handleCheckboxChange(name) : actions.handleChange(name)),
  };
}

export function useSettingsInputRef(name) {
  const { formInputs } = useSettingsFormContext();
  return formInputs[name] || null;
}

export function useSettingsViewContext() {
  const { renderContext } = useSettingsFormContext();
  return renderContext;
}
