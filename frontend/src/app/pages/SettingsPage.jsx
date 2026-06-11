import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, Sliders, Folder, Shuffle, Key, Database, Palette, Layers, Cpu, ChevronDown, ChevronRight, Minimize2, Settings2, FolderTree, KeyRound, Wrench } from 'lucide-react';
import Button from '@/ui/Button';
import Card from '@/ui/Card';
import Inline from '@/ui/Inline';
import Input from '@/ui/Input';
import Stack from '@/ui/Stack';
import Switch from '@/ui/Switch';
import Dropdown from '@/ui/Dropdown';
import IconButton from '@/ui/IconButton';
import { useSettingsQuery, useUpdateSettingsMutation, useClearDatabaseMutation, useValidateFoldersMutation } from '@/queries';
import { useUi } from '@/providers/UiProvider';
import { selectFile, selectFolder } from '@/lib/ipc';
import Spinner from '@/ui/Spinner';
import FloatingActionBar from '@/ui/FloatingActionBar';
import { useTranslation } from '@/providers/LanguageProvider';
import { validateJsonStructure } from '@/lib/validation';

const COLLISION_OPTIONS = [
  { value: 'keep_both', label: 'Keep Both' },
  { value: 'skip', label: 'Skip' },
  { value: 'replace_if_better', label: 'Replace If Better' },
  { value: 'replace', label: 'Replace Always' },
];

const EXTRA_ACTION_OPTIONS = [
  { value: 'rename', label: 'Rename' },
  { value: 'ignore', label: 'Skip' },
  { value: 'delete', label: 'Delete' },
];

const COLLECTION_MODE_OPTIONS = [
  { value: 'always', label: 'Always' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'complete_only', label: 'Complete Collection' },
];

const CASING_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'lower', label: 'Lower Case' },
  { value: 'upper', label: 'Upper Case' },
  { value: 'title', label: 'Title Case' },
];

const SEPARATOR_OPTIONS = [
  { value: 'space', label: 'Space' },
  { value: 'dot', label: 'Dot' },
  { value: 'dash', label: 'Dash' },
  { value: 'underscore', label: 'Underscore' },
];

const MOVIE_TAGS = ['{title}', '{original_title}', '{year}', '{release_date}', '{resolution}', '{edition}', '{collection}', '{source}', '{video_codec}', '{audio_codec}', '{audio_channels}', '{imdb_id}', '{tmdb_id}', '{rating_imdb}', '{custom}'];
const EPISODE_TAGS = ['{series_title}', '{series_original_title}', '{season}', '{episode}', '{episode_title}', '{resolution}', '{video_codec}', '{audio_codec}', '{audio_channels}', '{series_tmdb_id}', '{first_air_year}', '{custom}'];
const FOLDER_MOVIE_TAGS = ['{title}', '{original_title}', '{year}', '{release_date}', '{resolution}', '{edition}', '{collection}', '{source}', '{video_codec}', '{audio_codec}', '{audio_channels}', '{imdb_id}', '{tmdb_id}', '{rating_imdb}', '{custom}'];
const FOLDER_SHOW_TAGS = ['{series_title}', '{series_original_title}', '{year_range}', '{first_air_year}', '{first_air_date}', '{last_air_year}', '{last_air_date}', '{series_tmdb_id}', '{custom}'];
const FOLDER_SEASON_TAGS = ['{season}', '{season_name}', '{series_title}', '{custom}'];
const FOLDER_EPISODE_TAGS = ['{series_title}', '{series_original_title}', '{season}', '{episode}', '{episode_title}', '{resolution}', '{video_codec}', '{audio_codec}', '{audio_channels}', '{series_tmdb_id}', '{first_air_year}', '{custom}'];

const EXTRAS_FOLDER_MODE_OPTIONS = [
  { value: 'subfolder', label: 'Grouped in subfolder' },
  { value: 'flat', label: 'Flat (next to media)' },
];

const EXTRA_VIDEO_TAGS = ['{parent_name}', '{sub_category}', '{custom}'];
const EXTRA_SUB_TAGS = ['{parent_name}', '{language}', '{sub_category}', '{custom}'];
const EXTRA_AUDIO_TAGS = ['{parent_name}', '{language}', '{sub_category}', '{custom}'];
const EXTRA_IMG_TAGS = ['{parent_name}', '{sub_category}', '{custom}'];
const EXTRA_META_TAGS = ['{parent_name}', '{custom}'];

const generatePreview = (template, type, casing, separator, customTag, isFile = true, sortOptions = null) => {
  if (!template) return '';

  let context = {};
  let ext = isFile ? '.mp4' : '';
  if (type === 'movie') {
    context = {
      title: 'The Matrix',
      original_title: 'The Matrix',
      year: '1999',
      release_date: '1999-03-31',
      resolution: '1080p',
      edition: 'Ultimate Edition',
      collection: 'The Matrix Collection',
      source: 'BluRay',
      video_codec: 'h264',
      audio_codec: 'DTS-HD',
      audio_channels: '5.1',
      imdb_id: 'tt0133093',
      tmdb_id: '603',
      rating_imdb: '8.7',
      custom: customTag || 'custom'
    };
  } else if (type === 'show') {
    context = {
      series_title: 'Stranger Things',
      series_original_title: 'Stranger Things',
      year: '2016',
      first_air_year: '2016',
      first_air_date: '2016-07-15',
      last_air_year: '2022',
      last_air_date: '2022-07-01',
      year_range: '2016-2022',
      series_tmdb_id: '66732',
      custom: customTag || 'custom'
    };
  } else if (type === 'season') {
    context = {
      season: '01',
      season_name: 'Season 1',
      series_title: 'Stranger Things',
      custom: customTag || 'custom'
    };
  } else if (type === 'collection') {
    context = {
      collection: 'The Matrix Collection',
      custom: customTag || 'custom'
    };
  } else if (type === 'extraVideo') {
    ext = isFile ? '.mp4' : '';
    context = {
      parent_name: 'The Matrix (1999)',
      sub_category: 'trailer',
      custom: customTag || 'custom'
    };
  } else if (type === 'extraSub') {
    ext = isFile ? '.srt' : '';
    context = {
      parent_name: 'The Matrix (1999)',
      language: 'en',
      sub_category: 'forced',
      custom: customTag || 'custom'
    };
  } else if (type === 'extraAudio') {
    ext = isFile ? '.ac3' : '';
    context = {
      parent_name: 'The Matrix (1999)',
      language: 'en',
      sub_category: 'commentary',
      custom: customTag || 'custom'
    };
  } else if (type === 'extraImg') {
    ext = isFile ? '.jpg' : '';
    context = {
      parent_name: 'The Matrix (1999)',
      sub_category: 'poster',
      custom: customTag || 'custom'
    };
  } else if (type === 'extraMeta') {
    ext = isFile ? '.nfo' : '';
    context = {
      parent_name: 'The Matrix (1999)',
      custom: customTag || 'custom'
    };
  } else {
    context = {
      series_title: 'Stranger Things',
      series_original_title: 'Stranger Things',
      season: '01',
      episode: '03',
      episode_title: 'Holly, Jolly',
      resolution: '1080p',
      video_codec: 'h264',
      audio_codec: 'EAC3',
      audio_channels: '5.1',
      series_tmdb_id: '66732',
      first_air_year: '2016',
      custom: customTag || 'custom'
    };
  }

  let result = template.replace(/\{(\w+)\}/g, (match, p1) => {
    const key = p1.toLowerCase().replace(/_/g, '');
    const foundKey = Object.keys(context).find(k => k.toLowerCase().replace(/_/g, '') === key);
    return foundKey ? context[foundKey] : '';
  });

  result = result.replace(/\(\s*\)/g, '');
  result = result.replace(/\[\s*\]/g, '');
  result = result.replace(/\s*-\s*-\s*/g, ' - ');
  result = result.replace(/\s{2,}/g, ' ');
  result = result.replace(/\s*-\s*$/g, '');
  result = result.replace(/^\s*-\s*/g, '');

  result = result.replace(/[\\/:*?"<>|]/g, '').trim();

  if (casing === 'lower') {
    result = result.toLowerCase();
  } else if (casing === 'upper') {
    result = result.toUpperCase();
  } else if (casing === 'title') {
    result = result.replace(/\b[a-z]/gi, char => char.toUpperCase());
  }

  const sepMap = {
    space: ' ',
    dot: '.',
    dash: '-',
    underscore: '_'
  };
  const sep = sepMap[separator] || ' ';
  if (sep !== ' ') {
    result = result.replace(/\(/g, '').replace(/\)/g, '').replace(/\[/g, '').replace(/\]/g, '');
    result = result.replace(/\s-\s/g, ' ');
    result = result.replace(/\s+/g, ' ');
    result = result.replace(/\s/g, sep);
  }

  let finalResult = result;
  if (!isFile && result) {
    if (type === 'movie') {
      finalResult = `${result}/The Matrix (1999) 1080p.mp4`;
    } else if (type === 'show') {
      finalResult = `${result}/Season 01/Stranger Things - S01E03 - Holly, Jolly.mp4`;
    } else if (type === 'season') {
      finalResult = `${result}/Stranger Things - S01E03 - Holly, Jolly.mp4`;
    } else if (type === 'episode') {
      finalResult = `${result}/Stranger Things - S01E03 - Holly, Jolly.mp4`;
    }
  } else if (type === 'collection') {
    finalResult = result ? `${result}/The Matrix (1999).mp4` : '';
  } else {
    finalResult = result ? `${result}${ext}` : '';
  }

  if (sortOptions && sortOptions.enabled && (!isFile || type === 'collection') && finalResult) {
    const rootName = (type === 'movie' || type === 'collection')
      ? (sortOptions.moviesName || 'Movies')
      : (sortOptions.seriesName || 'TV Shows');
    finalResult = `${rootName}/${finalResult}`;
  }

  return finalResult;
};

const METADATA_LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (English)' },
  { value: 'hu-HU', label: 'Hungarian (Magyar)' },
  { value: 'de-DE', label: 'German (Deutsch)' },
  { value: 'fr-FR', label: 'French (Français)' },
  { value: 'es-ES', label: 'Spanish (Español)' },
  { value: 'it-IT', label: 'Italian (Italiano)' },
  { value: 'zh-CN', label: 'Chinese (中文)' },
  { value: 'ko-KR', label: 'Korean (한국어)' },
  { value: 'ru-RU', label: 'Russian (Русский)' },
  { value: 'ja-JP', label: 'Japanese (日本語)' },
  { value: 'pt-PT', label: 'Portuguese (Português)' },
  { value: 'pl-PL', label: 'Polish (Polski)' },
];

const TARGET_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (English)' },
  { value: 'hu', label: 'Hungarian (Magyar)' },
  { value: 'de', label: 'German (Deutsch)' },
  { value: 'fr', label: 'French (Français)' },
  { value: 'es', label: 'Spanish (Español)' },
  { value: 'it', label: 'Italian (Italiano)' },
  { value: 'zh', label: 'Chinese (中文)' },
  { value: 'ko', label: 'Korean (한국어)' },
  { value: 'ru', label: 'Russian (Русский)' },
  { value: 'ja', label: 'Japanese (日本語)' },
  { value: 'pt', label: 'Portuguese (Português)' },
  { value: 'pl', label: 'Polish (Polski)' },
];

