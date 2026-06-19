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
