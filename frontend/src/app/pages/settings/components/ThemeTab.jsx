import { Check } from 'lucide-react';
import { useSettingsViewContext, useSettingsField } from '../SettingsFormContext.jsx';
import Card from '@/ui/Card';

const THEME_LIST = [
  { value: 'dark', translationKey: 'settingsPage.sections.theme.options.dark' },
  { value: 'renda-legacy', translationKey: 'settingsPage.sections.theme.options.rendaLegacy' },
  { value: 'tokyo-night', translationKey: 'settingsPage.sections.theme.options.tokyoNight' },
  { value: 'dracula', translationKey: 'settingsPage.sections.theme.options.dracula' },
  { value: 'gruvbox-dark', translationKey: 'settingsPage.sections.theme.options.gruvboxDark' },
  { value: 'nord', translationKey: 'settingsPage.sections.theme.options.nord' },
  { value: 'rose-pine', translationKey: 'settingsPage.sections.theme.options.rosePine' },
  { value: 'premium-carbon', translationKey: 'settingsPage.sections.theme.options.premiumCarbon' },
  { value: 'amoled-modern', translationKey: 'settingsPage.sections.theme.options.amoledModern' },
  { value: 'pine-forest', translationKey: 'settingsPage.sections.theme.options.pineForest' },
  { value: 'classic-dark', translationKey: 'settingsPage.sections.theme.options.classicDark' },
  { value: 'bladerunner-la', translationKey: 'settingsPage.sections.theme.options.bladerunnerLA' },
  { value: 'bladerunner-2049', translationKey: 'settingsPage.sections.theme.options.bladerunner2049' },
  { value: 'cyberpunk-dark', translationKey: 'settingsPage.sections.theme.options.cyberpunkDark' },
  { value: 'solarized-dark', translationKey: 'settingsPage.sections.theme.options.solarizedDark' }
];

export default function ThemeTab() {
  const { t } = useSettingsViewContext();
  const { value: currentTheme, onChange } = useSettingsField('ui_theme');

  return (
    <Card
      title={t('settingsPage.sections.theme.title')}
      eyebrow={t('settingsPage.sections.theme.eyebrow')}
    >
      <div className="theme-tab-container">
        <div className="theme-tab-header">
          <label className="theme-tab-description">
            {t('settingsPage.sections.theme.hint') || 'Choose how the app should look.'}
          </label>
        </div>

        <div className="theme-grid">
          {THEME_LIST.map((theme) => {
            const isActive = currentTheme === theme.value;
            const label = t(theme.translationKey) || theme.value;

            return (
              <div
                key={theme.value}
                className={`theme-card ${isActive ? 'theme-card--active' : ''}`}
                onClick={() => {
                  if (onChange) {
                    onChange({ target: { value: theme.value } });
                  }
                }}
              >
                <div className="theme-card__header">
                  <span className="theme-card__name">{label}</span>
                  <div className="theme-card__indicator">
                    <Check size={12} strokeWidth={3} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
