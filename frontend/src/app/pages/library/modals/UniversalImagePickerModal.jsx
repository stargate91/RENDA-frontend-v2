import { useEffect, useState } from 'react';
import TMDBImageGrid from '../components/entityDetail/TMDBImageGrid';
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
}) {
  const overrideBackdropMutation = useOverrideBackdropMutation();
  const uploadBackdropMutation = useUploadBackdropMutation();
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

  return (
    <div className="universal-image-picker">
      <ImageUploadPanel
        imageType={imageType}
        isPending={isPending}
        t={t}
        onSaveUrl={handleSelectTmdbImage}
        onUploadFile={handleUploadFile}
      />

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
