import Inline from '@/ui/Inline';

export function createGeneralProfileSection(t) {
  return {
    title: t('settingsPage.sections.profile.title'),
    eyebrow: t('settingsPage.sections.profile.eyebrow'),
    items: [
      {
        type: 'text',
        field: 'user_name',
        label: t('settingsPage.sections.profile.nickname'),
        placeholder: t('settingsPage.sections.profile.nicknamePlaceholder'),
      },
    ],
  };
}

export function createGeneralLanguageSection(t, appLanguageOptions) {
  return {
    title: t('settingsPage.sections.language.title'),
    eyebrow: t('settingsPage.sections.language.eyebrow'),
    items: [
      {
        type: 'select',
        field: 'ui_language',
        label: t('settingsPage.sections.language.appLanguage'),
        hint: t('settingsPage.sections.language.hint'),
        options: appLanguageOptions,
      },
    ],
  };
}

export function createGeneralContentSection(t, adultGenderPreferenceOptions) {
  return {
    title: t('settingsPage.sections.content.title'),
    eyebrow: t('settingsPage.sections.content.eyebrow'),
    items: [
      {
        type: 'switch',
        field: 'include_adult',
        id: 'include_adult',
        hint: t('settingsPage.sections.content.includeAdultHint'),
        hintClassName: 'ui-field__hint settings-hint--spaced',
        children: (
          <Inline gap="sm" align="center" className="settings-inline-switch">
            <span>{t('settingsPage.sections.content.includeAdult')}</span>
            <span className="settings-badge settings-badge--danger">
              {t('settingsPage.sections.content.eighteenPlus')}
            </span>
          </Inline>
        ),
      },
      {
        type: 'select',
        field: 'adult_gender_preference',
        label: t('settingsPage.sections.content.adultGenderPreference'),
        hint: t('settingsPage.sections.content.adultGenderPreferenceHint'),
        options: adultGenderPreferenceOptions,
        visible: (context) => Boolean(context.include_adult),
      },
      {
        type: 'switch',
        field: 'auto_hydrate_inactive_people',
        id: 'auto_hydrate_inactive_people',
        hint: t('settingsPage.sections.content.autoHydrateInactivePeopleHint'),
        hintClassName: 'ui-field__hint settings-hint--compact-bottom',
        children: t('settingsPage.sections.content.autoHydrateInactivePeople'),
      },
    ],
  };
}

export function createGeneralCloseBehaviorSection(t, closeBehaviorOptions) {
  return {
    title: t('settingsPage.sections.closeBehavior.title'),
    eyebrow: t('settingsPage.sections.closeBehavior.eyebrow'),
    items: [
      {
        type: 'select',
        field: 'close_button_behavior',
        label: t('settingsPage.sections.closeBehavior.label'),
        hint: t('settingsPage.sections.closeBehavior.hint'),
        options: closeBehaviorOptions,
      },
    ],
  };
}
