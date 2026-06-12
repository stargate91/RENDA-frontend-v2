import Input from '@/ui/Input';
import TemplateTagSelector from './TemplateTagSelector.jsx';
import PreviewBadge from './PreviewBadge.jsx';

export default function TemplateFieldSection({
  t,
  inputRef,
  label,
  hint,
  value,
  onChange,
  placeholder,
  tags,
  fieldKey,
  insertTag,
  previewText,
  className = '',
}) {
  return (
    <div className={className}>
      <Input
        inputRef={inputRef}
        label={label}
        hint={hint}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <TemplateTagSelector
        t={t}
        tags={tags}
        fieldKey={fieldKey}
        inputRef={inputRef}
        insertTag={insertTag}
      />
      {value && (
        <PreviewBadge
          t={t}
          previewText={previewText}
        />
      )}
    </div>
  );
}
