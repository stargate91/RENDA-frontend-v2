import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/providers/LanguageProvider';
import { useUi } from '@/providers/UiProvider';
import { selectFolder } from '@/lib/ipc';
import api from '@/lib/api';
import { buildSettingsPayload } from '@/lib/api/settings';
import { validateImportedSettings } from '@/lib/validation';
import Button from '@/ui/Button';
import Checkbox from '@/ui/Checkbox';
import NavButton from '@/ui/NavButton';
import Spinner from '@/ui/Spinner';
import { Globe, ArrowRight, ArrowLeft, Key, FolderOpen, CheckCircle, FileJson, Cpu, Languages, SlidersHorizontal, Search, Check } from 'lucide-react';
import { TARGET_LANGUAGE_OPTIONS } from '@/pages/settings/settingsLanguageOptions';
import OnboardingInfoCard from './OnboardingInfoCard';
import OnboardingOrbitHero from './OnboardingOrbitHero';
import OnboardingPanelCard from './OnboardingPanelCard';
import { getInitialFormValues } from '../settings/settingsFormValues';
import './OnboardingWizard.css';

const TMDB_GUIDE_STEPS = [
  {
    eyebrow: 'Account first',
    title: 'Open TMDB and get into your account',
    description: 'Start at TMDB, then create an account or sign in before you try to access the API area.',
    detail: 'If you are brand new, the flow is: Join TMDB, fill the sign-up form, confirm the email, then log in.',
    actionLabel: 'Open TMDB',
    actionHref: 'https://www.themoviedb.org/',
    browserLabel: 'Join TMDB / Login',
    browserAccent: 'Start',
    lines: ['Open TMDB', 'Sign up or log in', 'Activate the account email if needed'],
    supportTitle: 'Exact path if you do not have an account yet',
    supportItems: [
      'Open the Join TMDB page from the website.',
      'Fill username, password, confirm password, and an existing email address.',
      'Click Sign Up, then open the email from TMDB.',
      'Click Activate My Account in the email.',
      'When TMDB opens again, log in with your username and password.',
    ],
  },
  {
    eyebrow: 'Open API area',
    title: 'Go straight to the API section',
    description: 'You can use the direct TMDB API settings link, or reach it from your profile settings.',
    detail: 'The shortest route is the direct API link. If you navigate manually, open your profile picture menu, then Settings, then API.',
    actionLabel: 'Open API settings',
    actionHref: 'https://www.themoviedb.org/settings/api',
    browserLabel: 'Settings / API',
    browserAccent: 'API',
    lines: ['Use the direct API link', 'Or profile picture > Settings', 'Then choose API in the left menu'],
    supportTitle: 'Manual path inside TMDB',
    supportItems: [
      'Click your profile picture in the top bar.',
      'Open Settings.',
      'In the left menu, click API.',
    ],
  },
  {
    eyebrow: 'Request access',
    title: 'Start the personal API request',
    description: 'On the API page, begin the request flow and confirm that the key is only for your own personal use.',
    detail: 'This is the part where TMDB asks whether you want to generate a new API key and whether the usage is personal.',
    actionLabel: 'Open API settings',
    actionHref: 'https://www.themoviedb.org/settings/api',
    browserLabel: 'API request',
    browserAccent: 'Personal use',
    lines: ['Click generate new API key', 'Choose personal use only', 'Confirm the personal-use prompt'],
    supportTitle: 'What to click on this screen',
    supportItems: [
      'Click "To generate a new API key, click here".',
      'Choose "Yes This is for my own personal use only".',
      'Confirm again that it is for personal use.',
    ],
  },
  {
    eyebrow: 'Application form',
    title: 'Fill the TMDB application form',
    description: 'TMDB asks for a longer form here. The values do not need to be fancy, but the fields do need real-looking information.',
    detail: 'This is usually the most technical-looking step. A simple desktop-app explanation is enough as long as the form is filled out properly.',
    actionLabel: 'Stay on this step',
    actionHref: null,
    browserLabel: 'Application details',
    browserAccent: 'Subscribe',
    lines: ['Use a simple application name', 'Choose Desktop Application', 'Write a normal short summary'],
    supportTitle: 'Example values that usually work',
    supportItems: [
      'Application Name: application',
      'Application URL: https://amazingsite.com',
      'Type of Use: Desktop Application',
      'Application Summary: I want to use it to see beautiful movie and tv show posters.',
      'First Name / Last Name: your own real name',
      'Email / Phone / Address fields: fill them with normal-looking personal details',
      'Tick the final understanding checkbox, then click Subscribe',
    ],
  },
  {
    eyebrow: 'Copy credentials',
    title: 'Open the key details page and copy both values',
    description: 'After the form is accepted, open the key details page and copy the TMDB API Key and API Read Access Token.',
    detail: 'These are the two values RENDA needs on the right side. Copy both, paste both, then validate them here.',
    actionLabel: 'Open API settings',
    actionHref: 'https://www.themoviedb.org/settings/api',
    browserLabel: 'API key details',
    browserAccent: 'v3 + v4',
    lines: ['Open the API key details page', 'Copy API Key', 'Copy Read Access Token and paste both here'],
    supportTitle: 'Final exact action',
    supportItems: [
      'Open "access your API key details here".',
      'Copy the API Read Access Token.',
      'Copy the API Key.',
      'Paste both values into RENDA on the right, then validate them.',
    ],
  },
];

