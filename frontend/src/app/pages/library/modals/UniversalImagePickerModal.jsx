import { useState } from 'react';
import SegmentedControl from '@/ui/SegmentedControl';
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
import { Upload, Check } from 'lucide-react';

export default function UniversalImagePickerModal({
  entityId,
  tmdbId,
  imageType = 'backdrop', // 'backdrop' | 'poster' | 'profile' | 'logo'
  entityType = 'movie', // 'movie' | 'tv' | 'person' | 'collection'
  currentPath,
  t,
  toast,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState('tmdb');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [urlInput, setUrlInput] = useState('');

  // Load appropriate mutations
  const overrideBackdropMutation = useOverrideBackdropMutation();
  const overridePosterMutation = useOverridePosterMutation();
  const uploadPosterMutation = useUploadPosterMutation();
  const overrideLogoMutation = useOverrideLogoMutation();
  const uploadLogoMutation = useUploadLogoMutation();
  const overridePersonProfileMutation = useOverridePersonProfileMutation();
  const uploadPersonProfileMutation = useUploadPersonProfileMutation();

  const handleSelectTmdbImage = async (path) => {
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
          file: file,
        });
      } else if (imageType === 'logo') {
        await uploadLogoMutation.mutateAsync({
          itemId: entityId,
          file: file,
        });
      } else if (imageType === 'profile' && entityType === 'person') {
        await uploadPersonProfileMutation.mutateAsync({
          personId: entityId,
          file: file,
        });
      }
      toast(t?.('library.details.imageUploaded') || 'Image uploaded and updated successfully!', 'success');
      onClose?.();
    } catch (err) {
      toast(err.message || t?.('library.details.imageUploadFailed') || 'Failed to upload image', 'danger');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
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

  const showUploadTab = imageType !== 'backdrop'; // Backdrops typically are not custom uploaded

  return (
    <div className="person-backdrop-picker" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {showUploadTab && (
        <SegmentedControl
          ariaLabel="Image Source"
          options={[
            { value: 'tmdb', label: t?.('library.details.tmdbOptions') || 'TMDB Options' },
            { value: 'upload', label: t?.('library.details.uploadCustom') || 'Upload Custom' },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      )}

      {activeTab === 'tmdb' ? (
        <div style={{ flex: '1 1 auto', overflowY: 'auto', maxHeight: '60vh' }}>
          <TMDBImageGrid
            itemId={entityId}
            tmdbId={tmdbId}
            mediaType={entityType}
            imageType={imageType === 'profile' ? 'poster' : imageType} // profile images are queried as posters/profiles
            currentPath={currentPath}
            onSelect={handleSelectTmdbImage}
            isPending={isPending}
            t={t}
          />
        </div>
      ) : (
        <div className="create-tag-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'stretch', width: '100%', padding: '16px 0' }}>
          {uploadPreview ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ position: 'relative', width: '180px', height: imageType === 'logo' ? '90px' : '270px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
                <img
                  src={uploadPreview}
                  alt="Upload preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {isPending && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', color: '#fff' }}>
                    <span>{t?.('common.uploading') || 'Uploading...'}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '180px',
                border: '2px dashed var(--color-border-subtle)',
                borderRadius: '8px',
                cursor: isPending ? 'not-allowed' : 'pointer',
                gap: '8px',
                color: 'var(--color-text-muted)',
              }}
            >
              <Upload size={32} />
              <span>{t?.('library.details.clickToUpload') || 'Click or drag file to upload'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={isPending}
                style={{ display: 'none' }}
              />
            </label>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>
              {t?.('library.tags.imageUrlPlaceholder') || 'OR PASTE IMAGE URL'}
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', width: '100%' }}>
              <Input
                placeholder="https://example.com/image.jpg"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={isPending}
                style={{ flex: 1 }}
                className="image-picker-url-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (urlInput.trim()) {
                      void handleSelectTmdbImage(urlInput.trim());
                    }
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (urlInput.trim()) {
                    void handleSelectTmdbImage(urlInput.trim());
                  }
                }}
                disabled={!urlInput.trim() || isPending}
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: 'var(--color-accent-blue)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 600,
                  height: '48px', // Match Renda's Input height
                  boxSizing: 'border-box',
                  opacity: (!urlInput.trim() || isPending) ? 0.6 : 1,
                }}
              >
                {t?.('common.save') || 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
