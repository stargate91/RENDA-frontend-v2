import { EXTRAS_FOLDER_MODES, FOLDER_COLLECTION_MODES } from './settingsConstants.js';

export const COLLISION_OPTIONS = [
  { value: 'keep_both', label: 'Keep Both' },
  { value: 'skip', label: 'Skip' },
  { value: 'replace_if_better', label: 'Replace If Better' },
  { value: 'replace', label: 'Replace Always' },
];

export const EXTRA_ACTION_OPTIONS = [
  { value: 'rename', label: 'Rename' },
  { value: 'ignore', label: 'Skip' },
  { value: 'delete', label: 'Delete' },
];

export const COLLECTION_MODE_OPTIONS = [
  { value: FOLDER_COLLECTION_MODES.ALWAYS, label: 'Always' },
  { value: FOLDER_COLLECTION_MODES.THRESHOLD, label: 'Threshold' },
  { value: FOLDER_COLLECTION_MODES.COMPLETE_ONLY, label: 'Complete Collection' },
];

export const CASING_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'lower', label: 'Lower Case' },
  { value: 'upper', label: 'Upper Case' },
  { value: 'title', label: 'Title Case' },
];

export const SEPARATOR_OPTIONS = [
  { value: 'space', label: 'Space' },
  { value: 'dot', label: 'Dot' },
  { value: 'dash', label: 'Dash' },
  { value: 'underscore', label: 'Underscore' },
];

export const EXTRAS_FOLDER_MODE_OPTIONS = [
  { value: EXTRAS_FOLDER_MODES.SUBFOLDER, label: 'Grouped in subfolder' },
  { value: EXTRAS_FOLDER_MODES.FLAT, label: 'Flat (next to media)' },
];
