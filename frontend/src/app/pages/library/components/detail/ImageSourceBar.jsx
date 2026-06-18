import { useRef, useState } from 'react';
import { Link as LinkIcon, Upload } from 'lucide-react';
import Button from '@/ui/Button';
import Input from '@/ui/Input';

export default function ImageSourceBar({
  t,
  isPending = false,
  canUpload = true,
  onUploadFile,
  onSaveUrl,
  uploadLabel,
  urlPlaceholder,
  className = '',
}) {
  const fileInputRef = useRef(null);
  const [urlInput, setUrlInput] = useState('');

  const handleOpenFilePicker = () => {
    if (isPending || !canUpload) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file && onUploadFile) {
      void onUploadFile(file);
    }
  };

  const handleSaveUrl = () => {
    const value = urlInput.trim();
    if (!value || isPending || !onSaveUrl) return;
    void onSaveUrl(value);
  };

  return (
    <div className={`universal-image-picker__toolbar ${className}`.trim()}>
      {canUpload && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={isPending}
            className="universal-image-picker__file-input"
          />
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="universal-image-picker__action"
            onClick={handleOpenFilePicker}
            disabled={isPending}
          >
            <Upload size={14} />
            {uploadLabel || t?.('library.details.uploadCustom') || 'Upload Custom'}
          </Button>
        </>
      )}

      <div className="universal-image-picker__url-group">
        <div className="universal-image-picker__url-row">
          <Input
            placeholder={urlPlaceholder || `${t?.('library.tags.imageUrlPlaceholder') || 'Image URL'}...`}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            disabled={isPending}
            className="image-picker-url-input universal-image-picker__url-input"
            leftIcon={<LinkIcon size={13} />}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveUrl();
              }
            }}
          />
          <Button
            type="button"
            variant="primary"
            size="md"
            className="universal-image-picker__save-btn"
            onClick={handleSaveUrl}
            disabled={!urlInput.trim() || isPending}
          >
            {t?.('common.save') || 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
