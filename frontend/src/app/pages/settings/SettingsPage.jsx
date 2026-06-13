import { useEffect } from 'react';
import { useSettingsForm, useSettingsOptions, useSettingsRenderContext } from './hooks';
import { SettingsFormProvider } from './SettingsFormContext.jsx';
import {
  SettingsActionBar,
  SettingsChrome,
  SettingsErrorState,
  SettingsLoadingState,
  SettingsSidebar,
} from './components';
import { settingsTabGroups } from './settingsTabs.config.jsx';
import { SETTINGS_TAB_IDS } from './settingsConstants.js';

export default function SettingsPage() {
  const {
    t,
    settingsQuery,
    form,
    setForm,
    activeTab,
    setActiveTab,
    isOrgExpanded,
    setIsOrgExpanded,
    isOrganizationTabActive,
    isSaving,
    isWiping,
    isScanActive,
    isBackgroundActive,
    isSyncActive,
    validationErrors,
    isDirty,
    formInputs,
    insertTag,
    handleClose,
    handleChange,
    handleCheckboxChange,
    handlePickFolder,
    handlePickFile,
    handleExportSettings,
    handleImportClick,
    handleImportSettings,
    handleSave,
    handleWipeDatabase,
    handleReset,
    isShaking,
  } = useSettingsForm();

  const savedTheme = settingsQuery.data?.ui_theme || 'dark';
  const currentTheme = form.ui_theme || 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    return () => {
      document.documentElement.setAttribute('data-theme', savedTheme);
    };
  }, [currentTheme, savedTheme]);



  const optionContext = useSettingsOptions(t);
  const {
    renderContext,
    visibleOrganizationTabs,
    activeTabDefinition,
    formContextActions,
  } = useSettingsRenderContext({
    t,
    form,
    setForm,
    isSaving,
    isWiping,
    isScanActive,
    isBackgroundActive,
    isSyncActive,
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
  });
  const activeOrganizationIndex = visibleOrganizationTabs
    .filter((tab) => tab.isCurrentlyVisible)
    .findIndex((tab) => tab.id === activeTab);
  if (settingsQuery.isLoading) {
    return <SettingsLoadingState t={t} />;
  }

  if (settingsQuery.isError) {
    return (
      <SettingsErrorState
        t={t}
        onRetry={() => settingsQuery.refetch()}
        onClose={handleClose}
      />
    );
  }

  return (
    <div className="settings-overlay">
      <SettingsSidebar
        t={t}
        tabGroups={settingsTabGroups}
        visibleOrganizationTabs={visibleOrganizationTabs}
        activeOrganizationIndex={activeOrganizationIndex}
        activeTab={activeTab}
        isOrgExpanded={isOrgExpanded}
        isOrganizationTabActive={isOrganizationTabActive}
        onTabSelect={setActiveTab}
        onOrganizationToggle={() => {
          setActiveTab(SETTINGS_TAB_IDS.PRESETS);
          setIsOrgExpanded(!isOrgExpanded);
        }}
      />

      <main className="settings-content-wrapper">
        <SettingsChrome t={t} onClose={handleClose} />

        <div className="settings-content">
          <div className="settings-tab-content">
            <SettingsFormProvider
              form={form}
              validationErrors={validationErrors}
              isSaving={isSaving}
              formInputs={formInputs}
              actions={formContextActions}
              renderContext={renderContext}
            >
              {activeTabDefinition && (
                <activeTabDefinition.component {...(activeTabDefinition.getProps ? activeTabDefinition.getProps(renderContext) : {})} />
              )}
            </SettingsFormProvider>
          </div>
        </div>
      </main>

      <SettingsActionBar
        t={t}
        visible={isDirty}
        isSaving={isSaving}
        onReset={handleReset}
        onSave={handleSave}
        className={isShaking ? 'is-shaking' : ''}
      />
    </div>
  );
}
