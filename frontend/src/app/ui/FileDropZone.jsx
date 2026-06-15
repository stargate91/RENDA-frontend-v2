import { useTranslation } from '../providers/LanguageContext';
import { useDropzone } from './useDropzone';

export default function FileDropZone({
  children,
  onDropPaths,
  disabled = false,
  label,
  description,
  className = '',
}) {
  const { t } = useTranslation();
  const displayLabel = label ?? t('dropzone.label');
  const displayDescription = description ?? t('dropzone.description');

  const { dropzoneProps, isDropActive } = useDropzone({
    disabled,
    onDropPaths,
  });

  return (
    <div className={`ui-file-drop-zone ${className}`.trim()} {...dropzoneProps}>
      <div className={`organizer-drop-overlay ${isDropActive ? 'is-active' : ''}`}>
        <div className="organizer-drop-overlay__panel">
          <span className="organizer-drop-overlay__label">{displayLabel}</span>
          <span className="organizer-drop-overlay__description">{displayDescription}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
