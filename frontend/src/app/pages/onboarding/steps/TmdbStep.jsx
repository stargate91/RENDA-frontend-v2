import { Key, CheckCircle } from 'lucide-react';
import Button from '@/ui/Button';
import OnboardingOrbitHero from '../OnboardingOrbitHero';
import OnboardingPanelCard from '../OnboardingPanelCard';
import { TMDB_GUIDE_STEPS } from '../onboarding.constants';
import { useTranslation } from '@/providers/LanguageContext';

export default function TmdbStep({
  tmdbApiKey,
  setTmdbApiKey,
  tmdbBearerToken,
  setTmdbBearerToken,
  tmdbValidation,
  validateTmdb,
  isValidatingApi,
  isTmdbGuideOpen,
  openTmdbGuide,
  closeTmdbGuide,
  tmdbGuideStep,
  goToTmdbGuideStep,
  tmdbGuideDirection,
  activeTmdbGuideStep,
  openGuideLink,
  step,
}) {
  const { t } = useTranslation();

  return (
    <div className={`onboarding-split-layout onboarding-split-layout--tmdb ${isTmdbGuideOpen ? 'is-guided' : ''}`}>
      <OnboardingPanelCard
        className={`tmdb-guide-panel ${isTmdbGuideOpen ? 'is-guided' : ''}`}
        eyebrow="Step 3"
        title={isTmdbGuideOpen ? t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.title`, { defaultValue: activeTmdbGuideStep.title }) : t('onboarding.tmdbGuide.activateTmdb', { defaultValue: 'Activate TMDB access to continue' })}
        meta={(
          <div className="welcome-lang-pill">
            {isTmdbGuideOpen ? `${tmdbGuideStep + 1} / ${TMDB_GUIDE_STEPS.length}` : t('onboarding.tmdbGuide.requiredOneTimeSetup', { defaultValue: 'Required one-time setup' })}
          </div>
        )}
        description={isTmdbGuideOpen
          ? t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.description`, { defaultValue: activeTmdbGuideStep.description })
          : t('onboarding.tmdbGuide.scanningLimitedDesc', { defaultValue: 'RENDA needs TMDB before scanning can do real metadata matching, artwork lookups, and clean organization.' })}
        footerLabel={isTmdbGuideOpen ? t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.eyebrow`, { defaultValue: activeTmdbGuideStep.eyebrow }) : t('onboarding.tmdbGuide.whyThisIsRequired', { defaultValue: 'Why this is required' })}
        footerValue={isTmdbGuideOpen ? t('onboarding.tmdbGuide.guidedModeActive', { defaultValue: 'Guided mode active' }) : t('onboarding.tmdbGuide.scanningLimited', { defaultValue: 'Without TMDB, scanning stays limited to technical file data only.' })}
      >
        {!isTmdbGuideOpen ? (
          <div className="tmdb-guide-intro">
            <OnboardingOrbitHero
              icon={Key}
              className="tmdb-guide-hero"
              chips={[
                { label: 'TMDB' },
                { label: 'v3 Key' },
                { label: 'v4 Token' },
              ]}
            />

            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon"><CheckCircle size={18} /></span>
                <div>
                  <strong>{t('onboarding.tmdb.requiredToContinue')}</strong>
                  <p>{t('onboarding.tmdb.requiredToContinueDesc')}</p>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-icon"><Key size={18} /></span>
                <div>
                  <strong>{t('onboarding.tmdb.onlyOnce')}</strong>
                  <p>{t('onboarding.tmdb.onlyOnceDesc')}</p>
                </div>
              </div>
            </div>

            <div className="tmdb-guide-intro-actions">
              <Button variant="primary" onClick={openTmdbGuide}>
                {t('onboarding.tmdb.showMe')}
              </Button>
              <Button variant="secondary" onClick={() => openGuideLink('https://www.themoviedb.org/settings/api')}>
                {t('onboarding.tmdb.openApiPage')}
              </Button>
            </div>
          </div>
        ) : (
          <div key={`tmdb-guide-${tmdbGuideStep}`} className={`tmdb-guide-stage tmdb-guide-stage--${tmdbGuideDirection}`}>
            <div className="tmdb-guide-visual">
              <div className="tmdb-guide-browser">
                <div className="tmdb-guide-browser-top">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="tmdb-guide-browser-bar">
                  <span className="tmdb-guide-browser-url">{t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.browserLabel`, { defaultValue: activeTmdbGuideStep.browserLabel })}</span>
                  <span className="tmdb-guide-browser-chip">{t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.browserAccent`, { defaultValue: activeTmdbGuideStep.browserAccent })}</span>
                </div>
                <div className="tmdb-guide-browser-body">
                  <div className="tmdb-guide-browser-sidebar">
                    <span className="is-strong" />
                    <span />
                    <span />
                  </div>
                  <div className="tmdb-guide-browser-focus">
                    <strong>{t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.eyebrow`, { defaultValue: activeTmdbGuideStep.eyebrow })}</strong>
                    <p>{t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.detail`, { defaultValue: activeTmdbGuideStep.detail })}</p>
                    <div className="tmdb-guide-browser-lines">
                      {activeTmdbGuideStep.lines.map((line, index) => (
                        <div key={line} className="tmdb-guide-browser-line">
                          <span className="tmdb-guide-browser-line-dot" />
                          <span>{t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.lines.${index}`, { defaultValue: line })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="tmdb-guide-stage-copy">
              <span className="tmdb-guide-stage-kicker">{t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.eyebrow`, { defaultValue: activeTmdbGuideStep.eyebrow })}</span>
              <p>{t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.detail`, { defaultValue: activeTmdbGuideStep.detail })}</p>
            </div>

            {activeTmdbGuideStep.supportTitle ? (
              <div className="tmdb-guide-support">
                <strong>{t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.supportTitle`, { defaultValue: activeTmdbGuideStep.supportTitle })}</strong>
                <div className="tmdb-guide-support-list">
                  {activeTmdbGuideStep.supportItems?.map((item, index) => (
                    <div key={item} className="tmdb-guide-support-item">
                      <span className="tmdb-guide-support-dot" />
                      <span>{t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.supportItems.${index}`, { defaultValue: item })}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="tmdb-guide-stage-actions">
              <div className="tmdb-guide-stage-actions-left">
                <Button
                  variant="secondary-neutral"
                  onClick={() => (tmdbGuideStep === 0 ? closeTmdbGuide() : goToTmdbGuideStep(tmdbGuideStep - 1, 'backward'))}
                >
                  {tmdbGuideStep === 0 ? t('onboarding.tmdbGuide.closeGuide', { defaultValue: 'Close guide' }) : t('onboarding.tmdbGuide.back', { defaultValue: 'Back' })}
                </Button>
                {activeTmdbGuideStep.actionHref ? (
                  <Button
                    variant="secondary"
                    onClick={() => openGuideLink(activeTmdbGuideStep.actionHref)}
                  >
                    {t(`onboarding.tmdbGuide.steps.${tmdbGuideStep}.actionLabel`, { defaultValue: activeTmdbGuideStep.actionLabel })}
                  </Button>
                ) : null}
              </div>

              <Button
                variant="primary"
                onClick={() => (
                  tmdbGuideStep === TMDB_GUIDE_STEPS.length - 1
                    ? closeTmdbGuide()
                    : goToTmdbGuideStep(tmdbGuideStep + 1, 'forward')
                )}
              >
                {tmdbGuideStep === TMDB_GUIDE_STEPS.length - 1 ? t('onboarding.tmdbGuide.backToForm', { defaultValue: 'Back to form' }) : t('onboarding.tmdbGuide.ready', { defaultValue: 'Ready' })}
              </Button>
            </div>
          </div>
        )}
      </OnboardingPanelCard>

      <div className={`tmdb-credentials-column ${isTmdbGuideOpen ? 'is-guided' : ''}`}>
        <OnboardingPanelCard
          className={`tmdb-credentials-panel ${isTmdbGuideOpen ? 'is-guided' : ''}`}
          eyebrow="TMDB credentials"
          title="Paste your TMDB keys to unlock scanning"
          meta={<div className="welcome-lang-pill">{t('onboarding.tmdb.twoFieldsRequired')}</div>}
          description="Both values are required before RENDA can move past this step."
          footerLabel="This step blocks the next one"
          footerValue="Validate both keys to continue onboarding"
        >
          <div className="onboarding-form-group">
            <label>{t('onboarding.tmdb.apiKeyLabel')}</label>
            <div className="onboarding-input-wrapper">
              <input 
                type="text" 
                value={tmdbApiKey}
                onChange={(e) => setTmdbApiKey(e.target.value)}
                placeholder="Enter TMDB API Key"
              />
            </div>
          </div>
          <div className="onboarding-form-group">
            <label>{t('onboarding.tmdb.readAccessTokenLabel')}</label>
            <div className="onboarding-input-wrapper">
              <input 
                type="text" 
                value={tmdbBearerToken}
                onChange={(e) => setTmdbBearerToken(e.target.value)}
                placeholder="Enter TMDB bearer token"
              />
            </div>
          </div>
          <Button 
            variant="secondary" 
            onClick={validateTmdb}
            disabled={isValidatingApi}
          >
            {isValidatingApi ? 'Validating...' : 'Validate Credentials'}
          </Button>
          {tmdbValidation.valid !== null && (
            <div className={`onboarding-validation-status ${tmdbValidation.valid ? 'success' : 'error'}`}>
              {tmdbValidation.message}
            </div>
          )}
        </OnboardingPanelCard>

        {isTmdbGuideOpen ? (
          <div className="tmdb-inline-timeline">
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <div key={num} className={`timeline-dot-wrapper ${num <= step ? 'is-active' : ''} ${num === step ? 'is-current' : ''}`}>
                <div className="timeline-dot" />
                {num < 6 && <div className="timeline-line" />}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
