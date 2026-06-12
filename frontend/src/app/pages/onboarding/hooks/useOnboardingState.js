import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/providers/LanguageProvider';
import { useUi } from '@/providers/UiProvider';
import { selectFolder } from '@/lib/ipc';
import api from '@/lib/api';
import { buildSettingsPayload } from '@/lib/api/settings';
import { validateImportedSettings } from '@/lib/validation';
import { getInitialFormValues } from '@/pages/settings/settingsFormValues';
import { TARGET_LANGUAGE_OPTIONS } from '@/pages/settings/settingsLanguageOptions';
import { TMDB_GUIDE_STEPS, OMDB_GUIDE_STEPS, getFlagUrl } from '../onboarding.constants';

export default function useOnboardingState() {
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

  return {
    locale,
    setLocale,
    t,
    step,
    goToStep,
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
  };
}
