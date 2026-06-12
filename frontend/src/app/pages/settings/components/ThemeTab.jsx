import { useSettingsViewContext } from '../SettingsFormContext.jsx';
import SettingsSectionRenderer from './SettingsSectionRenderer.jsx';
import { createThemeSection } from '../settingsSectionConfigs.jsx';

export default function ThemeTab() {
  const { t, themeOptions } = useSettingsViewContext();
  return <SettingsSectionRenderer section={createThemeSection(t, themeOptions)} />;
}