const OMDB_GUIDE_STEPS = [
  {
    eyebrow: 'Request the key',
    title: 'Open OMDb and request the free key by email',
    description: 'OMDb is the source RENDA uses for IMDb rating, Metascore, and Rotten Tomatoes ratings.',
    detail: 'Open the OMDb key page, choose the free email option, and submit your email address there.',
    actionLabel: 'Open OMDb key page',
    actionHref: 'https://www.omdbapi.com/apikey.aspx',
    browserLabel: 'omdbapi.com/apikey.aspx',
    browserAccent: 'Request',
    lines: ['Open the OMDb key page', 'Choose the free email option', 'Submit your email address'],
    supportTitle: 'What this unlocks in RENDA',
    supportItems: [
      'IMDb ratings',
      'Metascore values',
      'Rotten Tomatoes ratings',
    ],
  },
  {
    eyebrow: 'Activate and paste it',
    title: 'Open the email, activate the key, then paste it here',
    description: 'Once the email is activated, paste the OMDb API key into RENDA and validate it.',
    detail: 'Open the OMDb email, click the activation link first, then copy the key and paste it into RENDA.',
    actionLabel: 'Back to form',
    actionHref: null,
    browserLabel: 'Activation + key',
    browserAccent: 'Validated',
    lines: ['Open the OMDb email', 'Click the activation link first', 'Copy and paste the key into RENDA'],
    supportTitle: 'Important note',
    supportItems: [
      'If the email does not arrive, check spam or promotions.',
      'Do not paste the key before the activation link is opened.',
      'Ctrl+C the key from the email, then Ctrl+V it into RENDA.',
      'If validation fails, double-check that the activation link was opened first.',
    ],
  },
];

const getFlagUrl = (code) => {
  const mapping = {
    en: 'gb', hu: 'hu', de: 'de', fr: 'fr', es: 'es', it: 'it',
    zh: 'cn', ko: 'kr', ru: 'ru', ja: 'jp', pt: 'pt', pl: 'pl'
  };
  const country = mapping[code] || 'un';
  return `https://flagcdn.com/w40/${country}.png`;
};

