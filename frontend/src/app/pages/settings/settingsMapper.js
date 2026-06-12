import { getInitialFormValues } from './settingsFormValues.js';

export function isSettingsDirty(form, settings, t) {
  if (!settings) {
    return false;
  }

  const initial = getInitialFormValues(settings, t);
  return Object.keys(form).some((key) => form[key] !== initial[key]);
}
