import { useEffect, useState } from 'react';
import { useMediaDetailContext } from '../MediaDetailContext';
import TMDBImageGrid from '../../entityDetail/TMDBImageGrid';
import './BackdropsPanel.css';

export default function BackdropsPanel({ showTitle = true }) {
  const { state, mutations, id, type, t, toast } = useMediaDetailContext();
  const {
    item
  } = state;

  const {
    overrideBackdropMutation
  } = mutations;

  const [selectedBackdropPath, setSelectedBackdropPath] = useState(item?.backdrop_path || '');

  useEffect(() => {
    if (item?.backdrop_path) {
      setSelectedBackdropPath(item.backdrop_path);
    }
  }, [item?.backdrop_path]);

  const handleSelectBackdrop = async (backdropPath) => {
    setSelectedBackdropPath(backdropPath);
    try {
      await overrideBackdropMutation.mutateAsync({
        itemId: id,
        backdropPath: backdropPath,
        mediaType: type,
      });
      toast(t('library.details.backdropUpdated') || 'Backdrop updated successfully!', 'success');
    } catch (err) {
      toast(err.message || t('library.details.backdropUpdateFailed') || 'Failed to update backdrop', 'danger');
    }
  };

  return (
    <div className="backdrops-panel">
      {showTitle && (
        <h4 className="details-panel__section-title">
          {t('library.details.chooseBackdrop') || 'Choose Backdrop'}
        </h4>
      )}

      <TMDBImageGrid
        itemId={id}
        tmdbId={item?.tmdb_id || item?.series_tmdb_id}
        mediaType={type}
        imageType="backdrop"
        currentPath={selectedBackdropPath}
        onSelect={handleSelectBackdrop}
        isPending={overrideBackdropMutation.isPending}
        pendingPath={overrideBackdropMutation.variables?.backdropPath}
        initialVisibleCount={12}
        visibleStep={12}
        t={t}
      />
    </div>
  );
}
