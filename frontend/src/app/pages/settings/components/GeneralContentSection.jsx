import SettingsSectionRenderer from './SettingsSectionRenderer.jsx';
import { createGeneralContentSection } from '../settingsSectionConfigs.jsx';

export default function GeneralContentSection({ t }) {
  return <SettingsSectionRenderer section={createGeneralContentSection(t)} />;
}
