import { FolderOpen, Video, Check, Eye, Play } from 'lucide-react';
import Button from '@/ui/Button';
import { formatEpisodeNumber } from '../../utils/detailUtils';
import { useMediaDetailContext } from './MediaDetailContext';

export default function MediaActions() {
  const { state, actions, mutations, t, navigate } = useMediaDetailContext();
  const {
    isOwned,
    isMovie,
    item,
    isWatched,
    nextEpisodeInfo
  } = state;

  const {
    handleTrailerClick,
    handleToggleWatched,
    handlePlayClick
  } = actions;

  const {
    updateStatusMutation,
    bulkUpdateWatchedMutation,
    playMutation
  } = mutations;

  if (!isOwned) return null;

  return (
    <div className="media-detail-page__actions-row">
      {isMovie && item?.collection_data && (
        <Button
          variant="ghost"
          onClick={() => navigate(`/library/collection/${item?.collection_data.tmdb_id}`)}
        >
          <FolderOpen size={16} />
          {t('library.details.collection') || 'Collection'}
        </Button>
      )}

      {item?.trailer_key && (
        <Button
          variant="ghost"
          onClick={handleTrailerClick}
        >
          <Video size={16} />
          {t('library.details.trailer') || 'Trailer'}
        </Button>
      )}

      <Button
        variant="ghost"
        onClick={handleToggleWatched}
        disabled={updateStatusMutation.isPending || bulkUpdateWatchedMutation.isPending}
      >
        {isWatched ? <Check size={16} /> : <Eye size={16} />}
        {isWatched ? (t('library.details.watched') || 'Watched') : (t('library.details.markWatched') || 'Mark as Watched')}
      </Button>

      {isMovie ? (
        <Button
          variant="secondary"
          onClick={handlePlayClick}
          disabled={playMutation.isPending}
        >
          <Play size={16} fill="currentColor" />
          {item?.resume_position > 0 ? (t('library.details.resume') || 'Resume') : (t('library.details.play') || 'Play')}
        </Button>
      ) : (
        nextEpisodeInfo && (
          <Button
            variant="secondary"
            onClick={handlePlayClick}
            disabled={playMutation.isPending}
          >
            <Play size={16} fill="currentColor" />
            {t('library.details.continueEpisode', { defaultValue: 'Continue S{{season}} E{{episode}}', season: nextEpisodeInfo.seasonNumber, episode: formatEpisodeNumber(nextEpisodeInfo.episode.episode_number) })}
          </Button>
        )
      )}
    </div>
  );
}
