import React from 'react';
import NavButton from '@/ui/NavButton';
import { ArrowRight } from 'lucide-react';
import './OnboardingWizard.css';

import useOnboardingState from './hooks/useOnboardingState';
import WelcomeStep from './steps/WelcomeStep';
import ChoiceStep from './steps/ChoiceStep';
import TmdbStep from './steps/TmdbStep';
import OmdbStep from './steps/OmdbStep';
import FolderStep from './steps/FolderStep';
import CompletionStep from './steps/CompletionStep';

export default function OnboardingWizard() {
  const {
    locale,
    setLocale,
    step,
    stepDirection,
    configChoice,
    setConfigChoice,
    isImporting,
    handleFileImport,
    langSearch,
    setLangSearch,
    AVAILABLE_LANGUAGES,
    filteredLanguages,
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
    omdbApiKey,
    setOmdbApiKey,
    omdbValidation,
    validateOmdb,
    isOmdbGuideOpen,
    openOmdbGuide,
    closeOmdbGuide,
    omdbGuideStep,
    goToOmdbGuideStep,
    omdbGuideDirection,
    activeOmdbGuideStep,
    scanDir,
    setScanDir,
    pickScanDir,
    libraryPath,
    setLibraryPath,
    pickLibraryPath,
    validateDirs,
    isValidatingFolders,
    folderValidation,
    isFinishing,
    handleFinish,
    handlePrev,
    handleNext,
    isAnyGuideOpen,
  } = useOnboardingState();

  return (
    <div className="onboarding-wizard">
      <div className="onboarding-container">
        
        {/* Header */}
        <div className="onboarding-header">
          <div className={`onboarding-title-group ${isAnyGuideOpen ? 'is-hidden' : ''}`}>
            <h1>RENDA</h1>
          </div>
          <div className={`onboarding-timeline ${isAnyGuideOpen ? 'is-hidden' : ''}`}>
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <div key={num} className={`timeline-dot-wrapper ${num <= step ? 'is-active' : ''} ${num === step ? 'is-current' : ''}`}>
                <div className="timeline-dot" />
                {num < 6 && <div className="timeline-line" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content Panel */}
        <div className="onboarding-content">
          <div key={step} className={`step-transition step-transition--${stepDirection}`}>
            
            {/* Step 1: Welcome & Lang */}
            {step === 1 && (
              <WelcomeStep
                locale={locale}
                setLocale={setLocale}
                filteredLanguages={filteredLanguages}
                langSearch={langSearch}
                setLangSearch={setLangSearch}
                availableLanguages={AVAILABLE_LANGUAGES}
              />
            )}

            {/* Step 2: Config Choice */}
            {step === 2 && (
              <ChoiceStep
                configChoice={configChoice}
                setConfigChoice={setConfigChoice}
                isImporting={isImporting}
                handleFileImport={handleFileImport}
              />
            )}

            {/* Step 3: TMDB API Setup */}
            {step === 3 && (
              <TmdbStep
                tmdbApiKey={tmdbApiKey}
                setTmdbApiKey={setTmdbApiKey}
                tmdbBearerToken={tmdbBearerToken}
                setTmdbBearerToken={setTmdbBearerToken}
                tmdbValidation={tmdbValidation}
                validateTmdb={validateTmdb}
                isValidatingApi={isValidatingApi}
                isTmdbGuideOpen={isTmdbGuideOpen}
                openTmdbGuide={openTmdbGuide}
                closeTmdbGuide={closeTmdbGuide}
                tmdbGuideStep={tmdbGuideStep}
                goToTmdbGuideStep={goToTmdbGuideStep}
                tmdbGuideDirection={tmdbGuideDirection}
                activeTmdbGuideStep={activeTmdbGuideStep}
                openGuideLink={openGuideLink}
                step={step}
              />
            )}

            {/* Step 4: OMDB API Setup */}
            {step === 4 && (
              <OmdbStep
                omdbApiKey={omdbApiKey}
                setOmdbApiKey={setOmdbApiKey}
                omdbValidation={omdbValidation}
                validateOmdb={validateOmdb}
                isValidatingApi={isValidatingApi}
                isOmdbGuideOpen={isOmdbGuideOpen}
                openOmdbGuide={openOmdbGuide}
                closeOmdbGuide={closeOmdbGuide}
                omdbGuideStep={omdbGuideStep}
                goToOmdbGuideStep={goToOmdbGuideStep}
                omdbGuideDirection={omdbGuideDirection}
                activeOmdbGuideStep={activeOmdbGuideStep}
                openGuideLink={openGuideLink}
                step={step}
              />
            )}

            {/* Step 5: Folders Setup */}
            {step === 5 && (
              <FolderStep
                scanDir={scanDir}
                setScanDir={setScanDir}
                pickScanDir={pickScanDir}
                libraryPath={libraryPath}
                setLibraryPath={setLibraryPath}
                pickLibraryPath={pickLibraryPath}
                validateDirs={validateDirs}
                isValidatingFolders={isValidatingFolders}
                folderValidation={folderValidation}
              />
            )}

            {/* Step 6: Completion */}
            {step === 6 && <CompletionStep />}

          </div>
        </div>

        {/* Footer */}
        <div className={`onboarding-footer ${isAnyGuideOpen ? 'onboarding-footer--guided-actions' : ''}`}>
          {isAnyGuideOpen ? (
            <>
              <div />
              <div className="onboarding-footer-actions-cluster">
                <NavButton className="ui-nav-button--onboarding-back" onClick={handlePrev}>
                  Back
                </NavButton>
                <NavButton 
                  className="ui-nav-button--onboarding-continue"
                  icon={ArrowRight}
                  iconPosition="right"
                  onClick={handleNext}
                >
                  Continue
                </NavButton>
              </div>
            </>
          ) : (
            <>
              {step > 1 && step < 6 ? (
                <NavButton className="ui-nav-button--onboarding-back" onClick={handlePrev}>
                  Back
                </NavButton>
              ) : (
                <div />
              )}

              {step < 5 ? (
                <NavButton 
                  className="ui-nav-button--onboarding-continue"
                  icon={ArrowRight}
                  iconPosition="right"
                  onClick={handleNext}
                  disabled={
                    (step === 2 && configChoice === 'import') ||
                    (step === 3 && tmdbValidation.valid !== true) ||
                    (step === 4 && omdbValidation.valid !== true)
                  }
                >
                  Continue
                </NavButton>
              ) : step === 5 ? (
                <NavButton 
                  className="ui-nav-button--onboarding-continue"
                  icon={ArrowRight}
                  iconPosition="right"
                  onClick={handleNext}
                  disabled={folderValidation.valid !== true}
                >
                  Continue
                </NavButton>
              ) : (
                <NavButton 
                  className="ui-nav-button--onboarding-continue"
                  icon={null}
                  onClick={handleFinish}
                  disabled={isFinishing}
                >
                  {isFinishing ? 'Saving...' : 'Finish Setup'}
                </NavButton>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
