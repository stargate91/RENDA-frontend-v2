import { ImageOff } from 'lucide-react';
import { useFullMetadataQuery } from '@/queries/metadataQueries';
import { useMediaDetailContext } from '../MediaDetailContext';
import { buildTmdbImageUrl, TMDB_IMAGE_SIZES } from '@/lib/imageUrls';
import EmptyState from '@/ui/EmptyState';
import BackdropCard from '@/ui/BackdropCard';
import './BackdropsPanel.css';


export default function BackdropsPanel({ showTitle = true }) {
  const { state, mutations, id, type, t, toast } = useMediaDetailContext();
  const {
    item
  } = state;

  const {
    overrideBackdropMutation
  } = mutations;

  const { data: fullMetadata } = useFullMetadataQuery(id, type);

  const activeMatch = fullMetadata?.matches?.find(m => m.is_active);
  const apiResponse = activeMatch
    ? (Object.values(activeMatch.api_responses || {})[0] || Object.values(activeMatch.series_api_responses || {})[0])
    : null;
  const allBackdrops = apiResponse?.images?.backdrops || [];
  const currentBackdropPath = activeMatch?.local_backdrop_path || activeMatch?.backdrop_path || item?.backdrop_path || '';
  const neutralBackdrops = allBackdrops.filter(
    bd => (!bd.iso_639_1 || bd.iso_639_1 === '') && bd.width >= 1280
  );

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

      <div className="backdrops-grid">
        {neutralBackdrops.map((bd, idx) => {
          const tmdbThumbUrl = buildTmdbImageUrl(bd.file_path, TMDB_IMAGE_SIZES.thumbnail);
          const isSelected = currentBackdropPath === bd.file_path || (currentBackdropPath && currentBackdropPath.endsWith(bd.file_path));
          const isPending = overrideBackdropMutation.isPending && overrideBackdropMutation.variables?.backdropPath === bd.file_path;

          return (
            <BackdropCard
              key={idx}
              imageUrl={tmdbThumbUrl}
              alt={`Backdrop ${idx + 1}`}
              isSelected={isSelected}
              isPending={isPending}
              infoLeft={`${bd.width}${String.fromCharCode(0x00D7)}${bd.height}`}
              infoRight={`${String.fromCharCode(0x2605)} ${bd.vote_average?.toFixed(1)}`}
              onClick={() => handleSelectBackdrop(bd.file_path)}
            />
          );
        })}

        {neutralBackdrops.length === 0 && (
          <EmptyState
            variant="detail-panel"
            icon={ImageOff}
            className="backdrops-panel__empty-state"
            title={t('library.details.noBackdropsAvailable') || 'No good backdrop options found for this title.'}
          />
        )}
      </div>
    </div>
  );
}
