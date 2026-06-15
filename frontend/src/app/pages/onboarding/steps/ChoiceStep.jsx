import { Cpu, FileJson } from 'lucide-react';
import OnboardingInfoCard from '../OnboardingInfoCard';
import OnboardingOrbitHero from '../OnboardingOrbitHero';
import OnboardingPanelCard from '../OnboardingPanelCard';
import { useTranslation } from '@/providers/LanguageContext';

export default function ChoiceStep({
  configChoice,
  setConfigChoice,
  isImporting,
  handleFileImport,
}) {
  const { t } = useTranslation();

  return (
    <div className="onboarding-split-layout">
      <OnboardingInfoCard
        visual={(
          <OnboardingOrbitHero
            icon={Cpu}
            chips={[
              { label: 'Setup', position: 'top-right' },
              { label: 'Import', position: 'bottom-left' },
              { label: 'Profile', position: 'top-left' },
            ]}
          />
        )}
        kicker="Setup path"
        title="Choose how you want to begin."
        description="Start from scratch or bring in a saved profile."
        items={[
          {
            icon: Cpu,
            title: 'Step 2 of 6',
            description: 'This decides whether the next steps build a fresh setup or use an existing one.',
          },
          {
            icon: FileJson,
            title: 'Flexible either way',
            description: 'You can keep going manually or jump ahead by importing a backup file.',
          },
        ]}
      />

      <OnboardingPanelCard
        className="onboarding-choice-panel"
        eyebrow="Step 2"
        title="How would you like to continue?"
        meta={<div className="welcome-lang-pill">{configChoice === 'new' ? 'Fresh setup' : 'Import profile'}</div>}
        description="Pick the setup path that fits how you want to configure RENDA."
        footerLabel="Current mode"
        footerValue={configChoice === 'new' ? 'Configure from scratch' : 'Import from backup'}
      >
        <div className="onboarding-choice-step">
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div 
            className={`onboarding-choice-card ${configChoice === 'new' ? 'is-selected' : ''}`}
            onClick={() => setConfigChoice('new')}
          >
            <div className="choice-icon-wrapper">
              <Cpu size={24} />
            </div>
            <h3>{t('onboarding.choice.configureNewSetup')}</h3>
            <p>{t('onboarding.choice.configureNewSetupDesc')}</p>
          </div>

          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div 
            className={`onboarding-choice-card ${configChoice === 'import' ? 'is-selected' : ''}`}
            onClick={() => setConfigChoice('import')}
          >
            <div className="choice-icon-wrapper">
              <FileJson size={24} />
            </div>
            <h3>{t('onboarding.choice.importBackupProfile')}</h3>
            <p>{t('onboarding.choice.importBackupProfileDesc')}</p>
            
            <div className={`onboarding-choice-action-slot ${configChoice === 'import' ? 'is-active' : ''}`}>
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div className="onboarding-dropzone" onClick={(e) => e.stopPropagation()}>
                <label className="onboarding-dropzone-label">
                  <p>{isImporting ? 'Importing settings...' : 'Click to Browse JSON'}</p>
                  <input 
                    type="file" 
                    accept=".json" 
                    className="onboarding-hidden-input"
                    onChange={handleFileImport}
                    disabled={isImporting || configChoice !== 'import'}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </OnboardingPanelCard>
    </div>
  );
}
