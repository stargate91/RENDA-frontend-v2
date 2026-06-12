import { useCallback } from 'react';

export default function useTemplateTagInsertion(form, setForm) {
  return useCallback((fieldKey, inputRef, tag) => {
    const input = inputRef.current;
    if (!input) return;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const currentValue = form[fieldKey] || '';
    const nextValue = currentValue.substring(0, start) + tag + currentValue.substring(end);

    setForm((prev) => ({ ...prev, [fieldKey]: nextValue }));

    setTimeout(() => {
      input.focus();
      const nextPosition = start + tag.length;
      input.setSelectionRange(nextPosition, nextPosition);
    }, 0);
  }, [form, setForm]);
}
