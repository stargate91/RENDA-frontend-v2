import SettingsInstructionsBox from '../components/SettingsInstructionsBox.jsx';

export function createApiTmdbSection(t) {
  return {
    title: t('settingsPage.sections.api.tmdbHeader'),
    eyebrow: t('settingsPage.sections.api.eyebrow'),
    gap: 'xl',
    items: [
      {
        type: 'text',
        field: 'tmdb_api_key',
        label: t('settingsPage.sections.api.tmdbKey'),
        placeholder: t('settingsPage.sections.api.tmdbKeyPlaceholder'),
        inputType: 'password',
      },
      {
        type: 'text',
        field: 'tmdb_bearer_token',
        label: t('settingsPage.sections.api.tmdbToken'),
        placeholder: t('settingsPage.sections.api.tmdbTokenPlaceholder'),
        inputType: 'password',
      },
      {
        type: 'custom',
        key: 'tmdb-instructions',
        render: () => (
          <SettingsInstructionsBox
            title={t('settingsPage.sections.api.tmdbStepsTitle')}
            steps={[
              <>{t('settingsPage.sections.api.tmdbStep1Start')}<a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="settings-link">themoviedb.org</a>{t('settingsPage.sections.api.tmdbStep1End')}</>,
              <>{t('settingsPage.sections.api.tmdbStep2Start')}<a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="settings-link">{t('settingsPage.sections.api.tmdbStep2Link')}</a>{t('settingsPage.sections.api.tmdbStep2End')}</>,
              <>{t('settingsPage.sections.api.tmdbStep3Start')}<strong>{t('settingsPage.sections.api.tmdbStep3Bold1')}</strong>{t('settingsPage.sections.api.tmdbStep3Mid')}<strong>{t('settingsPage.sections.api.tmdbStep3Bold2')}</strong>{t('settingsPage.sections.api.tmdbStep3End')}</>,
              <>{t('settingsPage.sections.api.tmdbStep4Start')}<strong>{t('settingsPage.sections.api.tmdbStep4Bold1')}</strong>{t('settingsPage.sections.api.tmdbStep4Mid')}<strong>{t('settingsPage.sections.api.tmdbStep4Bold2')}</strong>{t('settingsPage.sections.api.tmdbStep4End')}</>,
            ]}
          />
        ),
      },
    ],
  };
}

export function createApiOmdbSection(t) {
  return {
    title: t('settingsPage.sections.api.omdbHeader'),
    eyebrow: t('settingsPage.sections.api.eyebrow'),
    gap: 'xl',
    items: [
      {
        type: 'text',
        field: 'omdb_api_key',
        label: t('settingsPage.sections.api.omdbKey'),
        placeholder: t('settingsPage.sections.api.omdbKeyPlaceholder'),
        inputType: 'password',
      },
      {
        type: 'custom',
        key: 'omdb-instructions',
        render: () => (
          <SettingsInstructionsBox
            title={t('settingsPage.sections.api.omdbStepsTitle')}
            steps={[
              <>{t('settingsPage.sections.api.omdbStep1Start')}<a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer" className="settings-link">{t('settingsPage.sections.api.omdbStep1Link')}</a>{t('settingsPage.sections.api.omdbStep1End')}</>,
              <>{t('settingsPage.sections.api.omdbStep2Start')}<strong>{t('settingsPage.sections.api.omdbStep2Bold')}</strong>{t('settingsPage.sections.api.omdbStep2End')}</>,
              t('settingsPage.sections.api.omdbStep3'),
              <><strong>{t('settingsPage.sections.api.omdbStep4Bold')}</strong>{t('settingsPage.sections.api.omdbStep4End')}</>,
            ]}
          />
        ),
      },
    ],
  };
}
