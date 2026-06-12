import Card from '@/ui/Card';
import SelectableCard from '@/ui/SelectableCard';
import Switch from '@/ui/Switch';
import { useSettingsPresets } from '../hooks';
import SettingsLiveImpact from './SettingsLiveImpact.jsx';
import { useSettingsFormContext } from '../SettingsFormContext.jsx';

export default function PresetsTab() {
  const {
    form,
    t,
    presetCards,
    applyPreset,
    setMoveToLibrary,
    setCustomOrganizationEnabled,
  } = useSettingsPresets();
  const { renderContext } = useSettingsFormContext();
  const isScanActive = Boolean(renderContext?.isBackgroundActive);

  return (
    <div className="settings-tab-stack">
      <Card
        title={t('settingsPage.sections.mode.title')}
        eyebrow={t('settingsPage.sections.mode.eyebrow')}
      >
        <div className="settings-section-stack">
          <span className="ui-field__hint settings-hint--tight-top">
            {t('settingsPage.sections.mode.hint')}
          </span>
          <div className="settings-mode-grid">
            {/* Mode A: Library sorting */}
            <SelectableCard
              as="div"
              onClick={isScanActive ? undefined : () => setMoveToLibrary(true)}
              className="settings-mode-card"
              selected={form.folder_move_to_library}
              disabled={isScanActive}
            >
              <div className="settings-choice-header">
                <input
                  type="radio"
                  checked={form.folder_move_to_library}
                  onChange={() => {}}
                  disabled={isScanActive}
                  className="settings-choice-input"
                />
                <span className={`settings-choice-title${form.folder_move_to_library ? ' is-active' : ''}`}>
                  {t('settingsPage.sections.mode.library')}
                </span>
              </div>
              <span className="settings-choice-description">
                {t('settingsPage.sections.mode.libraryHint')}
              </span>
            </SelectableCard>

            {/* Mode B: In-place Rename */}
            <SelectableCard
              as="div"
              onClick={isScanActive ? undefined : () => setMoveToLibrary(false)}
              className="settings-mode-card"
              selected={!form.folder_move_to_library}
              disabled={isScanActive}
            >
              <div className="settings-choice-header">
                <input
                  type="radio"
                  checked={!form.folder_move_to_library}
                  onChange={() => {}}
                  disabled={isScanActive}
                  className="settings-choice-input"
                />
                <span className={`settings-choice-title${!form.folder_move_to_library ? ' is-active' : ''}`}>
                  {t('settingsPage.sections.mode.inplace')}
                </span>
              </div>
              <span className="settings-choice-description">
                {t('settingsPage.sections.mode.inplaceHint')}
              </span>
            </SelectableCard>
          </div>
        </div>
      </Card>

      <Card
        title={t('settingsPage.sections.organization.title')}
        eyebrow={t('settingsPage.sections.organization.eyebrow')}
      >
        <div className="settings-section-stack">
          <span className="ui-field__label">{t('settingsPage.sections.organization.presetLabel')}</span>
          <span className="ui-field__hint settings-hint--compact">
            {t('settingsPage.sections.organization.presetHint')}
          </span>
          <div className="settings-preset-grid">
            {presetCards.map((preset) => {
              const isSelected = form.organization_preset === preset.value;
              const isCardDisabled = isScanActive || (form.custom_organization_enabled && !isSelected);
              return (
                <SelectableCard
                  as="div"
                  key={preset.value}
                  onClick={isScanActive || form.custom_organization_enabled ? undefined : () => applyPreset(preset.value)}
                  className="settings-preset-card"
                  selected={isSelected}
                  disabled={isCardDisabled}
                >
                  <div className="settings-choice-header settings-choice-header--compact">
                    <span className="settings-preset-icon">{preset.icon}</span>
                    <span className={`settings-preset-title${isSelected ? ' is-active' : ''}`}>
                      {preset.label}
                    </span>
                    {isSelected && (
                      <span className="settings-preset-badge">
                        {t('settingsPage.sections.organization.activePreset')}
                      </span>
                    )}
                  </div>
                  <span className="settings-preset-description">
                    {preset.desc}
                  </span>
                </SelectableCard>
              );
            })}
          </div>
          
          <div className="settings-choice-stack">
            <Switch
              id="custom_organization_enabled"
              checked={form.custom_organization_enabled}
              disabled={isScanActive}
              onChange={(e) => setCustomOrganizationEnabled(e.target.checked)}
            >
              <span className="settings-choice-label-text">
                {t('settingsPage.sections.organization.customToggleLabel')}
              </span>
            </Switch>
            <span className="ui-field__hint settings-hint--indented">
              {t('settingsPage.sections.organization.customToggleHint')}
            </span>
          </div>
        </div>
      </Card>

      <SettingsLiveImpact
        form={form}
        t={t}
        title={t('settingsPage.sections.organization.previewTitle')}
        eyebrow={t('settingsPage.sections.organization.previewEyebrow')}
        hint={t('settingsPage.sections.organization.previewHint')}
      />
    </div>
  );
}