export default function OnboardingWizard() {
  const { locale, setLocale, t } = useTranslation();
  const { toast } = useUi();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [stepDirection, setStepDirection] = useState('forward');
  const [configChoice, setConfigChoice] = useState('new'); // 'new' or 'import'
  const [isImporting, setIsImporting] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [isTmdbGuideOpen, setIsTmdbGuideOpen] = useState(false);
  const [tmdbGuideStep, setTmdbGuideStep] = useState(0);
  const [tmdbGuideDirection, setTmdbGuideDirection] = useState('forward');
  const [isOmdbGuideOpen, setIsOmdbGuideOpen] = useState(false);
  const [omdbGuideStep, setOmdbGuideStep] = useState(0);
  const [omdbGuideDirection, setOmdbGuideDirection] = useState('forward');

  const AVAILABLE_LANGUAGES = TARGET_LANGUAGE_OPTIONS.map(lang => {
    const nativeMatch = lang.label.match(/\(([^)]+)\)/);
    return {
      code: lang.value,
      name: nativeMatch ? nativeMatch[1] : lang.label,
      flagUrl: getFlagUrl(lang.value),
      active: lang.value === 'en'
    };
  });

  const filteredLanguages = AVAILABLE_LANGUAGES.filter(lang => 
    lang.name.toLowerCase().includes(langSearch.toLowerCase())
  );

  // API credentials state
  const [tmdbApiKey, setTmdbApiKey] = useState('');
  const [tmdbBearerToken, setTmdbBearerToken] = useState('');
  const [omdbApiKey, setOmdbApiKey] = useState('');

  // Validation states
  const [tmdbValidation, setTmdbValidation] = useState({ valid: null, message: '' });
  const [omdbValidation, setOmdbValidation] = useState({ valid: null, message: '' });
  const [isValidatingApi, setIsValidatingApi] = useState(false);

  // Folder paths state
  const [scanDir, setScanDir] = useState('');
  const [libraryPath, setLibraryPath] = useState('');
  const [folderValidation, setFolderValidation] = useState({ valid: null, message: '' });
  const [isValidatingFolders, setIsValidatingFolders] = useState(false);

  // Final completion state
  const [isFinishing, setIsFinishing] = useState(false);

  const goToStep = (nextStep, direction = 'forward') => {
    setStepDirection(direction);
    setStep(Math.max(1, Math.min(nextStep, 6)));
  };

  const handleNext = () => goToStep(step + 1, 'forward');
  const handlePrev = () => goToStep(step - 1, 'backward');
  const activeTmdbGuideStep = TMDB_GUIDE_STEPS[tmdbGuideStep];
  const activeOmdbGuideStep = OMDB_GUIDE_STEPS[omdbGuideStep];
  const isAnyGuideOpen = (step === 3 && isTmdbGuideOpen) || (step === 4 && isOmdbGuideOpen);

  const openTmdbGuide = () => {
    setTmdbGuideDirection('forward');
    setTmdbGuideStep(0);
    setIsTmdbGuideOpen(true);
  };

  const closeTmdbGuide = () => {
    setTmdbGuideDirection('backward');
    setIsTmdbGuideOpen(false);
    setTmdbGuideStep(0);
  };

  const goToTmdbGuideStep = (nextIndex, direction = 'forward') => {
    setTmdbGuideDirection(direction);
    setTmdbGuideStep(Math.max(0, Math.min(nextIndex, TMDB_GUIDE_STEPS.length - 1)));
  };

  const openGuideLink = (href) => {
    if (!href) return;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const openOmdbGuide = () => {
    setOmdbGuideDirection('forward');
    setOmdbGuideStep(0);
    setIsOmdbGuideOpen(true);
  };

  const closeOmdbGuide = () => {
    setOmdbGuideDirection('backward');
    setIsOmdbGuideOpen(false);
    setOmdbGuideStep(0);
  };

  const goToOmdbGuideStep = (nextIndex, direction = 'forward') => {
    setOmdbGuideDirection(direction);
    setOmdbGuideStep(Math.max(0, Math.min(nextIndex, OMDB_GUIDE_STEPS.length - 1)));
  };

  useEffect(() => {
    if (step !== 3 && isTmdbGuideOpen) {
      setIsTmdbGuideOpen(false);
      setTmdbGuideStep(0);
      setTmdbGuideDirection('forward');
    }
    if (step !== 4 && isOmdbGuideOpen) {
      setIsOmdbGuideOpen(false);
      setOmdbGuideStep(0);
      setOmdbGuideDirection('forward');
    }
  }, [isOmdbGuideOpen, isTmdbGuideOpen, step]);

  // Step 2: Handle config JSON import
  const handleFileImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        const reference = getInitialFormValues({});
        const { valid, settings } = validateImportedSettings(imported, reference);

        if (!valid || !settings) {
          throw new Error('Invalid structure or value types');
        }

        const normalizedSettings = buildSettingsPayload(getInitialFormValues(settings, t));

        await api.settings.import({
          ...normalizedSettings,
          onboarding_completed: true,
        });
        
        toast(t('settingsPage.sections.backup.importSuccess') || 'Settings imported successfully!', 'success');
        
        // Skip straight to completion/finish step
        goToStep(6, 'forward');
      } catch (err) {
        toast(t('settingsPage.sections.backup.importError') || 'Failed to import settings file.', 'danger');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  // Validate TMDB Credentials
  const validateTmdb = async () => {
    if (!tmdbApiKey.trim() || !tmdbBearerToken.trim()) {
      setTmdbValidation({
        valid: false,
        message: 'Both TMDB API Key (v3) and Read Access Token (v4) are required.'
      });
      return;
    }

    setIsValidatingApi(true);
    try {
      const response = await api.settings.validateApiKeys({
        tmdb_api_key: tmdbApiKey,
        tmdb_bearer_token: tmdbBearerToken,
      });

      if (response?.tmdb?.valid) {
        setTmdbValidation({ valid: true, message: response.tmdb.message });
        toast('TMDB credentials successfully verified.', 'success');
        setTimeout(() => {
          goToStep(4, 'forward');
        }, 800);
      } else {
        setTmdbValidation({ valid: false, message: response?.tmdb?.message || 'Verification failed.' });
        toast(response?.tmdb?.message || 'TMDB credentials verification failed.', 'danger');
      }
    } catch (err) {
      setTmdbValidation({ valid: false, message: 'Connection error during validation.' });
      toast('Failed to connect to validation server.', 'danger');
    } finally {
      setIsValidatingApi(false);
    }
  };

  // Validate OMDB Credentials
  const validateOmdb = async () => {
    if (!omdbApiKey.trim()) {
      setOmdbValidation({
        valid: false,
        message: 'OMDB API Key is required.'
      });
      return;
    }

    setIsValidatingApi(true);
    try {
      const response = await api.settings.validateApiKeys({
        omdb_api_key: omdbApiKey,
      });

      if (response?.omdb?.valid) {
        setOmdbValidation({ valid: true, message: response.omdb.message });
        toast('OMDB API Key successfully verified.', 'success');
        setTimeout(() => {
          goToStep(5, 'forward');
        }, 800);
      } else {
        setOmdbValidation({ valid: false, message: response?.omdb?.message || 'Verification failed.' });
        toast(response?.omdb?.message || 'OMDB verification failed.', 'danger');
      }
    } catch (err) {
      setOmdbValidation({ valid: false, message: 'Connection error during validation.' });
      toast('Failed to connect to validation server.', 'danger');
    } finally {
      setIsValidatingApi(false);
    }
  };

  // Pick Folders
  const pickScanDir = async () => {
    const path = await selectFolder(scanDir);
    if (path) setScanDir(path);
  };

  const pickLibraryPath = async () => {
    const path = await selectFolder(libraryPath);
    if (path) setLibraryPath(path);
  };

  // Validate Folders
  const validateDirs = async () => {
    if (!libraryPath.trim()) {
      setFolderValidation({ valid: false, message: 'Target library folder is required.' });
      return;
    }

    setIsValidatingFolders(true);
    try {
      const response = await api.settings.validateFolders({
        default_scan_dir: scanDir,
        folder_library_path: libraryPath,
        folder_move_to_library: true,
      });

      if (response.valid) {
        setFolderValidation({ valid: true, message: 'Folders validated and ready.' });
        toast('Folder configuration is valid.', 'success');
        setTimeout(() => {
          goToStep(6, 'forward');
        }, 800);
      } else {
        const firstErr = response.errors 
          ? (response.errors.scanFolder || response.errors.targetFolder)
          : response.code;
        setFolderValidation({ valid: false, message: firstErr || 'Validation failed.' });
        toast(firstErr || 'Folder validation failed.', 'danger');
      }
    } catch (err) {
      setFolderValidation({ valid: false, message: 'Folder validation failed.' });
    } finally {
      setIsValidatingFolders(false);
    }
  };

  // Final Save Settings & Onboard Complete
  const handleFinish = async () => {
    setIsFinishing(true);
    try {
      // Load current settings first to merge other values
      const currentSettings = await api.settings.get();
      
      const payload = {
        ...currentSettings,
        tmdb_api_key: tmdbApiKey,
        tmdb_bearer_token: tmdbBearerToken,
        omdb_api_key: omdbApiKey,
        default_scan_dir: scanDir,
        folder_library_path: libraryPath,
        folder_move_to_library: Boolean(libraryPath.trim()),
        onboarding_completed: true,
      };

      await api.settings.update(payload);
      toast('Onboarding completed! Welcome to RENDA.', 'success');
      
      // Navigate to dashboard
      navigate('/dashboard');
    } catch (err) {
      toast('Failed to save configuration settings.', 'danger');
    } finally {
      setIsFinishing(false);
    }
  };

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
                    <div className="welcome-lang-pill">{filteredLanguages.length} options</div>
                  )}
                  description="Select your interface language to begin setup."
                  footerLabel="Current selection"
                  footerValue={AVAILABLE_LANGUAGES.find((lang) => lang.code === locale)?.name || 'English'}
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
                      English is available now. More languages are staged next.
                    </div>

                    <div className="language-list-scroll">
                      {filteredLanguages.map((lang) => (
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
                          {!lang.active && <span className="lang-coming-soon">Soon</span>}
                        </div>
                      ))}
                    </div>
                </OnboardingPanelCard>
              </div>
            )}

            {/* Step 2: Config Choice */}
            {step === 2 && (
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
                    <div 
                      className={`onboarding-choice-card ${configChoice === 'new' ? 'is-selected' : ''}`}
                      onClick={() => setConfigChoice('new')}
                    >
                      <div className="choice-icon-wrapper">
                        <Cpu size={24} />
                      </div>
                      <h3>Configure New Setup</h3>
                      <p>Start fresh and guide yourself step-by-step through setting up TMDB, OMDB, and your media library folder paths.</p>
                    </div>

                    <div 
                      className={`onboarding-choice-card ${configChoice === 'import' ? 'is-selected' : ''}`}
                      onClick={() => setConfigChoice('import')}
                    >
                      <div className="choice-icon-wrapper">
                        <FileJson size={24} />
                      </div>
                      <h3>Import Backup Profile</h3>
                      <p>Load settings instantly from an existing RENDA settings JSON configuration backup file.</p>
                      
                      <div className={`onboarding-choice-action-slot ${configChoice === 'import' ? 'is-active' : ''}`}>
                        <div className="onboarding-dropzone" onClick={(e) => e.stopPropagation()}>
                          <label style={{ cursor: 'pointer' }}>
                            <p>{isImporting ? 'Importing settings...' : 'Click to Browse JSON'}</p>
                            <input 
                              type="file" 
                              accept=".json" 
                              style={{ display: 'none' }}
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
            )}

            {/* Step 3: TMDB API Setup */}
            {step === 3 && (
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
            )}

            {/* Step 4: OMDB API Setup */}
            {step === 4 && (
              <div className={`onboarding-split-layout onboarding-split-layout--tmdb ${isOmdbGuideOpen ? 'is-guided' : ''}`}>
                <OnboardingPanelCard
                  className={`tmdb-guide-panel ${isOmdbGuideOpen ? 'is-guided' : ''}`}
                  eyebrow="Step 4"
                  title={isOmdbGuideOpen ? activeOmdbGuideStep.title : 'Activate OMDb ratings to continue'}
                  meta={(
                    <div className="welcome-lang-pill">
                      {isOmdbGuideOpen ? `${omdbGuideStep + 1} / ${OMDB_GUIDE_STEPS.length}` : 'Required one-time setup'}
                    </div>
                  )}
                  description={isOmdbGuideOpen
                    ? activeOmdbGuideStep.description
                    : 'RENDA uses OMDb for IMDb, Metascore, and Rotten Tomatoes ratings during enrichment.'}
                  footerLabel={isOmdbGuideOpen ? activeOmdbGuideStep.eyebrow : 'Why this matters'}
                  footerValue={isOmdbGuideOpen ? 'Guided mode active' : 'Without this key, ratings data stays missing in your library.'}
                >
                  {!isOmdbGuideOpen ? (
                    <div className="tmdb-guide-intro">
                      <OnboardingOrbitHero
                        icon={Key}
                        className="tmdb-guide-hero"
                        chips={[
                          { label: 'OMDb' },
                          { label: 'IMDb' },
                          { label: 'Rotten Tomatoes' },
                        ]}
                      />

                      <div className="feature-list">
                        <div className="feature-item">
                          <span className="feature-icon"><CheckCircle size={18} /></span>
                          <div>
                            <strong>Required to continue</strong>
                            <p>This is the ratings step that adds IMDb, Metascore, and Rotten Tomatoes information.</p>
                          </div>
                        </div>
                        <div className="feature-item">
                          <span className="feature-icon"><Key size={18} /></span>
                          <div>
                            <strong>There is one tricky email step</strong>
                            <p>You must open the OMDb activation email before the key works correctly.</p>
                          </div>
                        </div>
                      </div>

                      <div className="tmdb-guide-intro-actions">
                        <Button variant="primary" onClick={openOmdbGuide}>
                          Show me how to get it
                        </Button>
                        <Button variant="secondary" onClick={() => openGuideLink('https://www.omdbapi.com/apikey.aspx')}>
                          Open OMDb key page
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
                            <span className="tmdb-guide-browser-url">{activeOmdbGuideStep.browserLabel}</span>
                            <span className="tmdb-guide-browser-chip">{activeOmdbGuideStep.browserAccent}</span>
                          </div>
                          <div className="tmdb-guide-browser-body">
                            <div className="tmdb-guide-browser-sidebar">
                              <span className="is-strong" />
                              <span />
                              <span />
                            </div>
                            <div className="tmdb-guide-browser-focus">
                              <strong>{activeOmdbGuideStep.eyebrow}</strong>
                              <p>{activeOmdbGuideStep.detail}</p>
                              <div className="tmdb-guide-browser-lines">
                                {activeOmdbGuideStep.lines.map((line) => (
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
                        <span className="tmdb-guide-stage-kicker">{activeOmdbGuideStep.eyebrow}</span>
                        <p>{activeOmdbGuideStep.detail}</p>
                      </div>

                      {activeOmdbGuideStep.supportTitle ? (
                        <div className="tmdb-guide-support">
                          <strong>{activeOmdbGuideStep.supportTitle}</strong>
                          <div className="tmdb-guide-support-list">
                            {activeOmdbGuideStep.supportItems?.map((item) => (
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
                            onClick={() => (omdbGuideStep === 0 ? closeOmdbGuide() : goToOmdbGuideStep(omdbGuideStep - 1, 'backward'))}
                          >
                            {omdbGuideStep === 0 ? 'Close guide' : 'Back'}
                          </Button>
                          {activeOmdbGuideStep.actionHref ? (
                            <Button
                              variant="secondary"
                              onClick={() => openGuideLink(activeOmdbGuideStep.actionHref)}
                            >
                              {activeOmdbGuideStep.actionLabel}
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
                          {omdbGuideStep === OMDB_GUIDE_STEPS.length - 1 ? 'Back to form' : 'Ready'}
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
                    meta={<div className="welcome-lang-pill">1 field required</div>}
                    description="This key is required before RENDA can enrich items with ratings data."
                    footerLabel="This step blocks the next one"
                    footerValue="Validate the OMDb key to continue onboarding"
                  >
                    <div className="onboarding-form-group">
                      <label>OMDb API Key</label>
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
            )}

            {/* Step 5: Folders Setup */}
            {step === 5 && (
              <div className="onboarding-split-layout">
                <OnboardingInfoCard
                  visual={(
                    <OnboardingOrbitHero
                      icon={FolderOpen}
                      chips={[
                        { label: 'Scan folder' },
                        { label: 'Library' },
                        { label: 'Organize' },
                      ]}
                    />
                  )}
                  kicker="Library paths"
                  title="Choose where RENDA should work."
                  description="Set the source folder RENDA watches and, if you want, the clean library destination it should build into."
                  items={[
                    {
                      icon: FolderOpen,
                      title: 'Step 5 of 6',
                      description: 'This tells RENDA where your unorganized files live and where finished media can go.',
                    },
                    {
                      icon: CheckCircle,
                      title: 'Validate before continuing',
                      description: 'RENDA checks the folders now so the first scan does not fail later.',
                    },
                  ]}
                />

                <OnboardingPanelCard
                  eyebrow="Step 5"
                  title="Set your library folders"
                  meta={<div className="welcome-lang-pill">Paths required</div>}
                  description="Pick the folders RENDA should read from and organize into."
                  footerLabel="Required to continue"
                  footerValue="Validate the folder setup first"
                >
                  <div className="onboarding-form-group">
                    <label>Scan Source Directory (Optional)</label>
                    <div className="onboarding-input-wrapper">
                      <input 
                        type="text" 
                        value={scanDir}
                        onChange={(e) => setScanDir(e.target.value)}
                        placeholder="Select source folder (optional)"
                      />
                      <Button variant="secondary" onClick={pickScanDir}>Browse</Button>
                    </div>
                  </div>
                  <div className="onboarding-form-group">
                    <label>Target Library Directory</label>
                    <div className="onboarding-input-wrapper">
                      <input 
                        type="text" 
                        value={libraryPath}
                        onChange={(e) => setLibraryPath(e.target.value)}
                        placeholder="Select target library folder"
                      />
                      <Button variant="secondary" onClick={pickLibraryPath}>Browse</Button>
                    </div>
                  </div>
                  <Button 
                    variant="secondary" 
                    onClick={validateDirs}
                    disabled={isValidatingFolders}
                  >
                    {isValidatingFolders ? 'Validating...' : 'Validate Folders'}
                  </Button>
                  {folderValidation.valid !== null && (
                    <div className={`onboarding-validation-status ${folderValidation.valid ? 'success' : 'error'}`}>
                      {folderValidation.message}
                    </div>
                  )}
                </OnboardingPanelCard>
              </div>
            )}

            {/* Step 6: Completion */}
            {step === 6 && (
              <div className="onboarding-completion-step">
                <div className="success-icon-animation">
                  <CheckCircle size={40} />
                </div>
                <h2>Setup Complete!</h2>
                <p>RENDA is now configured and ready to organize your media files. Click Finish to save and open your dashboard.</p>
              </div>
            )}

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
