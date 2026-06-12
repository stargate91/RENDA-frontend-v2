import { useMemo } from 'react';
import {
  COLLISION_OPTIONS,
  EXTRA_ACTION_OPTIONS,
  COLLECTION_MODE_OPTIONS,
  EXTRAS_FOLDER_MODE_OPTIONS,
  CASING_OPTIONS,
  SEPARATOR_OPTIONS
} from '../settingsFieldOptions.js';
import {
  METADATA_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
} from '../settingsLanguageOptions.js';

export default function useSettingsOptions(t) {
  const appLanguageOptions = useMemo(() => [
    { value: 'en', label: t('languages.en') },
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

  return {
    appLanguageOptions,
    metadataLanguageOptions,
    targetLanguageOptions,
    closeBehaviorOptions,
    collisionOptions,
    extraActionOptions,
    themeOptions,
    collectionModeOptions,
    extrasFolderModeOptions,
    casingOptions,
    separatorOptions,
  };
}
