import { useSettingsField, useSettingsViewContext } from '../SettingsFormContext.jsx';
import SettingsSectionRenderer from './SettingsSectionRenderer.jsx';
import { createGeneralContentSection } from '../settingsSectionConfigs.jsx';

export default function GeneralContentSection({ t }) {
  const { adultGenderPreferenceOptions } = useSettingsViewContext();
  const includeAdultField = useSettingsField('include_adult');

  return (
    <SettingsSectionRenderer
      section={createGeneralContentSection(t, adultGenderPreferenceOptions)}
      context={{ include_adult: includeAdultField.checked }}
    />
  );
}
