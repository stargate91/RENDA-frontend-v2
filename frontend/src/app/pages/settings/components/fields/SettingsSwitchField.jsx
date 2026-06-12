import Switch from '@/ui/Switch';
import { useSettingsField } from '../../SettingsFormContext.jsx';

export default function SettingsSwitchField({ field, onChange, children, ...props }) {
  const fieldState = useSettingsField(field);

  return (
    <Switch
      {...props}
      checked={fieldState.checked}
      disabled={props.disabled || fieldState.disabled}
      onChange={onChange || fieldState.onChange}
    >
      {children}
    </Switch>
  );
}
