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

  const handleSelectBackdrop = async (backdropPath) => {
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
        currentPath={item?.backdrop_path}
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
