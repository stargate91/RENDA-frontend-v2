import Stack from '@/ui/Stack';
import { useSettingsViewContext } from '../SettingsFormContext.jsx';
import GeneralProfileSection from './GeneralProfileSection.jsx';
import GeneralFoldersSection from './GeneralFoldersSection.jsx';
import GeneralLanguageSection from './GeneralLanguageSection.jsx';
import GeneralCloseBehaviorSection from './GeneralCloseBehaviorSection.jsx';
import GeneralPlaybackSection from './GeneralPlaybackSection.jsx';

export default function GeneralTab() {
  const { t } = useSettingsViewContext();

  return (
    <Stack gap="xl">
      <GeneralProfileSection t={t} />
      <GeneralFoldersSection t={t} />
      <GeneralLanguageSection />
      <GeneralCloseBehaviorSection />
      <GeneralPlaybackSection t={t} />
    </Stack>
  );
}
