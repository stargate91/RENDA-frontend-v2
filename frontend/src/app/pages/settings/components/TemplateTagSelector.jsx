import TagButton from '@/ui/TagButton';

export default function TemplateTagSelector({ t, tags, fieldKey, inputRef, insertTag, disabled }) {
  const commonTags = tags.common || [];
  const allTags = tags.all || tags;
  const additionalTags = allTags.filter((tag) => !commonTags.includes(tag));

  return (
    <div className="template-tag-selector">
      {commonTags.length > 0 && (
        <div className="template-tag-selector-group">
          <div className="template-tag-selector-label">
            {t('settingsPage.templateTags.common')}
          </div>
          <div className="template-tag-selector-container">
            {commonTags.map((tag) => (
              <TagButton
                key={tag}
                disabled={disabled}
                onClick={disabled ? undefined : () => insertTag(fieldKey, inputRef, tag)}
              >
                {tag}
              </TagButton>
            ))}
          </div>
        </div>
      )}
      {additionalTags.length > 0 && (
        <div className="template-tag-selector-group">
          <div className="template-tag-selector-label">
            {t('settingsPage.templateTags.more')}
          </div>
          <div className="template-tag-selector-container">
            {additionalTags.map((tag) => (
              <TagButton
                key={tag}
                disabled={disabled}
                onClick={disabled ? undefined : () => insertTag(fieldKey, inputRef, tag)}
              >
                {tag}
              </TagButton>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
