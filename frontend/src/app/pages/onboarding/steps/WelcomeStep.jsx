import { Globe, Languages, SlidersHorizontal, Search, CheckCircle, Check } from 'lucide-react';
import OnboardingInfoCard from '../OnboardingInfoCard';
import OnboardingOrbitHero from '../OnboardingOrbitHero';
import OnboardingPanelCard from '../OnboardingPanelCard';
import { useTranslation } from '@/providers/LanguageContext';

export default function WelcomeStep({
  locale,
  setLocale,
  filteredLanguages,
  langSearch,
  setLangSearch,
  availableLanguages,
}) {
  const { t } = useTranslation();

  return (
    <div className="onboarding-split-layout">
      <OnboardingInfoCard
        visual={(
          <OnboardingOrbitHero
            icon={Globe}
            chips={[
              { label: 'Locale', position: 'top-right' },
              { label: 'Native', position: 'bottom-left' },
              { label: 'Localized', position: 'top-left' },
            ]}
          />
        )}
        kicker="Getting started"
        title="A few quick steps and you are ready."
        description="You can revisit everything later in Settings."
        items={[
          {
            icon: Languages,
            title: 'Step 1 of 6',
            description: 'After this, we move on to metadata access and library folders.',
          },
          {
            icon: SlidersHorizontal,
            title: 'One setup, app-wide',
            description: 'These preferences shape how RENDA behaves across the rest of the app.',
          },
        ]}
      />

      <OnboardingPanelCard
        eyebrow="Step 1"
        title="Choose your interface language"
        meta={(
          <div className="welcome-lang-pill">{filteredLanguages.length} {t('onboarding.welcome.options')}</div>
        )}
        description="Select your interface language to begin setup."
        footerLabel="Current selection"
        footerValue={availableLanguages.find((lang) => lang.code === locale)?.name || 'English'}
      >
        <div className="lang-search-wrapper">
          <Search size={16} className="lang-search-icon" />
          <input 
            type="text" 
            placeholder="Search languages..." 
            value={langSearch}
            onChange={(e) => setLangSearch(e.target.value)}
          />
        </div>

        <div className="welcome-lang-active-note">
          <CheckCircle size={16} />
          {t('onboarding.welcome.englishOnlyActiveNote')}
        </div>

        <div className="language-list-scroll">
          {filteredLanguages.map((lang) => {
            return (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions
              <div 
                key={lang.code}
                className={`language-row-item ${locale === lang.code ? 'is-selected' : ''} ${!lang.active ? 'is-disabled' : ''}`}
                onClick={() => lang.active && setLocale(lang.code)}
              >
                <div className="lang-row-left">
                  <span className="lang-row-flag-frame">
                    <span className="lang-row-flag-glow" />
                    <img src={lang.flagUrl} alt={lang.name} className="lang-row-flag-img" />
                  </span>
                  <span className="lang-row-name">{lang.name}</span>
                </div>
                {locale === lang.code && <Check size={16} className="lang-checked-icon" />}
                {!lang.active && <span className="lang-coming-soon">{t('onboarding.welcome.comingSoon')}</span>}
              </div>
            );
          })}
        </div>
      </OnboardingPanelCard>
    </div>
  );
}
