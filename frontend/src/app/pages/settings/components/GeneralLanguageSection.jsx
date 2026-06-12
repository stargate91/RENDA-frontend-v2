import { useSettingsViewContext } from '../SettingsFormContext.jsx';
import SettingsSectionRenderer from './SettingsSectionRenderer.jsx';
import { createGeneralLanguageSection } from '../settingsSectionConfigs.jsx';

export default function GeneralLanguageSection() {
  const { t, appLanguageOptions } = useSettingsViewContext();
  return <SettingsSectionRenderer section={createGeneralLanguageSection(t, appLanguageOptions)} />;
}
