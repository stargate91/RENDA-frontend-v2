import { createContext, useContext, useMemo } from 'react';

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
  const { form, actions, validationErrors } = useSettingsFormContext();
  const value = form[name];
  const isBooleanField = typeof value === 'boolean';
  const errorMap = {
    default_scan_dir: validationErrors?.scanFolder,
    folder_library_path: validationErrors?.targetFolder,
  };

  return {
    value,
    checked: Boolean(value),
    error: errorMap[name] || null,
    onChange: isBooleanField ? actions.handleCheckboxChange(name) : actions.handleChange(name),
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
