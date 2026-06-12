import { useDropzone } from './useDropzone';

export default function FileDropZone({
  children,
  onDropPaths,
  disabled = false,
  label = 'Drop files or folders here',
  description = 'Drag and drop your media files right here to scan them.',
  className = '',
}) {
  const { dropzoneProps, isDropActive } = useDropzone({
    disabled,
    onDropPaths,
  });

  return (
    <div className={`ui-file-drop-zone ${className}`.trim()} {...dropzoneProps}>
      <div className={`organizer-drop-overlay ${isDropActive ? 'is-active' : ''}`}>
        <div className="organizer-drop-overlay__panel">
          <span className="organizer-drop-overlay__label">{label}</span>
          <span className="organizer-drop-overlay__description">{description}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
