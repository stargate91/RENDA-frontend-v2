import Button from '@/ui/Button';
import OnboardingPanelCard from '../OnboardingPanelCard';
import { OMDB_GUIDE_STEPS } from '../onboarding.constants';
import { useTranslation } from '@/providers/LanguageContext';

export default function OmdbStep({
  omdbApiKey,
  setOmdbApiKey,
  omdbValidation,
  validateOmdb,
  isValidatingApi,
  isOmdbGuideOpen,
  openOmdbGuide,
  closeOmdbGuide,
  omdbGuideStep,
  goToOmdbGuideStep,
  omdbGuideDirection,
  activeOmdbGuideStep,
  openGuideLink,
  step,
}) {
  const { t } = useTranslation();

  return (
    <div className={`onboarding-split-layout onboarding-split-layout--tmdb ${isOmdbGuideOpen ? 'is-guided' : ''}`}>
      <OnboardingPanelCard
        className={`tmdb-guide-panel ${isOmdbGuideOpen ? 'is-guided' : ''}`}
        eyebrow="Step 4"
        title={isOmdbGuideOpen ? t(`onboarding.omdbGuide.steps.${omdbGuideStep}.title`, { defaultValue: activeOmdbGuideStep.title }) : t('onboarding.omdbGuide.activateRatings', { defaultValue: 'Activate OMDb ratings to continue' })}
        meta={(
          <div className="welcome-lang-pill">
            {isOmdbGuideOpen ? `${omdbGuideStep + 1} / ${OMDB_GUIDE_STEPS.length}` : t('onboarding.omdbGuide.requiredOneTimeSetup', { defaultValue: 'Required one-time setup' })}
          </div>
        )}
        description={isOmdbGuideOpen
          ? t(`onboarding.omdbGuide.steps.${omdbGuideStep}.description`, { defaultValue: activeOmdbGuideStep.description })
          : t('onboarding.omdbGuide.ratingsPurposeDesc', { defaultValue: 'RENDA uses OMDb for IMDb, Metascore, and Rotten Tomatoes ratings during enrichment.' })}
        footerLabel={isOmdbGuideOpen ? t(`onboarding.omdbGuide.steps.${omdbGuideStep}.eyebrow`, { defaultValue: activeOmdbGuideStep.eyebrow }) : t('onboarding.omdbGuide.whyThisIsRequired', { defaultValue: 'Why this is required' })}
        footerValue={isOmdbGuideOpen ? t('onboarding.omdbGuide.guidedModeActive', { defaultValue: 'Guided mode active' }) : t('onboarding.omdbGuide.ratingsMetricsDesc', { defaultValue: 'Ratings provide the metrics displayed on movie details.' })}
      >
        {!isOmdbGuideOpen ? (
          <div className="tmdb-guide-intro">
            <div className="feature-list onboarding-feature-list-margin">
              <div className="feature-item">
                <div className="onboarding-feature-item-no-padding">
                  <strong>{t('onboarding.omdb.optionalButRecommended')}</strong>
                  <p>{t('onboarding.omdb.optionalButRecommendedDesc')}</p>
                </div>
              </div>
            </div>

            <div className="tmdb-guide-intro-actions">
              <Button variant="primary" onClick={openOmdbGuide}>
                {t('onboarding.omdb.getOmdbKey')}
              </Button>
            </div>
          </div>
        ) : (
          <div key={`omdb-guide-${omdbGuideStep}`} className={`tmdb-guide-stage tmdb-guide-stage--${omdbGuideDirection}`}>
            <div className="tmdb-guide-visual">
              <div className="tmdb-guide-browser">
                <div className="tmdb-guide-browser-top">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="tmdb-guide-browser-bar">
                  <span className="tmdb-guide-browser-url">{t(`onboarding.omdbGuide.steps.${omdbGuideStep}.browserLabel`, { defaultValue: activeOmdbGuideStep.browserLabel })}</span>
                  <span className="tmdb-guide-browser-chip">{t(`onboarding.omdbGuide.steps.${omdbGuideStep}.browserAccent`, { defaultValue: activeOmdbGuideStep.browserAccent })}</span>
                </div>
                <div className="tmdb-guide-browser-body">
                  <div className="tmdb-guide-browser-sidebar">
                    <span className="is-strong" />
                    <span />
                    <span />
                  </div>
                  <div className="tmdb-guide-browser-focus">
                    <strong>{t(`onboarding.omdbGuide.steps.${omdbGuideStep}.eyebrow`, { defaultValue: activeOmdbGuideStep.eyebrow })}</strong>
                    <p>{t(`onboarding.omdbGuide.steps.${omdbGuideStep}.detail`, { defaultValue: activeOmdbGuideStep.detail })}</p>
                    <div className="tmdb-guide-browser-lines">
                      {activeOmdbGuideStep.lines.map((line, index) => (
                        <div key={line} className="tmdb-guide-browser-line">
                          <span className="tmdb-guide-browser-line-dot" />
                          <span>{t(`onboarding.omdbGuide.steps.${omdbGuideStep}.lines.${index}`, { defaultValue: line })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="tmdb-guide-stage-copy">
              <span className="tmdb-guide-stage-kicker">{t(`onboarding.omdbGuide.steps.${omdbGuideStep}.eyebrow`, { defaultValue: activeOmdbGuideStep.eyebrow })}</span>
              <p>{t(`onboarding.omdbGuide.steps.${omdbGuideStep}.detail`, { defaultValue: activeOmdbGuideStep.detail })}</p>
            </div>

            {activeOmdbGuideStep.supportTitle ? (
              <div className="tmdb-guide-support">
                <strong>{t(`onboarding.omdbGuide.steps.${omdbGuideStep}.supportTitle`, { defaultValue: activeOmdbGuideStep.supportTitle })}</strong>
                <div className="tmdb-guide-support-list">
                  {activeOmdbGuideStep.supportItems?.map((item, index) => (
                    <div key={item} className="tmdb-guide-support-item">
                      <span className="tmdb-guide-support-dot" />
                      <span>{t(`onboarding.omdbGuide.steps.${omdbGuideStep}.supportItems.${index}`, { defaultValue: item })}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="tmdb-guide-stage-actions">
              <div className="tmdb-guide-stage-actions-left">
                <Button
                  variant="secondary-neutral"
                  onClick={() => (omdbGuideStep === 0 ? closeOmdbGuide() : goToOmdbGuideStep(omdbGuideStep - 1, 'backward'))}
                >
                  {omdbGuideStep === 0 ? t('onboarding.omdbGuide.closeGuide', { defaultValue: 'Close guide' }) : t('onboarding.omdbGuide.back', { defaultValue: 'Back' })}
                </Button>
                {activeOmdbGuideStep.actionHref ? (
                  <Button
                    variant="secondary"
                    onClick={() => openGuideLink(activeOmdbGuideStep.actionHref)}
                  >
                    {t(`onboarding.omdbGuide.steps.${omdbGuideStep}.actionLabel`, { defaultValue: activeOmdbGuideStep.actionLabel })}
                  </Button>
                ) : null}
              </div>

              <Button
                variant="primary"
                onClick={() => (
                  omdbGuideStep === OMDB_GUIDE_STEPS.length - 1
                    ? closeOmdbGuide()
                    : goToOmdbGuideStep(omdbGuideStep + 1, 'forward')
                )}
              >
                {omdbGuideStep === OMDB_GUIDE_STEPS.length - 1 ? t('onboarding.omdbGuide.backToForm', { defaultValue: 'Back to form' }) : t('onboarding.omdbGuide.ready', { defaultValue: 'Ready' })}
              </Button>
            </div>
          </div>
        )}
      </OnboardingPanelCard>

      <div className={`tmdb-credentials-column ${isOmdbGuideOpen ? 'is-guided' : ''}`}>
        <OnboardingPanelCard
          className={`tmdb-credentials-panel ${isOmdbGuideOpen ? 'is-guided' : ''}`}
          eyebrow="OMDb key"
          title="Paste your OMDb key to unlock ratings"
          meta={<div className="welcome-lang-pill">{t('onboarding.omdb.oneFieldRequired')}</div>}
          description="This key is required before RENDA can enrich items with ratings data."
          footerLabel="This step blocks the next one"
          footerValue="Validate the OMDb key to continue onboarding"
        >
          <div className="onboarding-form-group">
            <label>{t('onboarding.omdb.apiKeyLabel')}</label>
            <div className="onboarding-input-wrapper">
              <input 
                type="text" 
                value={omdbApiKey}
                onChange={(e) => setOmdbApiKey(e.target.value)}
                placeholder="Enter OMDb API Key"
              />
            </div>
          </div>
          <Button 
            variant="secondary" 
            onClick={validateOmdb}
            disabled={isValidatingApi}
          >
            {isValidatingApi ? 'Validating...' : 'Validate Key'}
          </Button>
          {omdbValidation.valid !== null && (
            <div className={`onboarding-validation-status ${omdbValidation.valid ? 'success' : 'error'}`}>
              {omdbValidation.message}
            </div>
          )}
        </OnboardingPanelCard>

        {isOmdbGuideOpen ? (
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
