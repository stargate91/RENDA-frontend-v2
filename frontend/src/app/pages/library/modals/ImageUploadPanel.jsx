import { useRef, useState } from 'react';
import { Link2, Upload } from 'lucide-react';
import Input from '@/ui/Input';
import './UniversalImagePickerModal.css';

export default function ImageUploadPanel({
  imageType,
  isPending,
  t,
  onSaveUrl,
  onUploadFile,
}) {
  const fileInputRef = useRef(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [urlInput, setUrlInput] = useState('');

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadPreview(reader.result);
    };
    reader.readAsDataURL(file);

    void onUploadFile(file);
  };

  const handleSaveUrl = () => {
    const trimmedUrl = urlInput.trim();
    if (trimmedUrl) {
      void onSaveUrl(trimmedUrl);
    }
  };

  const hasUploadPreview = Boolean(uploadPreview);

  return (
    <section className="universal-image-picker__upload-panel">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={isPending}
        className="universal-image-picker__file-input"
      />

      <div className="universal-image-picker__url-row">
        <div className="universal-image-picker__url-input-shell">
          <Link2 size={15} />
          <Input
            placeholder="https://example.com/image.jpg"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            disabled={isPending}
            className="universal-image-picker__url-input"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSaveUrl();
              }
            }}
          />
        </div>

        <button
          type="button"
          onClick={handleSaveUrl}
          disabled={!urlInput.trim() || isPending}
          className="ui-button ui-button--secondary-neutral ui-button--md universal-image-picker__save-button"
        >
          {t?.('common.save') || 'Save'}
        </button>

        <button
          type="button"
          className="ui-button ui-button--secondary-neutral ui-button--md universal-image-picker__upload-button"
          disabled={isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={16} />
          <span>{t?.('library.details.uploadCustom') || 'Upload Custom'}</span>
        </button>
      </div>

      {hasUploadPreview || uploadFile || isPending ? (
        <div className="universal-image-picker__upload-status">
          {hasUploadPreview ? (
            <div className={`universal-image-picker__preview${imageType === 'logo' ? ' is-logo' : ''}${imageType === 'backdrop' ? ' is-backdrop' : ''}`}>
              <img
                src={uploadPreview}
                alt="Upload preview"
                className="universal-image-picker__preview-image"
              />
            </div>
          ) : null}

          <div className="universal-image-picker__status-copy">
            <strong>{uploadFile?.name || (t?.('common.uploading') || 'Uploading...')}</strong>
            <span>
              {isPending
                ? (t?.('common.uploading') || 'Uploading...')
                : (t?.('library.details.imageUploaded') || 'Image uploaded and updated successfully!')}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
