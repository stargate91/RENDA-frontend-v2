import { useCallback } from 'react';
import { generatePreview } from '../settingsPreview.js';

export default function useTemplatePreview(form) {
  return useCallback((template, type, options = {}) => {
    const { isFile = true, sortOptions = null } = options;

    return generatePreview(
      template,
      type,
      form.naming_filename_casing,
      form.naming_word_separator,
      form.naming_custom_tag,
      isFile,
      sortOptions
    );
  }, [
    form.naming_custom_tag,
    form.naming_filename_casing,
    form.naming_word_separator,
  ]);
}
