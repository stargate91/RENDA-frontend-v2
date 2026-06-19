import Inline from '@/ui/Inline';

export function createAdultGeneralSection(t, adultGenderPreferenceOptions) {
  return {
    title: t('settingsPage.sections.adult.title'),
    eyebrow: t('settingsPage.sections.adult.eyebrow'),
    items: [
      {
        type: 'switch',
        field: 'include_adult',
        id: 'include_adult',
        hint: t('settingsPage.sections.adult.includeAdultHint'),
        hintClassName: 'ui-field__hint settings-hint--spaced',
        children: (
          <Inline gap="sm" align="center" className="settings-inline-switch">
            <span>{t('settingsPage.sections.adult.includeAdult')}</span>
            <span className="settings-badge settings-badge--danger">
              {t('settingsPage.sections.adult.eighteenPlus')}
            </span>
          </Inline>
        ),
      },
      {
        type: 'select',
        field: 'adult_gender_preference',
        label: t('settingsPage.sections.adult.adultGenderPreference'),
        hint: t('settingsPage.sections.adult.adultGenderPreferenceHint'),
        options: adultGenderPreferenceOptions,
        visible: (context) => Boolean(context.include_adult),
      },
    ],
  };
}

export function createAdultStashdbSection(t) {
  return {
    title: t('settingsPage.sections.stashdb.title'),
    eyebrow: t('settingsPage.sections.stashdb.eyebrow'),
    items: [
      {
        type: 'text',
        field: 'stashdb_api_key',
        label: t('settingsPage.sections.stashdb.apiKey'),
        hint: t('settingsPage.sections.stashdb.apiKeyHint'),
        placeholder: "API Key...",
      },
      {
        type: 'text',
        field: 'stashdb_endpoint',
        label: t('settingsPage.sections.stashdb.endpoint'),
        hint: t('settingsPage.sections.stashdb.endpointHint'),
        placeholder: "https://stashdb.org/graphql",
      },
    ],
  };
}

export function createAdultFansdbSection(t) {
  return {
    title: t('settingsPage.sections.fansdb.title'),
    eyebrow: t('settingsPage.sections.fansdb.eyebrow'),
    items: [
      {
        type: 'text',
        field: 'fansdb_api_key',
        label: t('settingsPage.sections.fansdb.apiKey'),
        hint: t('settingsPage.sections.fansdb.apiKeyHint'),
        placeholder: "API Key...",
      },
      {
        type: 'text',
        field: 'fansdb_endpoint',
        label: t('settingsPage.sections.fansdb.endpoint'),
        hint: t('settingsPage.sections.fansdb.endpointHint'),
        placeholder: "https://fansdb.cc/graphql",
      },
    ],
  };
}

export function createAdultTheporndbSection(t) {
  return {
    title: t('settingsPage.sections.theporndb.title'),
    eyebrow: t('settingsPage.sections.theporndb.eyebrow'),
    items: [
      {
        type: 'text',
        field: 'theporndb_api_key',
        label: t('settingsPage.sections.theporndb.apiKey'),
        hint: t('settingsPage.sections.theporndb.apiKeyHint'),
        placeholder: "API Key...",
      },
      {
        type: 'text',
        field: 'theporndb_endpoint',
        label: t('settingsPage.sections.theporndb.endpoint'),
        hint: t('settingsPage.sections.theporndb.endpointHint'),
        placeholder: "https://theporndb.net/graphql",
      },
    ],
  };
}
