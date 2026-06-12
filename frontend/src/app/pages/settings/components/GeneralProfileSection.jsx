import SettingsSectionRenderer from './SettingsSectionRenderer.jsx';
import { createGeneralProfileSection } from '../settingsSectionConfigs.jsx';

export default function GeneralProfileSection({ t }) {
  return <SettingsSectionRenderer section={createGeneralProfileSection(t)} />;
}
