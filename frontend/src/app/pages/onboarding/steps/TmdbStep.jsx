import React from 'react';
import { Key, CheckCircle } from 'lucide-react';
import Button from '@/ui/Button';
import OnboardingOrbitHero from '../OnboardingOrbitHero';
import OnboardingPanelCard from '../OnboardingPanelCard';
import { TMDB_GUIDE_STEPS } from '../onboarding.constants';

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
  return (
    <div className={`onboarding-split-layout onboarding-split-layout--tmdb ${isTmdbGuideOpen ? 'is-guided' : ''}`}>
      <OnboardingPanelCard
        className={`tmdb-guide-panel ${isTmdbGuideOpen ? 'is-guided' : ''}`}
        eyebrow="Step 3"
        title={isTmdbGuideOpen ? activeTmdbGuideStep.title : 'Activate TMDB access to continue'}
        meta={(
          <div className="welcome-lang-pill">
            {isTmdbGuideOpen ? `${tmdbGuideStep + 1} / ${TMDB_GUIDE_STEPS.length}` : 'Required one-time setup'}
          </div>
        )}
        description={isTmdbGuideOpen
          ? activeTmdbGuideStep.description
          : 'RENDA needs TMDB before scanning can do real metadata matching, artwork lookups, and clean organization.'}
        footerLabel={isTmdbGuideOpen ? activeTmdbGuideStep.eyebrow : 'Why this is required'}
        footerValue={isTmdbGuideOpen ? 'Guided mode active' : 'Without TMDB, scanning stays limited to technical file data only.'}
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
                  <strong>Required to continue</strong>
                  <p>This is the activation step that unlocks real title matching, posters, backdrops, and cast data.</p>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-icon"><Key size={18} /></span>
                <div>
                  <strong>Only needs to be done once</strong>
                  <p>You need both the TMDB API Key (v3) and the Read Access Token (v4), then RENDA remembers them.</p>
                </div>
              </div>
            </div>

            <div className="tmdb-guide-intro-actions">
              <Button variant="primary" onClick={openTmdbGuide}>
                Show me where to get it
              </Button>
              <Button variant="secondary" onClick={() => openGuideLink('https://www.themoviedb.org/settings/api')}>
                Open TMDB API page
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
                  <span className="tmdb-guide-browser-url">{activeTmdbGuideStep.browserLabel}</span>
                  <span className="tmdb-guide-browser-chip">{activeTmdbGuideStep.browserAccent}</span>
                </div>
                <div className="tmdb-guide-browser-body">
                  <div className="tmdb-guide-browser-sidebar">
                    <span className="is-strong" />
                    <span />
                    <span />
                  </div>
                  <div className="tmdb-guide-browser-focus">
                    <strong>{activeTmdbGuideStep.eyebrow}</strong>
                    <p>{activeTmdbGuideStep.detail}</p>
                    <div className="tmdb-guide-browser-lines">
                      {activeTmdbGuideStep.lines.map((line) => (
                        <div key={line} className="tmdb-guide-browser-line">
                          <span className="tmdb-guide-browser-line-dot" />
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="tmdb-guide-stage-copy">
              <span className="tmdb-guide-stage-kicker">{activeTmdbGuideStep.eyebrow}</span>
              <p>{activeTmdbGuideStep.detail}</p>
            </div>

            {activeTmdbGuideStep.supportTitle ? (
              <div className="tmdb-guide-support">
                <strong>{activeTmdbGuideStep.supportTitle}</strong>
                <div className="tmdb-guide-support-list">
                  {activeTmdbGuideStep.supportItems?.map((item) => (
                    <div key={item} className="tmdb-guide-support-item">
                      <span className="tmdb-guide-support-dot" />
                      <span>{item}</span>
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
                  {tmdbGuideStep === 0 ? 'Close guide' : 'Back'}
                </Button>
                {activeTmdbGuideStep.actionHref ? (
                  <Button
                    variant="secondary"
                    onClick={() => openGuideLink(activeTmdbGuideStep.actionHref)}
                  >
                    {activeTmdbGuideStep.actionLabel}
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
                {tmdbGuideStep === TMDB_GUIDE_STEPS.length - 1 ? 'Back to form' : 'Ready'}
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
          meta={<div className="welcome-lang-pill">2 fields required</div>}
          description="Both values are required before RENDA can move past this step."
          footerLabel="This step blocks the next one"
          footerValue="Validate both keys to continue onboarding"
        >
          <div className="onboarding-form-group">
            <label>TMDB API Key (v3)</label>
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
            <label>TMDB Read Access Token (v4)</label>
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
