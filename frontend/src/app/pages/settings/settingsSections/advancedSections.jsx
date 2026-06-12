import SettingsSelectField from '../components/fields/SettingsSelectField.jsx';
import Button from '@/ui/Button';

export function createAdvancedThresholdSection(t) {
  return {
    title: t('settingsPage.sections.advanced.title'),
    eyebrow: t('settingsPage.sections.advanced.eyebrow'),
    items: [
      {
        type: 'text',
        field: 'min_video_size_mb',
        label: t('settingsPage.sections.advanced.minVideoSizeMb'),
        hint: t('settingsPage.sections.advanced.minVideoSizeMbHint'),
        inputType: 'number',
        min: '0',
      },
      {
        type: 'text',
        field: 'min_video_duration_minutes',
        label: t('settingsPage.sections.advanced.minVideoDurationMinutes'),
        hint: t('settingsPage.sections.advanced.minVideoDurationMinutesHint'),
        inputType: 'number',
        min: '0',
      },
    ],
  };
}

export function createAdvancedLanguageSection(t, metadataLanguageOptions, targetLanguageOptions, onSyncLanguage, isSyncing) {
  return {
    title: t('settingsPage.sections.advancedLanguage.title'),
    eyebrow: t('settingsPage.sections.advancedLanguage.eyebrow'),
    items: [
      {
        type: 'switch',
        field: 'follow_app_language_for_media_library',
        id: 'follow_app_language_for_media_library',
        hint: t('settingsPage.sections.advancedLanguage.metadataFollowsUiHint'),
        hintClassName: 'ui-field__hint settings-hint--compact-bottom',
        children: t('settingsPage.sections.advancedLanguage.metadataFollowsUi'),
      },
      {
        type: 'custom',
        key: 'primary_metadata_language',
        visible: (context) => !context.metadataFollowUi,
        render: () => (
          <SettingsSelectField
            field="primary_metadata_language"
            label={t('settingsPage.sections.advancedLanguage.metadataLanguage')}
            hint={t('settingsPage.sections.advancedLanguage.metadataLanguageHint')}
            options={metadataLanguageOptions}
            className="settings-dropdown-nested settings-dropdown-nested--spaced"
          />
        ),
      },
      {
        type: 'custom',
        key: 'fallback_metadata_language',
        visible: (context) => !context.metadataFollowUi,
        render: () => (
          <SettingsSelectField
            field="fallback_metadata_language"
            label={t('settingsPage.sections.advancedLanguage.fallbackMetadataLanguage')}
            hint={t('settingsPage.sections.advancedLanguage.fallbackMetadataLanguageHint')}
            options={metadataLanguageOptions}
            className="settings-dropdown-nested settings-dropdown-nested--spaced"
          />
        ),
      },
      {
        type: 'switch',
        field: 'follow_app_language_for_naming',
        id: 'follow_app_language_for_naming',
        hint: t('settingsPage.sections.advancedLanguage.targetFollowsUiHint'),
        hintClassName: 'ui-field__hint settings-hint--compact-bottom',
        children: t('settingsPage.sections.advancedLanguage.targetFollowsUi'),
      },
      {
        type: 'custom',
        key: 'default_target_language',
        visible: (context) => !context.targetFollowUi,
        render: () => (
          <SettingsSelectField
            field="default_target_language"
            label={t('settingsPage.sections.advancedLanguage.targetLanguage')}
            hint={t('settingsPage.sections.advancedLanguage.targetLanguageHint')}
            options={targetLanguageOptions}
            className="settings-dropdown-nested"
          />
        ),
      },
      {
        type: 'custom',
        key: 'sync_language_button_container',
        render: () => (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <Button
              variant="secondary"
              type="button"
              onClick={onSyncLanguage}
              disabled={isSyncing}
            >
              {t('settingsPage.languageChangeInfo.syncButton')}
            </Button>
          </div>
        ),
      },
    ],
  };
}
