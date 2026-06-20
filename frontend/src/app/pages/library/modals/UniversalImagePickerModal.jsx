import { useEffect, useState } from 'react';
import TMDBImageGrid from '../components/entityDetail/TMDBImageGrid';
import Dropdown from '@/ui/Dropdown';
import {
  useOverrideBackdropMutation,
  useUploadBackdropMutation,
  useOverridePosterMutation,
  useUploadPosterMutation,
  useOverrideLogoMutation,
  useUploadLogoMutation,
} from '@/queries/mediaQueries';
import {
  useOverridePersonProfileMutation,
  useUploadPersonProfileMutation,
} from '@/queries/libraryQueries';
import ImageUploadPanel from './ImageUploadPanel';
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
  externalIds,
}) {
  const overrideBackdropMutation = useOverrideBackdropMutation();
  const uploadBackdropMutation = useUploadBackdropMutation();
  const overridePosterMutation = useOverridePosterMutation();
  const uploadPosterMutation = useUploadPosterMutation();
  const overrideLogoMutation = useOverrideLogoMutation();
  const uploadLogoMutation = useUploadLogoMutation();
  const overridePersonProfileMutation = useOverridePersonProfileMutation();
  const uploadPersonProfileMutation = useUploadPersonProfileMutation();

  // Compute available sources
  const sources = [];
  if (entityType === 'person') {
    const hasStash = !!externalIds?.stashdb_id;
    const hasFans = !!externalIds?.fansdb_id;
    const hasPornDb = !!externalIds?.theporndb_id;
    const hasTMDb = !!externalIds?.tmdb_id || (!hasStash && !hasFans && !hasPornDb);

    if (hasTMDb) sources.push({ value: 'tmdb', label: 'TMDb' });
    if (hasStash) sources.push({ value: 'stashdb', label: 'StashDB' });
    if (hasFans) sources.push({ value: 'fansdb', label: 'FansDB' });
    if (hasPornDb) sources.push({ value: 'theporndb', label: 'THEPornDB' });
    
    console.log('UniversalImagePickerModal: Performer sources computed:', {
      externalIds,
      tmdbId,
      hasStash,
      hasFans,
      hasPornDb,
      hasTMDb,
      sources
    });
  }

  const [selectedPath, setSelectedPath] = useState(currentPath);
  const [imageSource, setImageSource] = useState(() => {
    return sources.length > 0 ? sources[0].value : 'tmdb';
  });

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
      if (imageType === 'backdrop') {
        await uploadBackdropMutation.mutateAsync({
          itemId: entityId,
          file,
          mediaType: entityType,
        });
      } else if (imageType === 'poster') {
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

  const isPending =
    overrideBackdropMutation.isPending ||
    uploadBackdropMutation.isPending ||
    overridePosterMutation.isPending ||
    uploadPosterMutation.isPending ||
    overrideLogoMutation.isPending ||
    uploadLogoMutation.isPending ||
    overridePersonProfileMutation.isPending ||
    uploadPersonProfileMutation.isPending;

  const isScene = entityType === 'scene' || (typeof entityId === 'string' && entityId.startsWith('stash_'));

  return (
    <div className="universal-image-picker">
      <ImageUploadPanel
        imageType={imageType}
        isPending={isPending}
        t={t}
        onSaveUrl={handleSelectTmdbImage}
        onUploadFile={handleUploadFile}
      />

      {sources.length > 1 && (
        <div className="universal-image-picker__source-filter">
          <span className="universal-image-picker__source-label">{t('library.details.imageSource') || 'Image Source'}:</span>
          <div className="universal-image-picker__source-dropdown-wrapper">
            <Dropdown
              value={imageSource}
              onChange={(e) => setImageSource(e.target.value)}
              options={sources}
            />
          </div>
        </div>
      )}

      {!isScene && (
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
            selectedSource={imageSource}
          />
        </div>
      )}
    </div>
  );
}
