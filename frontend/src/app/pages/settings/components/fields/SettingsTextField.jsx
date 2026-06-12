import Input from '@/ui/Input';
import { useSettingsField } from '../../SettingsFormContext.jsx';

export default function SettingsTextField({ field, onChange, ...props }) {
  const fieldState = useSettingsField(field);

  return (
    <Input
      {...props}
      value={fieldState.value ?? ''}
      error={props.error ?? fieldState.error}
      onChange={onChange || fieldState.onChange}
    />
  );
}