const getInitialFormValues = (settingsData, t = null) => {
  if (!settingsData) return {};
  return {
    user_name: settingsData.user_name || '',
    default_scan_dir: settingsData.default_scan_dir || '',
    folder_library_path: settingsData.folder_library_path || '',
    collision_strategy: settingsData.collision_strategy || 'keep_both',
    collision_duration_tolerance_seconds: String(settingsData.collision_duration_tolerance_seconds || '10'),
    extras_video_action: settingsData.extras_video_action || 'rename',
    extras_sub_action: settingsData.extras_sub_action || 'rename',
    extras_audio_action: settingsData.extras_audio_action || 'rename',
    extras_img_action: settingsData.extras_img_action || 'rename',
    extras_meta_action: settingsData.extras_meta_action || 'rename',
    vlc_path: settingsData.vlc_path || '',
    mpc_path: settingsData.mpc_path || '',
    tmdb_api_key: settingsData.tmdb_api_key || '',
    tmdb_bearer_token: settingsData.tmdb_bearer_token || '',
    omdb_api_key: settingsData.omdb_api_key || '',
    ui_language: settingsData.ui_language || 'en',
    follow_app_language_for_media_library: settingsData.follow_app_language_for_media_library !== undefined ? settingsData.follow_app_language_for_media_library : true,
    follow_app_language_for_naming: settingsData.follow_app_language_for_naming !== undefined ? settingsData.follow_app_language_for_naming : true,
    primary_metadata_language: settingsData.primary_metadata_language || 'en-US',
    fallback_metadata_language: settingsData.fallback_metadata_language || 'en-US',
    default_target_language: settingsData.default_target_language || 'en',
    close_button_behavior: settingsData.close_button_behavior || 'ask',
    include_adult: settingsData.include_adult !== undefined ? settingsData.include_adult : false,
    auto_hydrate_inactive_people: settingsData.auto_hydrate_inactive_people !== undefined ? settingsData.auto_hydrate_inactive_people : false,
    custom_organization_enabled: settingsData.custom_organization_enabled !== undefined ? settingsData.custom_organization_enabled : false,
    organization_preset: settingsData.organization_preset || 'plex',
    ui_theme: settingsData.ui_theme || 'dark',
    min_video_size_mb: settingsData.min_video_size_mb !== undefined ? String(settingsData.min_video_size_mb) : '50',
    min_video_duration_minutes: settingsData.min_video_duration_minutes !== undefined ? String(settingsData.min_video_duration_minutes) : '12',
    folder_create_collection_dir: settingsData.folder_create_collection_dir !== false,
    folder_collection_mode: (settingsData.folder_create_collection_dir === false) ? 'never' : (settingsData.folder_collection_mode || 'threshold'),
    folder_collection_threshold: settingsData.folder_collection_threshold !== undefined ? String(settingsData.folder_collection_threshold) : '3',
    naming_filename_casing: settingsData.naming_filename_casing || 'default',
    naming_word_separator: settingsData.naming_word_separator || 'space',
    naming_movie_template: settingsData.naming_movie_template || '{title} ({year}) {resolution}',
    naming_episode_template: settingsData.naming_episode_template || '{series_title} - S{season}E{episode} - {episode_title}',
    naming_custom_tag: settingsData.naming_custom_tag || 'default',
    naming_video_exts: settingsData.naming_video_exts || '.mkv, .mp4, .avi, .m4v, .mov, .wmv, .mpg, .mpeg',
    folder_organization_enabled: settingsData.folder_organization_enabled !== false,
    folder_move_to_library: settingsData.folder_move_to_library !== false,
    folder_sort_by_type: settingsData.folder_sort_by_type !== false,
    folder_movies_name: settingsData.folder_movies_name || (t ? t('settingsPage.sections.folderStructure.defaultMoviesName') : 'Movies'),
    folder_series_name: settingsData.folder_series_name || (t ? t('settingsPage.sections.folderStructure.defaultSeriesName') : 'TV Shows'),
    folder_adult_name: settingsData.folder_adult_name || (t ? t('settingsPage.sections.folderStructure.defaultAdultName') : 'Adult'),
    folder_create_movie_subdir: settingsData.folder_create_movie_subdir !== false,
    folder_movie_template: settingsData.folder_movie_template || '{title} ({year})',
    folder_create_show_dir: settingsData.folder_create_show_dir !== false,
    folder_show_template: settingsData.folder_show_template || '{series_title} ({year})',
    folder_create_season_dir: settingsData.folder_create_season_dir !== false,
    folder_season_template: settingsData.folder_season_template || 'Season {season}',
    folder_create_episode_dir: settingsData.folder_create_episode_dir !== undefined ? settingsData.folder_create_episode_dir : false,
    folder_episode_template: settingsData.folder_episode_template || '{series_title} - {season}{episode}',
    folder_remove_empty: settingsData.folder_remove_empty !== false,
    folder_collection_template: settingsData.folder_collection_template || '{collection}',
    extras_enabled: settingsData.extras_enabled !== false,
    extras_sub_exts: settingsData.extras_sub_exts || '.srt, .sub, .ass, .ssa, .vtt',
    extras_audio_exts: settingsData.extras_audio_exts || '.mka, .ac3, .dts, .mp3, .flac, .wav, .m4a',
    extras_img_exts: settingsData.extras_img_exts || '.jpg, .jpeg, .png, .gif, .bmp, .webp',
    extras_meta_exts: settingsData.extras_meta_exts || '.nfo, .xml, .txt',
    extras_video_template: settingsData.extras_video_template || '{parent_name}-{sub_category}',
    extras_sub_template: settingsData.extras_sub_template || '{parent_name}.{language}',
    extras_audio_template: settingsData.extras_audio_template || '{parent_name}.{language}',
    extras_img_template: settingsData.extras_img_template || '{sub_category}',
    extras_meta_template: settingsData.extras_meta_template || '{parent_name}',
    extras_folder_mode: settingsData.extras_folder_mode || 'subfolder',
    extras_subfolder_name: settingsData.extras_subfolder_name || (t ? t('settingsPage.sections.extras.defaultSubfolderName') : 'Extras'),
  };
};

