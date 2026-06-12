import { getTabDefinition, getVisibleOrganizationTabs } from '../settingsTabs.config.jsx';

export default function useSettingsRenderContext({
  t,
  form,
  setForm,
  isSaving,
  isWiping,
  validationErrors,
  formInputs,
  insertTag,
  handleChange,
  handleCheckboxChange,
  handlePickFolder,
  handlePickFile,
  handleExportSettings,
  handleImportClick,
  handleImportSettings,
  handleWipeDatabase,
  activeTab,
  optionContext,
}) {
  const renderContext = {
    t,
    form,
    setForm,
    isSaving,
    isWiping,
    validationErrors,
    formInputs,
    insertTag,
    handleChange,
    handleCheckboxChange,
    handlePickFolder,
    handlePickFile,
    handleExportSettings,
    handleImportClick,
    handleImportSettings,
    handleWipeDatabase,
    ...optionContext,
  };

  return {
    renderContext,
    visibleOrganizationTabs: getVisibleOrganizationTabs(renderContext),
    activeTabDefinition: getTabDefinition(activeTab),
    formContextActions: {
      handleChange,
      handleCheckboxChange,
      handlePickFolder,
      handlePickFile,
      insertTag,
    },
  };
}
