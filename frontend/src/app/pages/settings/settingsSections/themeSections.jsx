export function createThemeSection(t, themeOptions) {
  return {
    title: t('settingsPage.sections.theme.title'),
    eyebrow: t('settingsPage.sections.theme.eyebrow'),
    items: [
      {
        type: 'select',
        field: 'ui_theme',
        label: t('settingsPage.sections.theme.label'),
        hint: t('settingsPage.sections.theme.hint'),
        options: themeOptions,
      },
    ],
  };
}
