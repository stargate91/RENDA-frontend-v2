import Dropdown from '@/ui/Dropdown';
import { useSettingsField } from '../../SettingsFormContext.jsx';

export default function SettingsSelectField({ field, onChange, ...props }) {
  const fieldState = useSettingsField(field);

  return (
    <Dropdown
      {...props}
      value={fieldState.value}
      onChange={onChange || fieldState.onChange}
    />
  );
}