const PRESETS_CONFIG = {
  plex: {
    naming_filename_casing: 'default',
    naming_word_separator: 'space',
    naming_movie_template: '{title} ({year}) {resolution}',
    naming_episode_template: '{series_title} - S{season}E{episode} - {episode_title}',
    folder_create_movie_subdir: true,
    folder_movie_template: '{title} ({year})',
    folder_create_show_dir: true,
    folder_show_template: '{series_title} ({year})',
    folder_create_season_dir: true,
    folder_season_template: 'Season {season}',
    folder_create_episode_dir: false,
    folder_episode_template: '{series_title} - {season}{episode}',
    folder_create_collection_dir: true,
    folder_collection_mode: 'threshold',
    extras_folder_mode: 'subfolder',
    extras_subfolder_name: 'Extras',
  },
  jellyfin: {
    naming_filename_casing: 'default',
    naming_word_separator: 'space',
    naming_movie_template: '{title} ({year}) {resolution}',
    naming_episode_template: '{series_title} - S{season}E{episode} - {episode_title}',
    folder_create_movie_subdir: true,
    folder_movie_template: '{title} ({year})',
    folder_create_show_dir: true,
    folder_show_template: '{series_title} ({year})',
    folder_create_season_dir: true,
    folder_season_template: 'Season {season}',
    folder_create_episode_dir: false,
    folder_episode_template: '{series_title} - {season}{episode}',
    folder_create_collection_dir: true,
    folder_collection_mode: 'threshold',
    extras_folder_mode: 'flat',
    extras_subfolder_name: 'Extras',
  },
  kodi: {
    naming_filename_casing: 'default',
    naming_word_separator: 'dot',
    naming_movie_template: '{title} ({year}) {resolution}',
    naming_episode_template: '{series_title} - S{season}E{episode} - {episode_title}',
    folder_create_movie_subdir: true,
    folder_movie_template: '{title} ({year})',
    folder_create_show_dir: true,
    folder_show_template: '{series_title} ({year})',
    folder_create_season_dir: true,
    folder_season_template: 'Season {season}',
    folder_create_episode_dir: false,
    folder_episode_template: '{series_title} - {season}{episode}',
    folder_create_collection_dir: true,
    folder_collection_mode: 'threshold',
    extras_folder_mode: 'flat',
    extras_subfolder_name: 'Extras',
  },
  minimal: {
    naming_filename_casing: 'default',
    naming_word_separator: 'space',
    naming_movie_template: '{title} ({year})',
    naming_episode_template: '{series_title} S{season}E{episode}',
    folder_create_movie_subdir: false,
    folder_movie_template: '{title} ({year})',
    folder_create_show_dir: true,
    folder_show_template: '{series_title}',
    folder_create_season_dir: false,
    folder_season_template: 'Season {season}',
    folder_create_episode_dir: false,
    folder_episode_template: '{series_title} - {season}{episode}',
    folder_create_collection_dir: false,
    folder_collection_mode: 'never',
    extras_folder_mode: 'flat',
    extras_subfolder_name: 'Extras',
  }
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const settingsQuery = useSettingsQuery();
  const settings = settingsQuery.data;
  const { toast, openModal, closeModal } = useUi();

  const movieInputRef = useRef(null);
  const episodeInputRef = useRef(null);
  const folderMovieInputRef = useRef(null);
  const folderShowInputRef = useRef(null);
  const folderSeasonInputRef = useRef(null);
  const folderEpisodeInputRef = useRef(null);
  const extraVideoInputRef = useRef(null);
  const extraSubInputRef = useRef(null);
  const extraAudioInputRef = useRef(null);
  const extraImgInputRef = useRef(null);
  const extraMetaInputRef = useRef(null);
  const folderCollectionInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const insertTag = (fieldKey, inputRef, tag) => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const val = form[fieldKey] || '';
    const newVal = val.substring(0, start) + tag + val.substring(end);
    setForm(prev => ({ ...prev, [fieldKey]: newVal }));

    setTimeout(() => {
      input.focus();
      const newPos = start + tag.length;
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };
  const [activeTab, setActiveTab] = useState('general');
  const [isOrgExpanded, setIsOrgExpanded] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const updateSettingsMutation = useUpdateSettingsMutation();
  const clearDbMutation = useClearDatabaseMutation();
  const [validationErrors, setValidationErrors] = useState({});
  const validateFoldersMutation = useValidateFoldersMutation();

  const validateFolders = async (scanDir, libraryPath, moveToLibrary) => {
    try {
      const res = await validateFoldersMutation.mutateAsync({
        default_scan_dir: scanDir,
        folder_library_path: libraryPath,
        folder_move_to_library: moveToLibrary,
      });
      return {
        valid: res.valid,
        message: res.message
      };
    } catch (err) {
      return {
        valid: false,
        message: "Failed to connect to backend folder validation service."
      };
    }
  };

  const handleValidateFolders = async (currentFormState) => {
    const res = await validateFolders(
      currentFormState.default_scan_dir,
      currentFormState.folder_library_path,
      currentFormState.folder_move_to_library
    );
    if (!res.valid) {
      if (res.errors) {
        const scanErrorKey = res.errors.scanFolder;
        const targetErrorKey = res.errors.targetFolder;
        
        const scanErr = scanErrorKey ? (t(`settingsPage.validation.${scanErrorKey}`) || scanErrorKey) : null;
        const targetErr = targetErrorKey ? (t(`settingsPage.validation.${targetErrorKey}`) || targetErrorKey) : null;
        
        setValidationErrors((prev) => ({
          ...prev,
          scanFolder: scanErr,
          targetFolder: targetErr,
          folders: scanErr || targetErr
        }));
      } else {
        const isScanError = res.message && (res.message.includes("scanDir") || res.message.includes("Scan Folder"));
        const isTargetError = res.message && (res.message.includes("libraryDir") || res.message.includes("Target Library Folder") || res.message.includes("foldersCannotBeSame") || res.message.includes("cannot be the same"));
        
        const localizedError = t(`settingsPage.validation.${res.message}`) || res.message;
        
        setValidationErrors((prev) => ({
          ...prev,
          scanFolder: isScanError ? localizedError : null,
          targetFolder: isTargetError ? localizedError : null,
          folders: localizedError
        }));
      }
      setActiveTab('general');
    } else {
      setValidationErrors((prev) => ({
        ...prev,
        scanFolder: null,
        targetFolder: null,
        folders: null
      }));
    }
    return res;
  };

  const appLanguageOptions = useMemo(() => [
    { value: 'en', label: t('languages.en') || 'English (English)' },
  ], [t]);

  const metadataLanguageOptions = useMemo(() =>
    METADATA_LANGUAGE_OPTIONS.map((o) => ({
      value: o.value,
      label: t(`languages.${o.value}`) || o.label,
    })),
    [t]
  );

  const targetLanguageOptions = useMemo(() =>
    TARGET_LANGUAGE_OPTIONS.map((o) => ({
      value: o.value,
      label: t(`languages.${o.value}`) || o.label,
    })),
    [t]
  );

  const closeBehaviorOptions = useMemo(() => [
    { value: 'ask', label: t('settingsPage.sections.closeBehavior.options.ask') },
    { value: 'tray', label: t('settingsPage.sections.closeBehavior.options.tray') },
    { value: 'quit', label: t('settingsPage.sections.closeBehavior.options.quit') },
  ], [t]);

  const collisionOptions = useMemo(() =>
    COLLISION_OPTIONS.map((o) => ({
      value: o.value,
      label: t(`settingsPage.sections.rules.collisionOptions.${o.value}`) || o.label,
    })),
    [t]
  );

  const extraActionOptions = useMemo(() =>
    EXTRA_ACTION_OPTIONS.map((o) => ({
      value: o.value,
      label: t(`settingsPage.sections.extras.actionOptions.${o.value}`) || o.label,
    })),
    [t]
  );

  const themeOptions = useMemo(() => [
    { value: 'dark', label: t('settingsPage.sections.theme.options.dark') },
  ], [t]);

  const collectionModeOptions = useMemo(() =>
    COLLECTION_MODE_OPTIONS.map((o) => ({
      value: o.value,
      label: t(`settingsPage.sections.collections.collectionModeOptions.${o.value}`) || o.label,
    })),
    [t]
  );

  const extrasFolderModeOptions = useMemo(() =>
    EXTRAS_FOLDER_MODE_OPTIONS.map((o) => ({
      value: o.value,
      label: t(`settingsPage.sections.extras.folderModeOptions.${o.value}`) || o.label,
    })),
    [t]
  );

  const casingOptions = useMemo(() =>
    CASING_OPTIONS.map((o) => ({
      value: o.value,
      label: t(`settingsPage.sections.fileNaming.casingOptions.${o.value}`) || o.label,
    })),
    [t]
  );

  const separatorOptions = useMemo(() =>
    SEPARATOR_OPTIONS.map((o) => ({
      value: o.value,
      label: t(`settingsPage.sections.fileNaming.separatorOptions.${o.value}`) || o.label,
    })),
    [t]
  );

  const presetCards = useMemo(() => [
    {
      value: 'plex',
      label: t('settingsPage.sections.organization.presets.plex') || 'Plex Standard',
      desc: t('settingsPage.sections.organization.presets.plexDesc') || 'Structured library with standard naming conventions, dedicated folders, and subtitles grouped under Extras/.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M5.25 2H10.75L18.75 12L10.75 22H5.25L13.25 12L5.25 2Z" fill="#E5A93B" />
        </svg>
      )
    },
    {
      value: 'jellyfin',
      label: t('settingsPage.sections.organization.presets.jellyfin') || 'Jellyfin Standard',
      desc: t('settingsPage.sections.organization.presets.jellyfinDesc') || 'Optimized for Jellyfin. Similar to Plex, but keeps subtitle and media extra files flat next to your movie/episode files.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 4C14.76 4 17.14 5.37 18.57 7.43L12 11.5L5.43 7.43C6.86 5.37 9.24 4 12 4ZM5.07 9.47L11 13.18V20C7.38 19.54 4.54 16.7 4.08 13.08C3.93 11.83 4.29 10.57 5.07 9.47ZM13 20V13.18L18.93 9.47C19.71 10.57 20.07 11.83 19.92 13.08C19.46 16.7 16.62 19.54 13 20Z" fill="url(#jellyfin-gradient)" />
          <defs>
            <linearGradient id="jellyfin-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00A4DC" />
              <stop offset="1" stopColor="#AA5CC3" />
            </linearGradient>
          </defs>
        </svg>
      )
    },
    {
      value: 'kodi',
      label: t('settingsPage.sections.organization.presets.kodi') || 'Kodi Standard',
      desc: t('settingsPage.sections.organization.presets.kodiDesc') || 'Optimized for Kodi. Uses dot separators in filenames (e.g. The.Matrix.1999) and keeps extra files flat next to media.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M12 2L2 12L12 22L22 12L12 2Z" fill="#17B2E5" />
          <path d="M12 6L6 12L12 18L18 12L12 6Z" fill="#118cb5" />
          <rect x="11.25" y="11.25" width="1.5" height="1.5" fill="#FFFFFF" />
        </svg>
      )
    },
    {
      value: 'minimal',
      label: t('settingsPage.sections.organization.presets.minimal') || 'Minimalist Layout',
      desc: t('settingsPage.sections.organization.presets.minimalDesc') || 'A bare-minimum structure. Renames files directly next to each other in root directories without nested season or movie folders.',
      icon: <Minimize2 size={20} color="#10B981" style={{ flexShrink: 0 }} />
    }
  ], [t]);

  const isInitializedRef = useRef(false);

  const [form, setForm] = useState({
    user_name: '',
    default_scan_dir: '',
    folder_library_path: '',
    collision_strategy: 'keep_both',
    collision_duration_tolerance_seconds: '10',
    extras_video_action: 'rename',
    extras_sub_action: 'rename',
    extras_audio_action: 'rename',
    extras_img_action: 'rename',
    extras_meta_action: 'rename',
    vlc_path: '',
    mpc_path: '',
    tmdb_api_key: '',
    tmdb_bearer_token: '',
    omdb_api_key: '',
    ui_language: 'en',
    follow_app_language_for_media_library: true,
    follow_app_language_for_naming: true,
    primary_metadata_language: 'en-US',
    fallback_metadata_language: 'en-US',
    default_target_language: 'en',
    close_button_behavior: 'ask',
    include_adult: false,
    auto_hydrate_inactive_people: false,
    custom_organization_enabled: false,
    organization_preset: 'plex',
    ui_theme: 'dark',
    min_video_size_mb: '50',
    min_video_duration_minutes: '12',
    folder_create_collection_dir: true,
    folder_collection_mode: 'threshold',
    folder_collection_threshold: '3',
    naming_filename_casing: 'default',
    naming_word_separator: 'space',
    naming_movie_template: '{title} ({year}) {resolution}',
    naming_episode_template: '{series_title} - S{season}E{episode} - {episode_title}',
    naming_custom_tag: 'default',
    naming_video_exts: '.mkv, .mp4, .avi, .m4v, .mov, .wmv, .mpg, .mpeg',
    folder_organization_enabled: true,
    folder_move_to_library: true,
    folder_sort_by_type: true,
    folder_movies_name: 'Movies',
    folder_series_name: 'TV Shows',
    folder_adult_name: 'Adult',
    folder_create_movie_subdir: true,
    folder_movie_template: '{title} ({year})',
    folder_create_show_dir: true,
    folder_show_template: '{series_title} ({year})',
    folder_create_season_dir: true,
    folder_season_template: 'Season {season}',
    folder_create_episode_dir: false,
    folder_episode_template: '{series_title} - {season}{episode}',
    folder_remove_empty: true,
    folder_collection_template: '{collection}',
    extras_enabled: true,
    extras_sub_exts: '.srt, .sub, .ass, .ssa, .vtt',
    extras_audio_exts: '.mka, .ac3, .dts, .mp3, .flac, .wav, .m4a',
    extras_img_exts: '.jpg, .jpeg, .png, .gif, .bmp, .webp',
    extras_meta_exts: '.nfo, .xml, .txt',
    extras_video_template: '{parent_name}-{sub_category}',
    extras_sub_template: '{parent_name}.{language}',
    extras_audio_template: '{parent_name}.{language}',
    extras_img_template: '{sub_category}',
    extras_meta_template: '{parent_name}',
    extras_folder_mode: 'subfolder',
    extras_subfolder_name: 'Extras',
  });

  useEffect(() => {
    if (settings && !isInitializedRef.current) {
      setForm({
        user_name: settings.user_name || '',
        default_scan_dir: settings.default_scan_dir || '',
        folder_library_path: settings.folder_library_path || '',
        collision_strategy: settings.collision_strategy || 'keep_both',
        collision_duration_tolerance_seconds: String(settings.collision_duration_tolerance_seconds || '10'),
        extras_video_action: settings.extras_video_action || 'rename',
        extras_sub_action: settings.extras_sub_action || 'rename',
        extras_audio_action: settings.extras_audio_action || 'rename',
        extras_img_action: settings.extras_img_action || 'rename',
        extras_meta_action: settings.extras_meta_action || 'rename',
        vlc_path: settings.vlc_path || '',
        mpc_path: settings.mpc_path || '',
        tmdb_api_key: settings.tmdb_api_key || '',
        tmdb_bearer_token: settings.tmdb_bearer_token || '',
        omdb_api_key: settings.omdb_api_key || '',
        ui_language: settings.ui_language || 'en',
        follow_app_language_for_media_library: settings.follow_app_language_for_media_library !== undefined ? settings.follow_app_language_for_media_library : true,
        follow_app_language_for_naming: settings.follow_app_language_for_naming !== undefined ? settings.follow_app_language_for_naming : true,
        primary_metadata_language: settings.primary_metadata_language || 'en-US',
        fallback_metadata_language: settings.fallback_metadata_language || 'en-US',
        default_target_language: settings.default_target_language || 'en',
        close_button_behavior: settings.close_button_behavior || 'ask',
        include_adult: settings.include_adult !== undefined ? settings.include_adult : false,
        auto_hydrate_inactive_people: settings.auto_hydrate_inactive_people !== undefined ? settings.auto_hydrate_inactive_people : false,
        custom_organization_enabled: settings.custom_organization_enabled !== undefined ? settings.custom_organization_enabled : false,
        organization_preset: settings.organization_preset || 'plex',
        ui_theme: settings.ui_theme || 'dark',
        min_video_size_mb: settings.min_video_size_mb !== undefined ? String(settings.min_video_size_mb) : '50',
        min_video_duration_minutes: settings.min_video_duration_minutes !== undefined ? String(settings.min_video_duration_minutes) : '12',
        folder_create_collection_dir: settings.folder_create_collection_dir !== false,
        folder_collection_mode: (settings.folder_create_collection_dir === false) ? 'never' : (settings.folder_collection_mode || 'threshold'),
        folder_collection_threshold: settings.folder_collection_threshold !== undefined ? String(settings.folder_collection_threshold) : '3',
        naming_filename_casing: settings.naming_filename_casing || 'default',
        naming_word_separator: settings.naming_word_separator || 'space',
        naming_movie_template: settings.naming_movie_template || '{title} ({year}) {resolution}',
        naming_episode_template: settings.naming_episode_template || '{series_title} - S{season}E{episode} - {episode_title}',
        naming_custom_tag: settings.naming_custom_tag || 'default',
        naming_video_exts: settings.naming_video_exts || '.mkv, .mp4, .avi, .m4v, .mov, .wmv, .mpg, .mpeg',
        folder_organization_enabled: settings.folder_organization_enabled !== false,
        folder_move_to_library: settings.folder_move_to_library !== false,
        folder_sort_by_type: settings.folder_sort_by_type !== false,
        folder_movies_name: settings.folder_movies_name || t('settingsPage.sections.folderStructure.defaultMoviesName') || 'Movies',
        folder_series_name: settings.folder_series_name || t('settingsPage.sections.folderStructure.defaultSeriesName') || 'TV Shows',
        folder_adult_name: settings.folder_adult_name || t('settingsPage.sections.folderStructure.defaultAdultName') || 'Adult',
        folder_create_movie_subdir: settings.folder_create_movie_subdir !== false,
        folder_movie_template: settings.folder_movie_template || '{title} ({year})',
        folder_create_show_dir: settings.folder_create_show_dir !== false,
        folder_show_template: settings.folder_show_template || '{series_title} ({year})',
        folder_create_season_dir: settings.folder_create_season_dir !== false,
        folder_season_template: settings.folder_season_template || 'Season {season}',
        folder_create_episode_dir: settings.folder_create_episode_dir !== undefined ? settings.folder_create_episode_dir : false,
        folder_episode_template: settings.folder_episode_template || '{series_title} - {season}{episode}',
        folder_remove_empty: settings.folder_remove_empty !== false,
        folder_collection_template: settings.folder_collection_template || '{collection}',
        extras_enabled: settings.extras_enabled !== false,
        extras_sub_exts: settings.extras_sub_exts || '.srt, .sub, .ass, .ssa, .vtt',
        extras_audio_exts: settings.extras_audio_exts || '.mka, .ac3, .dts, .mp3, .flac, .wav, .m4a',
        extras_img_exts: settings.extras_img_exts || '.jpg, .jpeg, .png, .gif, .bmp, .webp',
        extras_meta_exts: settings.extras_meta_exts || '.nfo, .xml, .txt',
        extras_video_template: settings.extras_video_template || '{parent_name}-{sub_category}',
        extras_sub_template: settings.extras_sub_template || '{parent_name}.{language}',
        extras_audio_template: settings.extras_audio_template || '{parent_name}.{language}',
        extras_img_template: settings.extras_img_template || '{sub_category}',
        extras_meta_template: settings.extras_meta_template || '{parent_name}',
        extras_folder_mode: settings.extras_folder_mode || 'subfolder',
        extras_subfolder_name: settings.extras_subfolder_name || t('settingsPage.sections.extras.defaultSubfolderName') || 'Extras',
      });
      isInitializedRef.current = true;
    }
  }, [settings, t]);

  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  useEffect(() => {
    if (!['presets', 'fileNaming', 'folderStructure', 'extras', 'rules', 'collections'].includes(activeTab)) {
      setIsOrgExpanded(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!form.folder_organization_enabled && activeTab === 'collections') {
      setActiveTab('presets');
    }
    if (!form.folder_move_to_library && ['folderStructure', 'collections'].includes(activeTab)) {
      setActiveTab('presets');
    }
  }, [form.folder_move_to_library, form.folder_organization_enabled, activeTab]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClose]);

  if (settingsQuery.isLoading) {
    return (
      <div className="settings-overlay" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <Spinner label={t('settingsPage.loading')} />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {t('settingsPage.loading')}
          </span>
        </div>
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className="settings-overlay" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Card title={t('settingsPage.errorTitle')}>
          <Stack gap="lg">
            <span className="ui-field__hint">
              {t('settingsPage.errorText')}
            </span>
            <Inline gap="md">
              <Button variant="primary" onClick={() => settingsQuery.refetch()}>
                {t('settingsPage.retry')}
              </Button>
              <Button variant="secondary" onClick={handleClose}>
                {t('common.cancel') || 'Cancel'}
              </Button>
            </Inline>
          </Stack>
        </Card>
      </div>
    );
  }

  const handleChange = (key) => (event) => {
    const val = event.target.value;
    setForm((current) => ({ ...current, [key]: val }));
    if (key === 'default_scan_dir' || key === 'folder_library_path') {
      setValidationErrors((prev) => ({
        ...prev,
        folders: null
      }));
    }
  };

  const handleCheckboxChange = (key) => (event) => {
    setForm((current) => ({
      ...current,
      [key]: event.target.checked,
    }));
    if (key === 'folder_move_to_library') {
      setValidationErrors((prev) => ({
        ...prev,
        folders: null
      }));
    }
  };

  const handlePickFolder = (key) => async () => {
    const selectedPath = await selectFolder(form[key]);
    if (!selectedPath) {
      return;
    }

    setForm((current) => ({ ...current, [key]: selectedPath }));
  };

  const handlePickFile = (key) => async () => {
    const selectedPath = await selectFile(form[key]);
    if (!selectedPath) {
      return;
    }

    setForm((current) => ({
      ...current,
      [key]: selectedPath,
    }));
  };

  const handleExportSettings = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(form, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `renda_settings_${form.user_name || 'user'}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast(t('settingsPage.sections.backup.exportSuccess') || "Settings exported successfully!", 'success');
    } catch (err) {
      toast(t('settingsPage.sections.backup.exportError') || "Failed to export settings", 'danger');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportSettings = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        const reference = getInitialFormValues({});

        if (!validateJsonStructure(imported, reference)) {
          throw new Error("Invalid structure or value types");
        }

        // Merge with current state
        setForm((prev) => ({
          ...prev,
          ...imported
        }));

        toast(t('settingsPage.sections.backup.importSuccess') || "Settings loaded! Review and click Save Changes to apply.", 'success');
      } catch (err) {
        toast(t('settingsPage.sections.backup.importError') || "Failed to import settings. Invalid JSON file.", 'danger');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const validationResult = await handleValidateFolders(form);
      if (!validationResult.valid) {
        setIsSaving(false);
        let localizedMsg = "";
        if (validationResult.errors) {
          const firstKey = Object.keys(validationResult.errors)[0];
          const errorVal = validationResult.errors[firstKey];
          localizedMsg = t(`settingsPage.validation.${errorVal}`) || errorVal;
        } else {
          localizedMsg = t(`settingsPage.validation.${validationResult.message}`) || validationResult.message;
        }
        toast(localizedMsg || t('settingsPage.saveFailed') || "Failed to save settings. Please correct the folder paths.", 'danger');
        return;
      }
      const payload = {
        user_name: form.user_name.trim(),
        default_scan_dir: form.default_scan_dir.trim(),
        folder_library_path: form.folder_library_path.trim(),
        collision_strategy: form.collision_strategy,
        collision_duration_tolerance_seconds: String(form.collision_duration_tolerance_seconds || '10').trim(),
        extras_video_action: form.extras_video_action,
        extras_sub_action: form.extras_sub_action,
        extras_audio_action: form.extras_audio_action,
        extras_img_action: form.extras_img_action,
        extras_meta_action: form.extras_meta_action,
        vlc_path: form.vlc_path.trim(),
        mpc_path: form.mpc_path.trim(),
        tmdb_api_key: form.tmdb_api_key.trim(),
        tmdb_bearer_token: form.tmdb_bearer_token.trim(),
        omdb_api_key: form.omdb_api_key.trim(),
        ui_language: form.ui_language,
        follow_app_language_for_media_library: form.follow_app_language_for_media_library,
        follow_app_language_for_naming: form.follow_app_language_for_naming,
        primary_metadata_language: form.follow_app_language_for_media_library
          ? (form.ui_language === 'en' ? 'en-US' : form.ui_language)
          : form.primary_metadata_language,
        fallback_metadata_language: form.fallback_metadata_language,
        default_target_language: form.follow_app_language_for_naming
          ? form.ui_language
          : form.default_target_language,
        include_adult: form.include_adult,
        auto_hydrate_inactive_people: form.auto_hydrate_inactive_people,
        custom_organization_enabled: form.custom_organization_enabled,
        organization_preset: form.organization_preset,
        ui_theme: form.ui_theme,
        min_video_size_mb: parseInt(form.min_video_size_mb, 10) || 50,
        min_video_duration_minutes: parseInt(form.min_video_duration_minutes, 10) || 12,
        folder_create_collection_dir: form.folder_create_collection_dir,
        folder_collection_mode: form.folder_create_collection_dir ? form.folder_collection_mode : 'never',
        folder_collection_threshold: parseInt(form.folder_collection_threshold, 10) || 3,
        naming_filename_casing: form.naming_filename_casing,
        naming_word_separator: form.naming_word_separator,
        naming_movie_template: form.naming_movie_template.trim(),
        naming_episode_template: form.naming_episode_template.trim(),
        naming_custom_tag: form.naming_custom_tag.trim(),
        naming_video_exts: form.naming_video_exts.trim(),
        folder_organization_enabled: form.folder_organization_enabled,
        folder_move_to_library: form.folder_move_to_library,
        folder_sort_by_type: form.folder_sort_by_type,
        folder_movies_name: form.folder_movies_name.trim(),
        folder_series_name: form.folder_series_name.trim(),
        folder_adult_name: form.folder_adult_name.trim(),
        folder_create_movie_subdir: form.folder_create_movie_subdir,
        folder_movie_template: form.folder_movie_template.trim(),
        folder_create_show_dir: form.folder_create_show_dir,
        folder_show_template: form.folder_show_template.trim(),
        folder_create_season_dir: form.folder_create_season_dir,
        folder_season_template: form.folder_season_template.trim(),
        folder_create_episode_dir: form.folder_create_episode_dir,
        folder_episode_template: form.folder_episode_template.trim(),
        folder_remove_empty: form.folder_remove_empty,
        folder_collection_template: form.folder_collection_template.trim(),
        extras_enabled: form.extras_enabled,
        extras_sub_exts: form.extras_sub_exts.trim(),
        extras_audio_exts: form.extras_audio_exts.trim(),
        extras_img_exts: form.extras_img_exts.trim(),
        extras_meta_exts: form.extras_meta_exts.trim(),
        extras_video_template: form.extras_video_template.trim(),
        extras_sub_template: form.extras_sub_template.trim(),
        extras_audio_template: form.extras_audio_template.trim(),
        extras_img_template: form.extras_img_template.trim(),
        extras_meta_template: form.extras_meta_template.trim(),
        extras_folder_mode: form.extras_folder_mode,
        extras_subfolder_name: form.extras_subfolder_name.trim(),
      };

      isInitializedRef.current = false;
      await updateSettingsMutation.mutateAsync(payload);
      toast(t('settingsPage.saved'), 'success');
    } catch (error) {
      const localizedErrorMsg = t(`settingsPage.validation.${error.message}`) || error.message;
      toast(localizedErrorMsg || t('settingsPage.saveFailed'), 'danger');
    } finally {
      setIsSaving(false);
    }
  };

  const handleWipeDatabase = () => {
    openModal({
      title: t('settingsPage.dangerZone.confirmTitle'),
      icon: AlertTriangle,
      variant: 'danger',
      content: (
        <p className="ui-modal__body-text">
          {t('settingsPage.dangerZone.confirm')}
        </p>
      ),
      footer: (
        <Inline gap="md">
          <Button variant="secondary-neutral" onClick={closeModal}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              closeModal();
              setIsWiping(true);
              try {
                isInitializedRef.current = false;
                await clearDbMutation.mutateAsync({ wipe: true });
                toast(t('settingsPage.dangerZone.success'), 'success');
              } catch (error) {
                toast(error.message || t('settingsPage.dangerZone.failed'), 'danger');
              } finally {
                setIsWiping(false);
              }
            }}
          >
            {t('settingsPage.dangerZone.button')}
          </Button>
        </Inline>
      ),
    });
  };

  const isDirty = settings ? Object.keys(form).some((key) => {
    const initial = getInitialFormValues(settings, t);
    return form[key] !== initial[key];
  }) : false;

  const handleReset = () => {
    if (settings) {
      setForm(getInitialFormValues(settings, t));
    }
  };

  return (
    <div className="settings-overlay">
      <aside className="settings-sidebar">
        <h1 className="settings-sidebar-header">{t('sidebar.settings')}</h1>
        <nav className="settings-sidebar-menu">
          <div
            className={`settings-sidebar-item${activeTab === 'general' ? ' active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Settings2 size={18} />
            <span>{t('settingsPage.sidebar.general')}</span>
          </div>
          <div
            className={`settings-sidebar-item${activeTab === 'theme' ? ' active' : ''}`}
            onClick={() => setActiveTab('theme')}
          >
            <Palette size={18} />
            <span>{t('settingsPage.sidebar.theme')}</span>
          </div>
          <div
            className={`settings-sidebar-item${['presets', 'fileNaming', 'folderStructure', 'extras', 'rules', 'collections'].includes(activeTab) ? ' active' : ''}`}
            onClick={() => {
              setActiveTab('presets');
              setIsOrgExpanded(!isOrgExpanded);
            }}
          >
            <FolderTree size={18} />
            <span style={{ flex: 1 }}>{t('settingsPage.sidebar.organization')}</span>
            {(isOrgExpanded || ['presets', 'fileNaming', 'folderStructure', 'extras', 'rules', 'collections'].includes(activeTab)) ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </div>
          {(isOrgExpanded || ['presets', 'fileNaming', 'folderStructure', 'extras', 'rules', 'collections'].includes(activeTab)) && (() => {
            const showCollections = form.folder_move_to_library && form.folder_organization_enabled;
            const subTabs = form.folder_move_to_library
              ? (form.custom_organization_enabled
                ? (showCollections
                  ? ['presets', 'fileNaming', 'folderStructure', 'extras', 'rules', 'collections']
                  : ['presets', 'fileNaming', 'folderStructure', 'extras', 'rules'])
                : (showCollections
                  ? ['presets', 'rules', 'collections']
                  : ['presets', 'rules']))
              : (form.custom_organization_enabled
                ? ['presets', 'fileNaming', 'extras', 'rules']
                : ['presets', 'rules']);
            const activeIndex = subTabs.indexOf(activeTab);
            return (
              <div className="settings-sidebar-sub-menu">
                {activeIndex !== -1 && (
                  <div
                    className="settings-sidebar-sub-indicator"
                    style={{
                      top: `${activeIndex * 32}px`,
                      height: '28px'
                    }}
                  />
                )}
                <div
                  className={`settings-sidebar-sub-item${activeTab === 'presets' ? ' active' : ''}`}
                  onClick={() => setActiveTab('presets')}
                >
                  <span>{t('settingsPage.sidebar.presets') || 'Presets'}</span>
                </div>
                <div
                  className={`settings-sidebar-sub-item custom-only${form.custom_organization_enabled ? ' visible' : ''}${activeTab === 'fileNaming' ? ' active' : ''}`}
                  onClick={() => setActiveTab('fileNaming')}
                >
                  <span>{t('settingsPage.sidebar.fileNaming')}</span>
                </div>
                {form.folder_move_to_library && (
                  <div
                    className={`settings-sidebar-sub-item custom-only${form.custom_organization_enabled ? ' visible' : ''}${activeTab === 'folderStructure' ? ' active' : ''}`}
                    onClick={() => setActiveTab('folderStructure')}
                  >
                    <span>{t('settingsPage.sidebar.folderStructure')}</span>
                  </div>
                )}
                <div
                  className={`settings-sidebar-sub-item custom-only${form.custom_organization_enabled ? ' visible' : ''}${activeTab === 'extras' ? ' active' : ''}`}
                  onClick={() => setActiveTab('extras')}
                >
                  <span>{t('settingsPage.sidebar.extras')}</span>
                </div>
                <div
                  className={`settings-sidebar-sub-item${activeTab === 'rules' ? ' active' : ''}`}
                  onClick={() => setActiveTab('rules')}
                >
                  <span>{t('settingsPage.sidebar.rules')}</span>
                </div>
                {form.folder_move_to_library && (
                  <div
                    className={`settings-sidebar-sub-item${activeTab === 'collections' ? ' active' : ''}`}
                    onClick={() => setActiveTab('collections')}
                  >
                    <span>{t('settingsPage.sidebar.collections')}</span>
                  </div>
                )}
              </div>
            );
          })()}
          <div
            className={`settings-sidebar-item${activeTab === 'apiKeys' ? ' active' : ''}`}
            onClick={() => setActiveTab('apiKeys')}
          >
            <KeyRound size={18} />
            <span>{t('settingsPage.sidebar.apiKeys')}</span>
          </div>
          <div
            className={`settings-sidebar-item${activeTab === 'advanced' ? ' active' : ''}`}
            onClick={() => setActiveTab('advanced')}
          >
            <Cpu size={18} />
            <span>{t('settingsPage.sidebar.advanced')}</span>
          </div>
          <div
            className={`settings-sidebar-item${activeTab === 'maintenance' ? ' active' : ''}`}
            onClick={() => setActiveTab('maintenance')}
          >
            <Wrench size={18} />
            <span>{t('settingsPage.sidebar.maintenance')}</span>
          </div>
        </nav>
      </aside>

      <main className="settings-content-wrapper">
        <div className="settings-close-container">
          <IconButton
            className="settings-close-btn"
            onClick={handleClose}
            label={t('settingsPage.closeSettings') || 'Close Settings'}
            title={null}
            size="md"
          >
            <X size={18} />
          </IconButton>
          <span className="settings-close-esc-hint">ESC</span>
        </div>

        <div className="settings-content">
          <Stack gap="xl">


            {activeTab === 'general' && (
              <Card
                title={t('settingsPage.sections.profile.title')}
                eyebrow={t('settingsPage.sections.profile.eyebrow')}
              >
                <Stack>
                  <Input
                    label={t('settingsPage.sections.profile.nickname')}
                    value={form.user_name}
                    onChange={handleChange('user_name')}
                    placeholder={t('settingsPage.sections.profile.nicknamePlaceholder')}
                  />
                </Stack>
              </Card>
            )}

            {activeTab === 'general' && (
              <Card
                title={t('settingsPage.sections.folders.title')}
                eyebrow={t('settingsPage.sections.folders.eyebrow')}
              >
                <Stack>
                  {validationErrors.folders && !validationErrors.scanFolder && !validationErrors.targetFolder && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '6px',
                      color: '#ef4444',
                      fontSize: '13px',
                      marginBottom: '10px'
                    }}>
                      <AlertTriangle size={16} />
                      <span>{validationErrors.folders}</span>
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <Input
                          label={t('settingsPage.sections.folders.scanFolder')}
                          value={form.default_scan_dir}
                          onChange={handleChange('default_scan_dir')}
                          placeholder={t('settingsPage.sections.folders.scanFolderPlaceholder')}
                        />
                      </div>
                      <Button variant="secondary" onClick={handlePickFolder('default_scan_dir')} disabled={isSaving} style={{ height: '48px', flexShrink: 0 }}>
                        {t('settingsPage.sections.folders.browse') || 'Browse...'}
                      </Button>
                    </div>
                    {validationErrors.scanFolder && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '6px',
                        color: '#ef4444',
                        fontSize: '13px',
                        marginTop: '-4px',
                        marginBottom: '6px'
                      }}>
                        <AlertTriangle size={16} />
                        <span>{validationErrors.scanFolder}</span>
                      </div>
                    )}
                  </div>

                  {form.folder_move_to_library && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                        <div style={{ flex: 1 }}>
                          <Input
                            label={t('settingsPage.sections.folders.targetFolder')}
                            value={form.folder_library_path}
                            onChange={handleChange('folder_library_path')}
                            placeholder={t('settingsPage.sections.folders.targetFolderPlaceholder')}
                          />
                        </div>
                        <Button variant="secondary" onClick={handlePickFolder('folder_library_path')} disabled={isSaving} style={{ height: '48px', flexShrink: 0 }}>
                          {t('settingsPage.sections.folders.browse') || 'Browse...'}
                        </Button>
                      </div>
                      {form.folder_move_to_library && !form.folder_library_path.trim() && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 14px',
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.2)',
                          borderRadius: '6px',
                          color: '#f59e0b',
                          fontSize: '13px',
                          marginTop: '4px',
                          marginBottom: '6px'
                        }}>
                          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                          <span>{t('settingsPage.sections.mode.warningHint')}</span>
                        </div>
                      )}
                      {validationErrors.targetFolder && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 14px',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          borderRadius: '6px',
                          color: '#ef4444',
                          fontSize: '13px',
                          marginTop: '-4px',
                          marginBottom: '6px'
                        }}>
                          <AlertTriangle size={16} />
                          <span>{validationErrors.targetFolder}</span>
                        </div>
                      )}
                    </div>
                  )}
                </Stack>
              </Card>
            )}

            {activeTab === 'general' && (
              <Card
                title={t('settingsPage.sections.language.title')}
                eyebrow={t('settingsPage.sections.language.eyebrow')}
              >
                <Stack>
                  <Dropdown
                    label={t('settingsPage.sections.language.appLanguage')}
                    hint={t('settingsPage.sections.language.hint')}
                    value={form.ui_language}
                    options={appLanguageOptions}
                    onChange={handleChange('ui_language')}
                  />
                </Stack>
              </Card>
            )}

            {activeTab === 'general' && (
              <Card
                title={t('settingsPage.sections.content.title')}
                eyebrow={t('settingsPage.sections.content.eyebrow')}
              >
                <Stack>
                  <Switch
                    id="include_adult"
                    checked={form.include_adult}
                    onChange={handleCheckboxChange('include_adult')}
                  >
                    <Inline gap="sm" align="center" style={{ display: 'inline-flex' }}>
                      <span>{t('settingsPage.sections.content.includeAdult')}</span>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 'bold',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'var(--color-state-danger-bg-strong, rgba(239, 68, 68, 0.25))',
                        color: 'var(--color-state-danger, #ef4444)',
                        border: '1.5px solid var(--color-state-danger, #ef4444)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        lineHeight: '1.2'
                      }}>
                        {t('settingsPage.sections.content.eighteenPlus')}
                      </span>
                    </Inline>
                  </Switch>
                  <span className="ui-field__hint" style={{ marginTop: '-8px', marginBottom: '16px' }}>
                    {t('settingsPage.sections.content.includeAdultHint')}
                  </span>
                  <Switch
                    id="auto_hydrate_inactive_people"
                    checked={form.auto_hydrate_inactive_people}
                    onChange={handleCheckboxChange('auto_hydrate_inactive_people')}
                  >
                    {t('settingsPage.sections.content.autoHydrateInactivePeople')}
                  </Switch>
                  <span className="ui-field__hint" style={{ marginTop: '-8px', marginBottom: '8px' }}>
                    {t('settingsPage.sections.content.autoHydrateInactivePeopleHint')}
                  </span>
                </Stack>
              </Card>
            )}

            {activeTab === 'general' && (
              <Card
                title={t('settingsPage.sections.closeBehavior.title')}
                eyebrow={t('settingsPage.sections.closeBehavior.eyebrow')}
              >
                <Stack>
                  <Dropdown
                    label={t('settingsPage.sections.closeBehavior.label')}
                    hint={t('settingsPage.sections.closeBehavior.hint')}
                    value={form.close_button_behavior}
                    options={closeBehaviorOptions}
                    onChange={handleChange('close_button_behavior')}
                  />
                </Stack>
              </Card>
            )}

            {activeTab === 'general' && (
              <Card
                title={t('settingsPage.sections.playback.title')}
                eyebrow={t('settingsPage.sections.playback.eyebrow')}
              >
                <Stack>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <Input
                        label={t('settingsPage.sections.playback.vlcPath')}
                        value={form.vlc_path}
                        onChange={handleChange('vlc_path')}
                        placeholder={t('settingsPage.sections.playback.vlcPlaceholder')}
                      />
                    </div>
                    <Button variant="secondary" onClick={handlePickFile('vlc_path')} disabled={isSaving} style={{ height: '48px', flexShrink: 0 }}>
                      {t('settingsPage.sections.playback.browse') || 'Browse...'}
                    </Button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <Input
                        label={t('settingsPage.sections.playback.mpcPath')}
                        value={form.mpc_path}
                        onChange={handleChange('mpc_path')}
                        placeholder={t('settingsPage.sections.playback.mpcPlaceholder')}
                      />
                    </div>
                    <Button variant="secondary" onClick={handlePickFile('mpc_path')} disabled={isSaving} style={{ height: '48px', flexShrink: 0 }}>
                      {t('settingsPage.sections.playback.browse') || 'Browse...'}
                    </Button>
                  </div>
                </Stack>
              </Card>
            )}
            {activeTab === 'theme' && (
              <Card
                title={t('settingsPage.sections.theme.title')}
                eyebrow={t('settingsPage.sections.theme.eyebrow')}
              >
                <Stack>
                  <Dropdown
                    label={t('settingsPage.sections.theme.label')}
                    hint={t('settingsPage.sections.theme.hint')}
                    value={form.ui_theme}
                    options={themeOptions}
                    onChange={handleChange('ui_theme')}
                  />
                </Stack>
              </Card>
            )}

            {activeTab === 'presets' && (
              <Card
                title={t('settingsPage.sections.mode.title')}
                eyebrow={t('settingsPage.sections.mode.eyebrow')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <span className="ui-field__hint" style={{ marginTop: '-8px' }}>
                    {t('settingsPage.sections.mode.hint')}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr', gap: '16px', marginTop: '4px' }}>
                    {/* Mode A: Library sorting */}
                    <div
                      onClick={() => setForm(prev => ({ ...prev, folder_move_to_library: true }))}
                      style={{
                        padding: '16px',
                        borderRadius: 'var(--radius-md)',
                        border: '1.5px solid ' + (form.folder_move_to_library ? 'var(--color-accent)' : 'var(--color-line)'),
                        background: form.folder_move_to_library ? 'rgba(0, 136, 255, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: form.folder_move_to_library ? '0 0 16px rgba(0, 136, 255, 0.08)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!form.folder_move_to_library) {
                          e.currentTarget.style.borderColor = 'var(--color-line-strong)';
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!form.folder_move_to_library) {
                          e.currentTarget.style.borderColor = 'var(--color-line)';
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="radio"
                          checked={form.folder_move_to_library}
                          onChange={() => {}}
                          style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: '600', color: form.folder_move_to_library ? 'var(--color-accent)' : 'var(--color-ink)', fontSize: '14px' }}>
                          {t('settingsPage.sections.mode.library')}
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--color-muted)', lineHeight: '1.5' }}>
                        {t('settingsPage.sections.mode.libraryHint')}
                      </span>
                    </div>

                    {/* Mode B: In-place Rename */}
                    <div
                      onClick={() => setForm(prev => ({ ...prev, folder_move_to_library: false }))}
                      style={{
                        padding: '16px',
                        borderRadius: 'var(--radius-md)',
                        border: '1.5px solid ' + (!form.folder_move_to_library ? 'var(--color-accent)' : 'var(--color-line)'),
                        background: !form.folder_move_to_library ? 'rgba(0, 136, 255, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: !form.folder_move_to_library ? '0 0 16px rgba(0, 136, 255, 0.08)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (form.folder_move_to_library) {
                          e.currentTarget.style.borderColor = 'var(--color-line-strong)';
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (form.folder_move_to_library) {
                          e.currentTarget.style.borderColor = 'var(--color-line)';
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="radio"
                          checked={!form.folder_move_to_library}
                          onChange={() => {}}
                          style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: '600', color: !form.folder_move_to_library ? 'var(--color-accent)' : 'var(--color-ink)', fontSize: '14px' }}>
                          {t('settingsPage.sections.mode.inplace')}
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--color-muted)', lineHeight: '1.5' }}>
                        {t('settingsPage.sections.mode.inplaceHint')}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'presets' && (
              <Card
                title={t('settingsPage.sections.organization.title')}
                eyebrow={t('settingsPage.sections.organization.eyebrow')}
              >
                <Stack>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span className="ui-field__label">{t('settingsPage.sections.organization.presetLabel')}</span>
                    <span className="ui-field__hint" style={{ marginTop: '-4px', marginBottom: '8px' }}>
                      {t('settingsPage.sections.organization.presetHint')}
                    </span>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '12px',
                      marginBottom: '16px'
                    }}>
                      {presetCards.map((preset) => {
                        const isSelected = form.organization_preset === preset.value;
                        const isDisabled = form.custom_organization_enabled;
                        return (
                          <div
                            key={preset.value}
                            onClick={() => {
                              if (isDisabled) return;
                              const config = PRESETS_CONFIG[preset.value];
                              if (config) {
                                setForm((prev) => ({
                                  ...prev,
                                  ...config,
                                  organization_preset: preset.value,
                                }));
                              }
                            }}
                            style={{
                              padding: '16px',
                              borderRadius: 'var(--radius-md)',
                              border: `1.5px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-line)'}`,
                              background: isSelected ? 'rgba(0, 136, 255, 0.04)' : 'rgba(255, 255, 255, 0.01)',
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              opacity: isDisabled && !isSelected ? 0.4 : 1,
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              position: 'relative',
                              boxShadow: isSelected ? '0 0 16px rgba(0, 136, 255, 0.06)' : 'none',
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected && !isDisabled) {
                                e.currentTarget.style.borderColor = 'var(--color-line-strong)';
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected && !isDisabled) {
                                e.currentTarget.style.borderColor = 'var(--color-line)';
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                              }
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '18px' }}>{preset.icon}</span>
                              <span style={{
                                fontWeight: '600',
                                color: isSelected ? 'var(--color-accent)' : 'var(--color-ink)',
                                fontSize: '13.5px'
                              }}>
                                {preset.label}
                              </span>
                              {isSelected && (
                                <span style={{
                                  marginLeft: 'auto',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  color: 'var(--color-accent)',
                                  background: 'rgba(0, 136, 255, 0.12)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em'
                                }}>
                                  {t('settingsPage.sections.organization.activePreset')}
                                </span>
                              )}
                            </div>
                            <span style={{
                              fontSize: '11.5px',
                              color: 'var(--color-muted)',
                              lineHeight: '1.4',
                              marginTop: '2px'
                            }}>
                              {preset.desc}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Switch
                    id="custom_organization_enabled"
                    checked={form.custom_organization_enabled}
                    onChange={handleCheckboxChange('custom_organization_enabled')}
                  >
                    {t('settingsPage.sections.organization.customToggleLabel')}
                  </Switch>
                  <span className="ui-field__hint" style={{ marginTop: '-8px', marginBottom: '8px' }}>
                    {t('settingsPage.sections.organization.customToggleHint')}
                  </span>
                </Stack>
              </Card>
            )}

            {activeTab === 'presets' && (
              <Card
                title={t('settingsPage.sections.organization.previewTitle')}
                eyebrow={t('settingsPage.sections.organization.previewEyebrow')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span className="ui-field__hint">
                    {t('settingsPage.sections.organization.previewHint')}
                  </span>
                  
                  <div style={{
                    background: 'var(--color-bg-panel, rgba(0, 0, 0, 0.2))',
                    border: '1px solid var(--color-line)',
                    borderRadius: '8px',
                    padding: '16px',
                    fontFamily: 'monospace',
                    fontSize: '12.5px',
                    lineHeight: '1.6',
                    color: 'var(--color-text-secondary)',
                    overflowX: 'auto'
                  }}>
                    {form.folder_move_to_library ? (
                      <div>
                        <div style={{ color: 'var(--color-accent)', fontWeight: 'bold', marginBottom: '8px' }}>
                          📁 {form.folder_library_path.trim() || t('settingsPage.sections.organization.previewTargetFolderPlaceholder')}
                        </div>
                        {form.folder_organization_enabled ? (
                          <div style={{ marginLeft: '16px' }}>
                            {form.folder_sort_by_type ? (
                              <>
                                {/* Movies Path */}
                                <div style={{ color: 'var(--color-ink)' }}>📁 {form.folder_movies_name}/</div>
                                <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                  {form.folder_create_movie_subdir ? (
                                    <>
                                      <div style={{ color: 'var(--color-ink)' }}>📁 {generatePreview(form.folder_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false)}/</div>
                                      <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                        <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                        {form.extras_enabled && form.extras_folder_mode === 'subfolder' && (
                                          <>
                                            <div style={{ color: 'var(--color-ink)', marginTop: '4px' }}>📁 {form.extras_subfolder_name}/</div>
                                            <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                              <div style={{ color: 'var(--color-muted)' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false).replace(/\.mp4$/, '')}.en.srt</div>
                                            </div>
                                          </>
                                        )}
                                        {form.extras_enabled && form.extras_folder_mode !== 'subfolder' && (
                                          <div style={{ color: 'var(--color-muted)', marginTop: '4px' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false).replace(/\.mp4$/, '')}.en.srt</div>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                      {form.extras_enabled && (
                                        <div style={{ color: 'var(--color-muted)', marginTop: '4px' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false).replace(/\.mp4$/, '')}.en.srt</div>
                                      )}
                                    </>
                                  )}
                                </div>

                                {/* TV Shows Path */}
                                <div style={{ color: 'var(--color-ink)', marginTop: '12px' }}>📁 {form.folder_series_name}/</div>
                                <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                  {form.folder_create_show_dir ? (
                                    <>
                                      <div style={{ color: 'var(--color-ink)' }}>📁 {generatePreview(form.folder_show_template, 'show', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false)}/</div>
                                      <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                        {form.folder_create_season_dir ? (
                                          <>
                                            <div style={{ color: 'var(--color-ink)' }}>📁 {generatePreview(form.folder_season_template, 'season', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false)}/</div>
                                            <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                              {form.folder_create_episode_dir ? (
                                                <>
                                                  <div style={{ color: 'var(--color-ink)' }}>📁 {generatePreview(form.folder_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false)}/</div>
                                                  <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                                    <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                                  </div>
                                                </>
                                              ) : (
                                                <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                              )}
                                            </div>
                                          </>
                                        ) : (
                                          <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Non-sorted (No Movies / TV Shows roots) */}
                                {form.folder_create_movie_subdir ? (
                                  <>
                                    <div style={{ color: 'var(--color-ink)' }}>📁 {generatePreview(form.folder_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false)}/</div>
                                    <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                      <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                      {form.extras_enabled && form.extras_folder_mode === 'subfolder' && (
                                        <>
                                          <div style={{ color: 'var(--color-ink)', marginTop: '4px' }}>📁 {form.extras_subfolder_name}/</div>
                                          <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                            <div style={{ color: 'var(--color-muted)' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false).replace(/\.mp4$/, '')}.en.srt</div>
                                          </div>
                                        </>
                                      )}
                                      {form.extras_enabled && form.extras_folder_mode !== 'subfolder' && (
                                        <div style={{ color: 'var(--color-muted)', marginTop: '4px' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false).replace(/\.mp4$/, '')}.en.srt</div>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                    {form.extras_enabled && (
                                      <div style={{ color: 'var(--color-muted)', marginTop: '4px', marginBottom: '8px' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false).replace(/\.mp4$/, '')}.en.srt</div>
                                    )}
                                  </>
                                )}
                                
                                {form.folder_create_show_dir ? (
                                  <>
                                    <div style={{ color: 'var(--color-ink)', marginTop: '8px' }}>📁 {generatePreview(form.folder_show_template, 'show', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false)}/</div>
                                    <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                      {form.folder_create_season_dir ? (
                                        <>
                                          <div style={{ color: 'var(--color-ink)' }}>📁 {generatePreview(form.folder_season_template, 'season', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false)}/</div>
                                          <div style={{ marginLeft: '16px', borderLeft: '1.5px dashed var(--color-line)', paddingLeft: '12px' }}>
                                            <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                          </div>
                                        </>
                                      ) : (
                                        <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <div style={{ color: 'var(--color-success, #10B981)', marginTop: '8px' }}>📄 {generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginLeft: '16px' }}>
                            {/* Flattened directly in library root (Minimalist) */}
                            <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                            {form.extras_enabled && (
                              <div style={{ color: 'var(--color-muted)', marginTop: '4px', marginBottom: '8px' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false).replace(/\.mp4$/, '')}.en.srt</div>
                            )}
                            <div style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {/* In-place renaming mode */}
                        <div style={{ color: 'var(--color-accent)', fontWeight: 'bold', marginBottom: '8px' }}>
                          📁 {t('settingsPage.sections.organization.previewScanFolderPlaceholder')}
                        </div>
                        <div style={{ marginLeft: '16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div>
                              <span style={{ color: 'var(--color-muted)', textDecoration: 'line-through' }}>📄 original_movie_file.mp4</span>
                              <span style={{ color: 'var(--color-accent)', margin: '0 8px' }}>→</span>
                              <span style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</span>
                            </div>
                            <div style={{ marginTop: '4px' }}>
                              <span style={{ color: 'var(--color-muted)', textDecoration: 'line-through' }}>📄 original_episode_file.mp4</span>
                              <span style={{ color: 'var(--color-accent)', margin: '0 8px' }}>→</span>
                              <span style={{ color: 'var(--color-success, #10B981)' }}>📄 {generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</span>
                            </div>
                            {form.extras_enabled && (
                              <div style={{ marginTop: '4px' }}>
                                <span style={{ color: 'var(--color-muted)', textDecoration: 'line-through' }}>📄 original_subtitle.srt</span>
                                <span style={{ color: 'var(--color-accent)', margin: '0 8px' }}>→</span>
                                <span style={{ color: 'var(--color-muted)' }}>📄 {generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false).replace(/\.mp4$/, '')}.en.srt</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'fileNaming' && (
              <Card
                title={t('settingsPage.sections.fileNaming.title')}
                eyebrow={t('settingsPage.sections.fileNaming.eyebrow')}
              >
                <Stack gap="lg">
                  <Input
                    label={t('settingsPage.sections.fileNaming.customTagLabel')}
                    hint={t('settingsPage.sections.fileNaming.customTagHint')}
                    value={form.naming_custom_tag}
                    onChange={handleChange('naming_custom_tag')}
                    placeholder="default"
                  />
                  <Input
                    label={t('settingsPage.sections.fileNaming.videoExtsLabel')}
                    hint={t('settingsPage.sections.fileNaming.videoExtsHint')}
                    value={form.naming_video_exts}
                    onChange={handleChange('naming_video_exts')}
                    placeholder=".mkv, .mp4, .avi, .m4v, .mov, .wmv, .mpg, .mpeg"
                  />
                  <Dropdown
                    label={t('settingsPage.sections.fileNaming.casingLabel')}
                    hint={t('settingsPage.sections.fileNaming.casingHint')}
                    value={form.naming_filename_casing}
                    options={casingOptions}
                    onChange={handleChange('naming_filename_casing')}
                  />
                  <Dropdown
                    label={t('settingsPage.sections.fileNaming.separatorLabel')}
                    hint={t('settingsPage.sections.fileNaming.separatorHint')}
                    value={form.naming_word_separator}
                    options={separatorOptions}
                    onChange={handleChange('naming_word_separator')}
                  />

                  <div>
                    <Input
                      inputRef={movieInputRef}
                      label={t('settingsPage.sections.fileNaming.movieTemplateLabel')}
                      hint={t('settingsPage.sections.fileNaming.movieTemplateHint')}
                      value={form.naming_movie_template}
                      onChange={handleChange('naming_movie_template')}
                      placeholder="{title} ({year}) {resolution}"
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                      {MOVIE_TAGS.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => insertTag('naming_movie_template', movieInputRef, tag)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid var(--color-line)',
                            color: 'var(--color-text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                            e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                            e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                            e.currentTarget.style.borderColor = 'var(--color-line)';
                            e.currentTarget.style.color = 'var(--color-text-secondary)';
                          }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    {form.naming_movie_template && (
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--color-accent, #0088ff)',
                        background: 'rgba(0, 136, 255, 0.05)',
                        border: '1px solid rgba(0, 136, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        marginTop: '10px',
                        fontFamily: 'monospace',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}>
                        <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                        <span>{generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag)}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <Input
                      inputRef={episodeInputRef}
                      label={t('settingsPage.sections.fileNaming.episodeTemplateLabel')}
                      hint={t('settingsPage.sections.fileNaming.episodeTemplateHint')}
                      value={form.naming_episode_template}
                      onChange={handleChange('naming_episode_template')}
                      placeholder="{series_title} - S{season}E{episode} - {episode_title}"
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                      {EPISODE_TAGS.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => insertTag('naming_episode_template', episodeInputRef, tag)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid var(--color-line)',
                            color: 'var(--color-text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                            e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                            e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                            e.currentTarget.style.borderColor = 'var(--color-line)';
                            e.currentTarget.style.color = 'var(--color-text-secondary)';
                          }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    {form.naming_episode_template && (
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--color-accent, #0088ff)',
                        background: 'rgba(0, 136, 255, 0.05)',
                        border: '1px solid rgba(0, 136, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        marginTop: '10px',
                        fontFamily: 'monospace',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}>
                        <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                        <span>{generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag)}</span>
                      </div>
                    )}
                  </div>
                </Stack>
              </Card>
            )}

            {activeTab === 'folderStructure' && (
              <Stack gap="xl">
                <Card
                  title={t('settingsPage.sections.folderStructure.behaviorTitle')}
                  eyebrow={t('settingsPage.sections.folderStructure.behaviorEyebrow')}
                >
                  <Stack gap="lg">
                    <Switch
                      id="folder_organization_enabled"
                      checked={form.folder_organization_enabled}
                      onChange={handleCheckboxChange('folder_organization_enabled')}
                    >
                      {t('settingsPage.sections.folderStructure.orgEnabled')}
                    </Switch>
                    <span className="ui-field__hint" style={{ marginTop: '-8px' }}>
                      {t('settingsPage.sections.folderStructure.orgEnabledHint')}
                    </span>

                    {form.folder_organization_enabled && (
                      <>
                        <Switch
                          id="folder_move_to_library"
                          checked={form.folder_move_to_library}
                          onChange={handleCheckboxChange('folder_move_to_library')}
                        >
                          {t('settingsPage.sections.folderStructure.moveToLibrary')}
                        </Switch>
                        <span className="ui-field__hint" style={{ marginTop: '-8px' }}>
                          {t('settingsPage.sections.folderStructure.moveToLibraryHint')}
                        </span>

                        <Switch
                          id="folder_sort_by_type"
                          checked={form.folder_sort_by_type}
                          onChange={handleCheckboxChange('folder_sort_by_type')}
                        >
                          {t('settingsPage.sections.folderStructure.sortByType')}
                        </Switch>
                        <span className="ui-field__hint" style={{ marginTop: '-8px' }}>
                          {t('settingsPage.sections.folderStructure.sortByTypeHint')}
                        </span>

                        {form.folder_sort_by_type && (
                          <div style={{ marginLeft: '24px' }}>
                            <Stack gap="md">
                              <Input
                                label={t('settingsPage.sections.folderStructure.moviesDirName')}
                                value={form.folder_movies_name}
                                onChange={handleChange('folder_movies_name')}
                                placeholder="Movies"
                              />
                              <Input
                                label={t('settingsPage.sections.folderStructure.seriesDirName')}
                                value={form.folder_series_name}
                                onChange={handleChange('folder_series_name')}
                                placeholder="TV Shows"
                              />
                              <Input
                                label={t('settingsPage.sections.folderStructure.adultDirName')}
                                value={form.folder_adult_name}
                                onChange={handleChange('folder_adult_name')}
                                placeholder="Adult"
                              />
                            </Stack>
                          </div>
                        )}

                        <Switch
                          id="folder_remove_empty"
                          checked={form.folder_remove_empty}
                          onChange={handleCheckboxChange('folder_remove_empty')}
                        >
                          {t('settingsPage.sections.folderStructure.removeEmpty')}
                        </Switch>
                        <span className="ui-field__hint" style={{ marginTop: '-8px' }}>
                          {t('settingsPage.sections.folderStructure.removeEmptyHint')}
                        </span>
                      </>
                    )}
                  </Stack>
                </Card>

                {form.folder_organization_enabled && (
                  <Card
                    title={t('settingsPage.sections.folderStructure.structureTitle')}
                    eyebrow={t('settingsPage.sections.folderStructure.structureEyebrow')}
                  >
                    <Stack gap="xl">
                      {/* Movie Subdir */}
                      <div>
                        <Switch
                          id="folder_create_movie_subdir"
                          checked={form.folder_create_movie_subdir}
                          onChange={handleCheckboxChange('folder_create_movie_subdir')}
                        >
                          {t('settingsPage.sections.folderStructure.createMovieSubdir')}
                        </Switch>
                        <span className="ui-field__hint" style={{ marginTop: '-8px', display: 'block', marginBottom: '8px' }}>
                          {t('settingsPage.sections.folderStructure.createMovieSubdirHint')}
                        </span>

                        {form.folder_create_movie_subdir && (
                          <div style={{ marginTop: '12px', marginLeft: '24px' }}>
                            <Input
                              inputRef={folderMovieInputRef}
                              label={t('settingsPage.sections.folderStructure.movieTemplate')}
                              value={form.folder_movie_template}
                              onChange={handleChange('folder_movie_template')}
                              placeholder="{title} ({year})"
                            />
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                              {FOLDER_MOVIE_TAGS.map(tag => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => insertTag('folder_movie_template', folderMovieInputRef, tag)}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    background: 'rgba(255, 255, 255, 0.04)',
                                    border: '1px solid var(--color-line)',
                                    color: 'var(--color-text-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                                    e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                    e.currentTarget.style.borderColor = 'var(--color-line)';
                                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                                  }}
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                            {form.folder_movie_template && (
                              <div style={{
                                fontSize: '11px',
                                color: 'var(--color-accent, #0088ff)',
                                background: 'rgba(0, 136, 255, 0.05)',
                                border: '1px solid rgba(0, 136, 255, 0.12)',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                marginTop: '10px',
                                fontFamily: 'monospace',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}>
                                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                                <span>{generatePreview(form.folder_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false, { enabled: form.folder_sort_by_type, moviesName: form.folder_movies_name, seriesName: form.folder_series_name })}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Show Dir */}
                      <div>
                        <Switch
                          id="folder_create_show_dir"
                          checked={form.folder_create_show_dir}
                          onChange={handleCheckboxChange('folder_create_show_dir')}
                        >
                          {t('settingsPage.sections.folderStructure.createShowDir')}
                        </Switch>
                        <span className="ui-field__hint" style={{ marginTop: '-8px', display: 'block', marginBottom: '8px' }}>
                          {t('settingsPage.sections.folderStructure.createShowDirHint')}
                        </span>

                        {form.folder_create_show_dir && (
                          <div style={{ marginTop: '12px', marginLeft: '24px' }}>
                            <Input
                              inputRef={folderShowInputRef}
                              label={t('settingsPage.sections.folderStructure.showTemplate')}
                              value={form.folder_show_template}
                              onChange={handleChange('folder_show_template')}
                              placeholder="{series_title} ({year})"
                            />
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                              {FOLDER_SHOW_TAGS.map(tag => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => insertTag('folder_show_template', folderShowInputRef, tag)}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    background: 'rgba(255, 255, 255, 0.04)',
                                    border: '1px solid var(--color-line)',
                                    color: 'var(--color-text-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                                    e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                    e.currentTarget.style.borderColor = 'var(--color-line)';
                                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                                  }}
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                            {form.folder_show_template && (
                              <div style={{
                                fontSize: '11px',
                                color: 'var(--color-accent, #0088ff)',
                                background: 'rgba(0, 136, 255, 0.05)',
                                border: '1px solid rgba(0, 136, 255, 0.12)',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                marginTop: '10px',
                                fontFamily: 'monospace',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}>
                                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                                <span>{generatePreview(form.folder_show_template, 'show', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false, { enabled: form.folder_sort_by_type, moviesName: form.folder_movies_name, seriesName: form.folder_series_name })}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Season Dir */}
                      <div>
                        <Switch
                          id="folder_create_season_dir"
                          checked={form.folder_create_season_dir}
                          onChange={handleCheckboxChange('folder_create_season_dir')}
                        >
                          {t('settingsPage.sections.folderStructure.createSeasonDir')}
                        </Switch>
                        <span className="ui-field__hint" style={{ marginTop: '-8px', display: 'block', marginBottom: '8px' }}>
                          {t('settingsPage.sections.folderStructure.createSeasonDirHint')}
                        </span>

                        {form.folder_create_season_dir && (
                          <div style={{ marginTop: '12px', marginLeft: '24px' }}>
                            <Input
                              inputRef={folderSeasonInputRef}
                              label={t('settingsPage.sections.folderStructure.seasonTemplate')}
                              value={form.folder_season_template}
                              onChange={handleChange('folder_season_template')}
                              placeholder="Season {season}"
                            />
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                              {FOLDER_SEASON_TAGS.map(tag => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => insertTag('folder_season_template', folderSeasonInputRef, tag)}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    background: 'rgba(255, 255, 255, 0.04)',
                                    border: '1px solid var(--color-line)',
                                    color: 'var(--color-text-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                                    e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                    e.currentTarget.style.borderColor = 'var(--color-line)';
                                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                                  }}
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                            {form.folder_season_template && (
                              <div style={{
                                fontSize: '11px',
                                color: 'var(--color-accent, #0088ff)',
                                background: 'rgba(0, 136, 255, 0.05)',
                                border: '1px solid rgba(0, 136, 255, 0.12)',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                marginTop: '10px',
                                fontFamily: 'monospace',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}>
                                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                                <span>{generatePreview(form.folder_season_template, 'season', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false, { enabled: form.folder_sort_by_type, moviesName: form.folder_movies_name, seriesName: form.folder_series_name })}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Episode Dir */}
                      <div>
                        <Switch
                          id="folder_create_episode_dir"
                          checked={form.folder_create_episode_dir}
                          onChange={handleCheckboxChange('folder_create_episode_dir')}
                        >
                          {t('settingsPage.sections.folderStructure.createEpisodeDir')}
                        </Switch>
                        <span className="ui-field__hint" style={{ marginTop: '-8px', display: 'block', marginBottom: '8px' }}>
                          {t('settingsPage.sections.folderStructure.createEpisodeDirHint')}
                        </span>

                        {form.folder_create_episode_dir && (
                          <div style={{ marginTop: '12px', marginLeft: '24px' }}>
                            <Input
                              inputRef={folderEpisodeInputRef}
                              label={t('settingsPage.sections.folderStructure.episodeTemplate')}
                              value={form.folder_episode_template}
                              onChange={handleChange('folder_episode_template')}
                              placeholder="{series_title} - {season}{episode}"
                            />
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                              {FOLDER_EPISODE_TAGS.map(tag => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => insertTag('folder_episode_template', folderEpisodeInputRef, tag)}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    background: 'rgba(255, 255, 255, 0.04)',
                                    border: '1px solid var(--color-line)',
                                    color: 'var(--color-text-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                                    e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                    e.currentTarget.style.borderColor = 'var(--color-line)';
                                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                                  }}
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                            {form.folder_episode_template && (
                              <div style={{
                                fontSize: '11px',
                                color: 'var(--color-accent, #0088ff)',
                                background: 'rgba(0, 136, 255, 0.05)',
                                border: '1px solid rgba(0, 136, 255, 0.12)',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                marginTop: '10px',
                                fontFamily: 'monospace',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}>
                                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                                <span>{generatePreview(form.folder_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false, { enabled: form.folder_sort_by_type, moviesName: form.folder_movies_name, seriesName: form.folder_series_name })}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </Stack>
                  </Card>
                )}
              </Stack>
            )}

            {activeTab === 'rules' && (
              <Card
                title={t('settingsPage.sections.rules.title')}
                eyebrow={t('settingsPage.sections.rules.eyebrow')}
              >
                <Stack>
                  <Dropdown
                    label={t('settingsPage.sections.rules.collisionStrategy')}
                    value={form.collision_strategy}
                    options={collisionOptions}
                    onChange={handleChange('collision_strategy')}
                  />
                  {form.collision_strategy === 'replace_if_better' && (
                    <Input
                      label={t('settingsPage.sections.rules.durationTolerance')}
                      value={form.collision_duration_tolerance_seconds}
                      onChange={handleChange('collision_duration_tolerance_seconds')}
                      placeholder={t('settingsPage.sections.rules.durationTolerancePlaceholder')}
                      type="number"
                      min="0"
                    />
                  )}
                </Stack>
              </Card>
            )}

            {activeTab === 'collections' && (
              <Card
                title={t('settingsPage.sections.collections.title')}
                eyebrow={t('settingsPage.sections.collections.eyebrow')}
              >
                <Stack>
                  <Switch
                    id="folder_create_collection_dir"
                    checked={form.folder_create_collection_dir}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm(prev => {
                        const next = { ...prev, folder_create_collection_dir: checked };
                        if (checked && (next.folder_collection_mode === 'never' || !next.folder_collection_mode)) {
                          next.folder_collection_mode = 'threshold';
                        }
                        return next;
                      });
                    }}
                  >
                    {t('settingsPage.sections.collections.createCollectionDir')}
                  </Switch>
                  <span className="ui-field__hint" style={{ marginTop: '-8px', marginBottom: '16px' }}>
                    {t('settingsPage.sections.collections.createCollectionDirHint')}
                  </span>

                  {form.folder_create_collection_dir && (
                    <>
                      <Dropdown
                        label={t('settingsPage.sections.collections.collectionMode')}
                        value={form.folder_collection_mode}
                        options={collectionModeOptions}
                        onChange={handleChange('folder_collection_mode')}
                        hint={t('settingsPage.sections.collections.collectionModeHint')}
                      />

                      {form.folder_collection_mode === 'threshold' && (
                        <div style={{ marginTop: '16px' }}>
                          <Input
                            label={t('settingsPage.sections.collections.collectionThreshold')}
                            value={form.folder_collection_threshold}
                            onChange={handleChange('folder_collection_threshold')}
                            placeholder="3"
                            type="number"
                            min="1"
                            hint={t('settingsPage.sections.collections.collectionThresholdHint')}
                          />
                        </div>
                      )}

                      <div style={{ marginTop: '16px' }}>
                        <Input
                          inputRef={folderCollectionInputRef}
                          label={t('settingsPage.sections.collections.collectionTemplate')}
                          value={form.folder_collection_template}
                          onChange={handleChange('folder_collection_template')}
                          placeholder="{collection}"
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                          <button
                            type="button"
                            onClick={() => insertTag('folder_collection_template', folderCollectionInputRef, '{collection}')}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              background: 'rgba(255, 255, 255, 0.04)',
                              border: '1px solid var(--color-line)',
                              color: 'var(--color-text-secondary)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                              e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                              e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                              e.currentTarget.style.borderColor = 'var(--color-line)';
                              e.currentTarget.style.color = 'var(--color-text-secondary)';
                            }}
                          >
                            {'{collection}'}
                          </button>
                        </div>
                        {form.folder_collection_template && (
                          <div style={{
                            fontSize: '11px',
                            color: 'var(--color-accent, #0088ff)',
                            background: 'rgba(0, 136, 255, 0.05)',
                            border: '1px solid rgba(0, 136, 255, 0.12)',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            marginTop: '10px',
                            fontFamily: 'monospace',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}>
                            <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                            <span>{generatePreview(form.folder_collection_template, 'collection', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false, { enabled: form.folder_sort_by_type, moviesName: form.folder_movies_name, seriesName: form.folder_series_name })}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </Stack>
              </Card>
            )}

            {activeTab === 'extras' && (
              <Stack gap="xl">
                {/* General Card */}
                <Card
                  title={t('settingsPage.sections.extras.title')}
                  eyebrow={t('settingsPage.sections.extras.eyebrow')}
                >
                  <Stack gap="lg">
                    <Switch
                      id="extras_enabled"
                      checked={form.extras_enabled}
                      onChange={handleCheckboxChange('extras_enabled')}
                    >
                      {t('settingsPage.sections.extras.extrasEnabled')}
                    </Switch>
                    <span className="ui-field__hint" style={{ marginTop: '-8px', marginBottom: '12px' }}>
                      {t('settingsPage.sections.extras.extrasEnabledHint')}
                    </span>

                    {form.extras_enabled && (
                      <>
                        {form.folder_move_to_library ? (
                          <>
                            <Dropdown
                              label={t('settingsPage.sections.extras.folderModeLabel')}
                              hint={t('settingsPage.sections.extras.folderModeHint')}
                              value={form.extras_folder_mode}
                              options={extrasFolderModeOptions}
                              onChange={handleChange('extras_folder_mode')}
                            />

                            {form.extras_folder_mode === 'subfolder' && (
                              <Input
                                label={t('settingsPage.sections.extras.subfolderName')}
                                value={form.extras_subfolder_name}
                                onChange={handleChange('extras_subfolder_name')}
                                placeholder="Extras"
                              />
                            )}
                          </>
                        ) : (
                          <div style={{
                            padding: '12px 16px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid var(--color-line)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-muted)',
                            fontSize: '13px',
                            lineHeight: '1.5'
                          }}>
                            {t('settingsPage.sections.extras.inplaceInfo')}
                          </div>
                        )}
                      </>
                    )}
                  </Stack>
                </Card>

                {form.extras_enabled && (
                  <>
                    {/* Extension Lists Card */}
                    <Card
                      title={t('settingsPage.sections.extras.extensionsTitle')}
                      eyebrow={t('settingsPage.sections.extras.extensionsEyebrow')}
                    >
                      <Stack gap="md">
                        <Input
                          label={t('settingsPage.sections.extras.subExts')}
                          value={form.extras_sub_exts}
                          onChange={handleChange('extras_sub_exts')}
                          placeholder=".srt, .sub, .ass"
                        />
                        <Input
                          label={t('settingsPage.sections.extras.audioExts')}
                          value={form.extras_audio_exts}
                          onChange={handleChange('extras_audio_exts')}
                          placeholder=".mka, .ac3, .dts"
                        />
                        <Input
                          label={t('settingsPage.sections.extras.imgExts')}
                          value={form.extras_img_exts}
                          onChange={handleChange('extras_img_exts')}
                          placeholder=".jpg, .png, .gif"
                        />
                        <Input
                          label={t('settingsPage.sections.extras.metaExts')}
                          value={form.extras_meta_exts}
                          onChange={handleChange('extras_meta_exts')}
                          placeholder=".nfo, .xml, .txt"
                        />
                      </Stack>
                    </Card>

                    {/* Renaming & Templates Card */}
                    <Card
                      title={t('settingsPage.sections.extras.rulesTitle')}
                      eyebrow={t('settingsPage.sections.extras.rulesEyebrow')}
                    >
                      <Stack gap="xl">
                        {/* Video Extra */}
                        <div>
                          <Dropdown
                            label={t('settingsPage.sections.extras.extraVideoAction')}
                            value={form.extras_video_action}
                            options={extraActionOptions}
                            onChange={handleChange('extras_video_action')}
                          />
                          {form.extras_video_action === 'rename' && (
                            <div style={{ marginTop: '12px', marginLeft: '24px' }}>
                              <Input
                                inputRef={extraVideoInputRef}
                                label={t('settingsPage.sections.extras.extraVideoTemplate')}
                                value={form.extras_video_template}
                                onChange={handleChange('extras_video_template')}
                                placeholder="{parent_name}-{sub_category}"
                              />
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                {EXTRA_VIDEO_TAGS.map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => insertTag('extras_video_template', extraVideoInputRef, tag)}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      background: 'rgba(255, 255, 255, 0.04)',
                                      border: '1px solid var(--color-line)',
                                      color: 'var(--color-text-secondary)',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                                      e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                                      e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                      e.currentTarget.style.borderColor = 'var(--color-line)';
                                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                                    }}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                              {form.extras_video_template && (
                                <div style={{
                                  fontSize: '11px',
                                  color: 'var(--color-accent, #0088ff)',
                                  background: 'rgba(0, 136, 255, 0.05)',
                                  border: '1px solid rgba(0, 136, 255, 0.12)',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  marginTop: '10px',
                                  fontFamily: 'monospace',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}>
                                  <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                                  <span>{generatePreview(form.extras_video_template, 'extraVideo', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Subtitle Extra */}
                        <div>
                          <Dropdown
                            label={t('settingsPage.sections.extras.subtitleAction')}
                            value={form.extras_sub_action}
                            options={extraActionOptions}
                            onChange={handleChange('extras_sub_action')}
                          />
                          {form.extras_sub_action === 'rename' && (
                            <div style={{ marginTop: '12px', marginLeft: '24px' }}>
                              <Input
                                inputRef={extraSubInputRef}
                                label={t('settingsPage.sections.extras.subtitleTemplate')}
                                value={form.extras_sub_template}
                                onChange={handleChange('extras_sub_template')}
                                placeholder="{parent_name}.{language}"
                              />
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                {EXTRA_SUB_TAGS.map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => insertTag('extras_sub_template', extraSubInputRef, tag)}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      background: 'rgba(255, 255, 255, 0.04)',
                                      border: '1px solid var(--color-line)',
                                      color: 'var(--color-text-secondary)',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                                      e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                                      e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                      e.currentTarget.style.borderColor = 'var(--color-line)';
                                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                                    }}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                              {form.extras_sub_template && (
                                <div style={{
                                  fontSize: '11px',
                                  color: 'var(--color-accent, #0088ff)',
                                  background: 'rgba(0, 136, 255, 0.05)',
                                  border: '1px solid rgba(0, 136, 255, 0.12)',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  marginTop: '10px',
                                  fontFamily: 'monospace',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}>
                                  <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                                  <span>{generatePreview(form.extras_sub_template, 'extraSub', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Audio Extra */}
                        <div>
                          <Dropdown
                            label={t('settingsPage.sections.extras.audioAction')}
                            value={form.extras_audio_action}
                            options={extraActionOptions}
                            onChange={handleChange('extras_audio_action')}
                          />
                          {form.extras_audio_action === 'rename' && (
                            <div style={{ marginTop: '12px', marginLeft: '24px' }}>
                              <Input
                                inputRef={extraAudioInputRef}
                                label={t('settingsPage.sections.extras.audioTemplate')}
                                value={form.extras_audio_template}
                                onChange={handleChange('extras_audio_template')}
                                placeholder="{parent_name}.{language}"
                              />
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                {EXTRA_AUDIO_TAGS.map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => insertTag('extras_audio_template', extraAudioInputRef, tag)}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      background: 'rgba(255, 255, 255, 0.04)',
                                      border: '1px solid var(--color-line)',
                                      color: 'var(--color-text-secondary)',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                                      e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                                      e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                      e.currentTarget.style.borderColor = 'var(--color-line)';
                                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                                    }}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                              {form.extras_audio_template && (
                                <div style={{
                                  fontSize: '11px',
                                  color: 'var(--color-accent, #0088ff)',
                                  background: 'rgba(0, 136, 255, 0.05)',
                                  border: '1px solid rgba(0, 136, 255, 0.12)',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  marginTop: '10px',
                                  fontFamily: 'monospace',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}>
                                  <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                                  <span>{generatePreview(form.extras_audio_template, 'extraAudio', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Image Extra */}
                        <div>
                          <Dropdown
                            label={t('settingsPage.sections.extras.imageAction')}
                            value={form.extras_img_action}
                            options={extraActionOptions}
                            onChange={handleChange('extras_img_action')}
                          />
                          {form.extras_img_action === 'rename' && (
                            <div style={{ marginTop: '12px', marginLeft: '24px' }}>
                              <Input
                                inputRef={extraImgInputRef}
                                label={t('settingsPage.sections.extras.imageTemplate')}
                                value={form.extras_img_template}
                                onChange={handleChange('extras_img_template')}
                                placeholder="{sub_category}"
                              />
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                {EXTRA_IMG_TAGS.map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => insertTag('extras_img_template', extraImgInputRef, tag)}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      background: 'rgba(255, 255, 255, 0.04)',
                                      border: '1px solid var(--color-line)',
                                      color: 'var(--color-text-secondary)',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                                      e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                                      e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                      e.currentTarget.style.borderColor = 'var(--color-line)';
                                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                                    }}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                              {form.extras_img_template && (
                                <div style={{
                                  fontSize: '11px',
                                  color: 'var(--color-accent, #0088ff)',
                                  background: 'rgba(0, 136, 255, 0.05)',
                                  border: '1px solid rgba(0, 136, 255, 0.12)',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  marginTop: '10px',
                                  fontFamily: 'monospace',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}>
                                  <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                                  <span>{generatePreview(form.extras_img_template, 'extraImg', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Metadata Extra */}
                        <div>
                          <Dropdown
                            label={t('settingsPage.sections.extras.metadataAction')}
                            value={form.extras_meta_action}
                            options={extraActionOptions}
                            onChange={handleChange('extras_meta_action')}
                          />
                          {form.extras_meta_action === 'rename' && (
                            <div style={{ marginTop: '12px', marginLeft: '24px' }}>
                              <Input
                                inputRef={extraMetaInputRef}
                                label={t('settingsPage.sections.extras.metadataTemplate')}
                                value={form.extras_meta_template}
                                onChange={handleChange('extras_meta_template')}
                                placeholder="{parent_name}"
                              />
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                {EXTRA_META_TAGS.map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => insertTag('extras_meta_template', extraMetaInputRef, tag)}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      background: 'rgba(255, 255, 255, 0.04)',
                                      border: '1px solid var(--color-line)',
                                      color: 'var(--color-text-secondary)',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'rgba(0, 136, 255, 0.08)';
                                      e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.4)';
                                      e.currentTarget.style.color = 'var(--color-accent, #0088ff)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                      e.currentTarget.style.borderColor = 'var(--color-line)';
                                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                                    }}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                              {form.extras_meta_template && (
                                <div style={{
                                  fontSize: '11px',
                                  color: 'var(--color-accent, #0088ff)',
                                  background: 'rgba(0, 136, 255, 0.05)',
                                  border: '1px solid rgba(0, 136, 255, 0.12)',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  marginTop: '10px',
                                  fontFamily: 'monospace',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}>
                                  <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 136, 255, 0.15)' }}>{t('settingsPage.sections.organization.previewBadge')}</span>
                                  <span>{generatePreview(form.extras_meta_template, 'extraMeta', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </Stack>
                    </Card>
                  </>
                )}
              </Stack>
            )}

            {activeTab === 'apiKeys' && (
              <Card
                title={t('settingsPage.sections.api.title')}
                eyebrow={t('settingsPage.sections.api.eyebrow')}
              >
                <Stack gap="xl">
                  {/* TMDB Section */}
                  <Stack gap="md">
                    <h3 style={{ color: 'var(--color-accent)', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                      {t('settingsPage.sections.api.tmdbHeader')}
                    </h3>
                    <Input
                      label={t('settingsPage.sections.api.tmdbKey')}
                      value={form.tmdb_api_key}
                      onChange={handleChange('tmdb_api_key')}
                      placeholder={t('settingsPage.sections.api.tmdbKeyPlaceholder')}
                      type="password"
                    />
                    <Input
                      label={t('settingsPage.sections.api.tmdbToken')}
                      value={form.tmdb_bearer_token}
                      onChange={handleChange('tmdb_bearer_token')}
                      placeholder={t('settingsPage.sections.api.tmdbTokenPlaceholder')}
                      type="password"
                    />
                    
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.015)',
                      border: '1px solid var(--color-line)',
                      borderRadius: '8px',
                      padding: '16px',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      color: 'var(--color-text-secondary)',
                      marginTop: '8px'
                    }}>
                      <div style={{ fontWeight: '600', color: 'var(--color-ink)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {t('settingsPage.sections.api.tmdbStepsTitle')}
                      </div>
                      <ol style={{ paddingLeft: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <li>{t('settingsPage.sections.api.tmdbStep1Start')}<a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>themoviedb.org</a>{t('settingsPage.sections.api.tmdbStep1End')}</li>
                        <li>{t('settingsPage.sections.api.tmdbStep2Start')}<a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>{t('settingsPage.sections.api.tmdbStep2Link')}</a>{t('settingsPage.sections.api.tmdbStep2End')}</li>
                        <li>{t('settingsPage.sections.api.tmdbStep3Start')}<strong>{t('settingsPage.sections.api.tmdbStep3Bold1')}</strong>{t('settingsPage.sections.api.tmdbStep3Mid')}<strong>{t('settingsPage.sections.api.tmdbStep3Bold2')}</strong>{t('settingsPage.sections.api.tmdbStep3End')}</li>
                        <li>{t('settingsPage.sections.api.tmdbStep4Start')}<strong>{t('settingsPage.sections.api.tmdbStep4Bold1')}</strong>{t('settingsPage.sections.api.tmdbStep4Mid')}<strong>{t('settingsPage.sections.api.tmdbStep4Bold2')}</strong>{t('settingsPage.sections.api.tmdbStep4End')}</li>
                      </ol>
                    </div>
                  </Stack>
 
                  <hr style={{ border: 'none', borderTop: '1px solid var(--color-line)', margin: '8px 0' }} />
 
                  {/* OMDb Section */}
                  <Stack gap="md">
                    <h3 style={{ color: 'var(--color-accent)', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                      {t('settingsPage.sections.api.omdbHeader')}
                    </h3>
                    <Input
                      label={t('settingsPage.sections.api.omdbKey')}
                      value={form.omdb_api_key}
                      onChange={handleChange('omdb_api_key')}
                      placeholder={t('settingsPage.sections.api.omdbKeyPlaceholder')}
                      type="password"
                    />
 
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.015)',
                      border: '1px solid var(--color-line)',
                      borderRadius: '8px',
                      padding: '16px',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      color: 'var(--color-text-secondary)',
                      marginTop: '8px'
                    }}>
                      <div style={{ fontWeight: '600', color: 'var(--color-ink)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {t('settingsPage.sections.api.omdbStepsTitle')}
                      </div>
                      <ol style={{ paddingLeft: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <li>{t('settingsPage.sections.api.omdbStep1Start')}<a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>{t('settingsPage.sections.api.omdbStep1Link')}</a>{t('settingsPage.sections.api.omdbStep1End')}</li>
                        <li>{t('settingsPage.sections.api.omdbStep2Start')}<strong>{t('settingsPage.sections.api.omdbStep2Bold')}</strong>{t('settingsPage.sections.api.omdbStep2End')}</li>
                        <li>{t('settingsPage.sections.api.omdbStep3')}</li>
                        <li><strong>{t('settingsPage.sections.api.omdbStep4Bold')}</strong>{t('settingsPage.sections.api.omdbStep4End')}</li>
                      </ol>
                    </div>
                  </Stack>
                </Stack>
              </Card>
            )}

            {activeTab === 'advanced' && (
              <>
                <Card
                  title={t('settingsPage.sections.advanced.title')}
                  eyebrow={t('settingsPage.sections.advanced.eyebrow')}
                >
                  <Stack>
                    <Input
                      label={t('settingsPage.sections.advanced.minVideoSizeMb')}
                      hint={t('settingsPage.sections.advanced.minVideoSizeMbHint')}
                      value={form.min_video_size_mb}
                      onChange={handleChange('min_video_size_mb')}
                      type="number"
                      min="0"
                    />
                    <Input
                      label={t('settingsPage.sections.advanced.minVideoDurationMinutes')}
                      hint={t('settingsPage.sections.advanced.minVideoDurationMinutesHint')}
                      value={form.min_video_duration_minutes}
                      onChange={handleChange('min_video_duration_minutes')}
                      type="number"
                      min="0"
                    />
                  </Stack>
                </Card>

                <Card
                  title={t('settingsPage.sections.advancedLanguage.title')}
                  eyebrow={t('settingsPage.sections.advancedLanguage.eyebrow')}
                >
                  <Stack>
                    <Switch
                      id="follow_app_language_for_media_library"
                      checked={form.follow_app_language_for_media_library}
                      onChange={handleCheckboxChange('follow_app_language_for_media_library')}
                    >
                      {t('settingsPage.sections.advancedLanguage.metadataFollowsUi')}
                    </Switch>
                    <span className="ui-field__hint" style={{ marginTop: '-8px', marginBottom: '8px' }}>
                      {t('settingsPage.sections.advancedLanguage.metadataFollowsUiHint')}
                    </span>
                    {!form.follow_app_language_for_media_library && (
                      <>
                        <Dropdown
                          label={t('settingsPage.sections.advancedLanguage.metadataLanguage')}
                          hint={t('settingsPage.sections.advancedLanguage.metadataLanguageHint')}
                          value={form.primary_metadata_language}
                          options={metadataLanguageOptions}
                          onChange={handleChange('primary_metadata_language')}
                          style={{ marginLeft: '24px', marginBottom: '12px' }}
                        />
                        <Dropdown
                          label={t('settingsPage.sections.advancedLanguage.fallbackMetadataLanguage')}
                          hint={t('settingsPage.sections.advancedLanguage.fallbackMetadataLanguageHint')}
                          value={form.fallback_metadata_language}
                          options={metadataLanguageOptions}
                          onChange={handleChange('fallback_metadata_language')}
                          style={{ marginLeft: '24px', marginBottom: '12px' }}
                        />
                      </>
                    )}
                    <Switch
                      id="follow_app_language_for_naming"
                      checked={form.follow_app_language_for_naming}
                      onChange={handleCheckboxChange('follow_app_language_for_naming')}
                    >
                      {t('settingsPage.sections.advancedLanguage.targetFollowsUi')}
                    </Switch>
                    <span className="ui-field__hint" style={{ marginTop: '-8px', marginBottom: '8px' }}>
                      {t('settingsPage.sections.advancedLanguage.targetFollowsUiHint')}
                    </span>
                    {!form.follow_app_language_for_naming && (
                      <Dropdown
                        label={t('settingsPage.sections.advancedLanguage.targetLanguage')}
                        hint={t('settingsPage.sections.advancedLanguage.targetLanguageHint')}
                        value={form.default_target_language}
                        options={targetLanguageOptions}
                        onChange={handleChange('default_target_language')}
                        style={{ marginLeft: '24px' }}
                      />
                    )}
                  </Stack>
                </Card>
              </>
            )}

            {activeTab === 'maintenance' && (
              <Stack gap="xl">
                <Card
                  title={t('settingsPage.sections.backup.title') || "Backup & Restore"}
                  eyebrow={t('settingsPage.sections.backup.eyebrow') || "System Settings"}
                >
                  <Stack>
                    <span className="ui-field__hint">
                      {t('settingsPage.sections.backup.description') || "Export your current RENDA settings to a JSON file or import settings from a previously saved backup."}
                    </span>
                    <Inline gap="md" style={{ marginTop: '10px', justifyContent: 'flex-end' }}>
                      <Button variant="secondary" onClick={handleExportSettings} disabled={isSaving}>
                        {t('settingsPage.sections.backup.exportBtn') || "Export Settings"}
                      </Button>
                      <Button variant="secondary" onClick={handleImportClick} disabled={isSaving}>
                        {t('settingsPage.sections.backup.importBtn') || "Import Settings"}
                      </Button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImportSettings}
                        accept=".json"
                        style={{ display: 'none' }}
                      />
                    </Inline>
                  </Stack>
                </Card>

                <Card title={t('settingsPage.dangerZone.title')} eyebrow={t('settingsPage.dangerZone.eyebrow')} className="ui-card--danger">
                  <Stack>
                    <span className="ui-field__hint">
                      {t('settingsPage.dangerZone.desc')}
                    </span>
                    <Inline style={{ marginTop: '10px', justifyContent: 'flex-end' }}>
                      <Button variant="danger" onClick={handleWipeDatabase} disabled={isWiping || isSaving}>
                        {isWiping ? t('settingsPage.dangerZone.buttonWiping') : t('settingsPage.dangerZone.button')}
                      </Button>
                    </Inline>
                  </Stack>
                </Card>
              </Stack>
            )}
          </Stack>
        </div>
      </main>

      <FloatingActionBar
        visible={isDirty}
        title={t('settingsPage.unsavedChanges.title')}
        actions={[
          {
            key: 'reset',
            label: t('settingsPage.unsavedChanges.reset'),
            onClick: handleReset,
            disabled: isSaving,
          },
          {
            key: 'save',
            label: isSaving ? t('settingsPage.sections.api.saving') : t('settingsPage.unsavedChanges.save'),
            onClick: handleSave,
            disabled: isSaving,
            className: 'settings-floating-save',
          },
        ]}
      />
    </div>
  );
}

