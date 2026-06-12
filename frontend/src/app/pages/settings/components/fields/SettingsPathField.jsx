import Button from '@/ui/Button';
import SettingsTextField from './SettingsTextField.jsx';
import { useSettingsFormContext, useSettingsField } from '../../SettingsFormContext.jsx';

export default function SettingsPathField({
  field,
  t,
  picker = 'folder',
  disabled = false,
  buttonLabel,
  className = 'settings-browse-button',
  ...props
}) {
  const { actions, isSaving } = useSettingsFormContext();
  const fieldState = useSettingsField(field);
  const handlePick = picker === 'file'
    ? actions.handlePickFile(field)
    : actions.handlePickFolder(field);

  const isFieldDisabled = disabled || fieldState.disabled;

  return (
    <div className="settings-input-row">
      <div className="settings-input-grow">
        <SettingsTextField field={field} {...props} />
      </div>
      <Button
        variant="secondary"
        onClick={handlePick}
        disabled={isFieldDisabled || isSaving}
        className={className}
      >
        {buttonLabel || t('settingsPage.sections.folders.browse')}
      </Button>
    </div>
  );
}
