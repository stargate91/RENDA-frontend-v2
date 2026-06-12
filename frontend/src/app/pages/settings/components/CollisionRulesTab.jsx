import Card from '@/ui/Card';
import Stack from '@/ui/Stack';
import { useSettingsField, useSettingsViewContext } from '../SettingsFormContext.jsx';
import SettingsSelectField from './fields/SettingsSelectField.jsx';
import SettingsTextField from './fields/SettingsTextField.jsx';

export default function CollisionRulesTab() {
  const { t, collisionOptions } = useSettingsViewContext();
  const collisionStrategyField = useSettingsField('collision_strategy');

  return (
    <Card
      title={t('settingsPage.sections.rules.title')}
      eyebrow={t('settingsPage.sections.rules.eyebrow')}
    >
      <Stack>
        <SettingsSelectField
          field="collision_strategy"
          label={t('settingsPage.sections.rules.collisionStrategy')}
          options={collisionOptions}
        />
        {collisionStrategyField.value === 'replace_if_better' && (
          <SettingsTextField
            field="collision_duration_tolerance_seconds"
            label={t('settingsPage.sections.rules.durationTolerance')}
            placeholder={t('settingsPage.sections.rules.durationTolerancePlaceholder')}
            type="number"
            min="0"
          />
        )}
      </Stack>
    </Card>
  );
}
