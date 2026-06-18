import { useEffect, useRef, useState } from 'react';
import TMDBImageGrid from '../components/entityDetail/TMDBImageGrid';
import Input from '@/ui/Input';
import {
  useOverrideBackdropMutation,
  useOverridePosterMutation,
  useUploadPosterMutation,
  useOverrideLogoMutation,
  useUploadLogoMutation,
} from '@/queries/mediaQueries';
import {
  useOverridePersonProfileMutation,
  useUploadPersonProfileMutation,
} from '@/queries/libraryQueries';
import { Upload, Link2 } from 'lucide-react';
import './UniversalImagePickerModal.css';

export default function UniversalImagePickerModal({
  entityId,
  tmdbId,
  imageType = 'backdrop',
  entityType = 'movie',
  currentPath,
  t,
  toast,
  onClose,
}) {
  const fileInputRef = useRef(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [urlInput, setUrlInput] = useState('');

  const overrideBackdropMutation = useOverrideBackdropMutation();
  const overridePosterMutation = useOverridePosterMutation();
  const uploadPosterMutation = useUploadPosterMutation();
  const overrideLogoMutation = useOverrideLogoMutation();
  const uploadLogoMutation = useUploadLogoMutation();
  const overridePersonProfileMutation = useOverridePersonProfileMutation();
  const uploadPersonProfileMutation = useUploadPersonProfileMutation();

  const [selectedPath, setSelectedPath] = useState(currentPath);

  useEffect(() => {
    setSelectedPath(currentPath);
  }, [currentPath]);

  const handleSelectTmdbImage = async (path) => {
    setSelectedPath(path);
    try {
      if (imageType === 'backdrop') {
        await overrideBackdropMutation.mutateAsync({
          itemId: entityId,
          backdropPath: path,
          mediaType: entityType,
        });
      } else if (imageType === 'poster') {
        await overridePosterMutation.mutateAsync({
          itemId: entityId,
          posterPath: path,
        });
      } else if (imageType === 'logo') {
        await overrideLogoMutation.mutateAsync({
          itemId: entityId,
          logoPath: path,
        });
      } else if (imageType === 'profile' && entityType === 'person') {
        await overridePersonProfileMutation.mutateAsync({
          personId: entityId,
          profilePath: path,
        });
      }
      toast(t?.('library.details.imageUpdated') || 'Image updated successfully!', 'success');
      onClose?.();
    } catch (err) {
      toast(err.message || t?.('library.details.imageUpdateFailed') || 'Failed to update image', 'danger');
    }
  };

  const handleUploadFile = async (file) => {
    if (!file) return;

    try {
      if (imageType === 'poster') {
        await uploadPosterMutation.mutateAsync({
          itemId: entityId,
          file,
        });
      } else if (imageType === 'logo') {
        await uploadLogoMutation.mutateAsync({
          itemId: entityId,
          file,
        });
      } else if (imageType === 'profile' && entityType === 'person') {
        await uploadPersonProfileMutation.mutateAsync({
          personId: entityId,
          file,
        });
      }
      toast(t?.('library.details.imageUploaded') || 'Image uploaded and updated successfully!', 'success');
      onClose?.();
    } catch (err) {
      toast(err.message || t?.('library.details.imageUploadFailed') || 'Failed to upload image', 'danger');
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadPreview(reader.result);
    };
    reader.readAsDataURL(file);

    void handleUploadFile(file);
  };

  const isPending =
    overrideBackdropMutation.isPending ||
    overridePosterMutation.isPending ||
    uploadPosterMutation.isPending ||
    overrideLogoMutation.isPending ||
    uploadLogoMutation.isPending ||
    overridePersonProfileMutation.isPending ||
    uploadPersonProfileMutation.isPending;

  const showUploadPanel = imageType !== 'backdrop';
  const hasUploadPreview = Boolean(uploadPreview);

  return (
    <div className="universal-image-picker">
      {showUploadPanel ? (
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
                    if (urlInput.trim()) {
                      void handleSelectTmdbImage(urlInput.trim());
                    }
                  }
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (urlInput.trim()) {
                  void handleSelectTmdbImage(urlInput.trim());
                }
              }}
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
                <div className={`universal-image-picker__preview${imageType === 'logo' ? ' is-logo' : ''}`}>
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
      ) : null}

      <div className="universal-image-picker__grid">
        <TMDBImageGrid
          itemId={entityId}
          tmdbId={tmdbId}
          mediaType={entityType}
          imageType={imageType === 'profile' ? 'poster' : imageType}
          currentPath={selectedPath}
          onSelect={handleSelectTmdbImage}
          isPending={isPending}
          t={t}
        />
      </div>
    </div>
  );
}
