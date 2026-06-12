import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from '@/ui/Button';
import Checkbox from '@/ui/Checkbox';
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
    openModal,
    closeModal,
  } = useSettingsForm();

  const savedTheme = settingsQuery.data?.ui_theme || 'dark';
  const currentTheme = form.ui_theme || 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    return () => {
      document.documentElement.setAttribute('data-theme', savedTheme);
    };
  }, [currentTheme, savedTheme]);

  useEffect(() => {
    const hasShownWarning = sessionStorage.getItem('renda:settings-active-warning-shown');
    if (isBackgroundActive && !hasShownWarning && localStorage.getItem('renda:skip-settings-active-warning') !== 'true') {
      sessionStorage.setItem('renda:settings-active-warning-shown', 'true');
      let dontShowAgain = false;
      
      const handleCheckboxChange = (e) => {
        dontShowAgain = e.target.checked;
      };

      openModal({
        title: t('settingsPage.activeTasksWarning.title'),
        icon: AlertTriangle,
        variant: 'danger',
        content: (
          <div className="ui-modal__body-text">
            <p style={{ marginBottom: '16px', lineHeight: '1.5' }}>
              {t('settingsPage.activeTasksWarning.description')}
            </p>
            <Checkbox onChange={handleCheckboxChange}>
              {t('settingsPage.activeTasksWarning.dontShowAgain')}
            </Checkbox>
          </div>
        ),
        footer: (
          <Button
            variant="secondary-neutral"
            onClick={() => {
              if (dontShowAgain) {
                localStorage.setItem('renda:skip-settings-active-warning', 'true');
              }
              closeModal();
            }}
          >
            {t('settingsPage.activeTasksWarning.ok')}
          </Button>
        ),
      });
    }
  }, [isBackgroundActive, openModal, closeModal, t]);

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
