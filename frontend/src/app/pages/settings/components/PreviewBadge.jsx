export default function PreviewBadge({ previewText, t }) {
  if (!previewText) return null;
  return (
    <div className="preview-badge-container">
      <span className="preview-badge-label">
        {t('settingsPage.sections.organization.previewBadge')}
      </span>
      <span className="preview-badge-text">{previewText}</span>
    </div>
  );
}
