import FloatingActionBar from '@/ui/FloatingActionBar';

export default function SettingsActionBar({
  t,
  visible,
  isSaving,
  onReset,
  onSave,
  className = '',
}) {
  return (
    <FloatingActionBar
      visible={visible}
      className={className}
      title={t('settingsPage.unsavedChanges.title')}
      actions={[
        {
          key: 'reset',
          label: t('settingsPage.unsavedChanges.reset'),
          onClick: onReset,
          disabled: isSaving,
        },
        {
          key: 'save',
          label: isSaving ? t('settingsPage.sections.api.saving') : t('settingsPage.unsavedChanges.save'),
          onClick: onSave,
          disabled: isSaving,
          variant: 'primary',
        },
      ]}
    />
  );
}
