import { Clapperboard } from 'lucide-react';
import MediaCard from '../../../ui/MediaCard';
import MetaRow from '../../../ui/MetaRow';

const TMDB_IMAGE_SIZE_STILL = 'w300';

const getImageUrl = (path, size = TMDB_IMAGE_SIZE_STILL) => (
  !path ? ''
    : String(path).startsWith('http://') || String(path).startsWith('https://')
      ? path
      : `https://image.tmdb.org/t/p/${size}${path}`
);

export default function MatchEpisodeCard({
  episodeEntry,
  isBucketed,
  isDisabled,
  onToggle,
  t,
}) {
  const stillUrl = getImageUrl(episodeEntry.still_path, TMDB_IMAGE_SIZE_STILL);

  return (
    <button
      key={`episode-${episodeEntry.id || episodeEntry.episode_number}`}
      type="button"
      className={`organizer-match-modal__browser-card organizer-match-modal__browser-card--episode${isBucketed ? ' is-selected' : ''}`.trim()}
      onClick={() => onToggle(episodeEntry.episode_number)}
      disabled={isDisabled}
    >
      <MediaCard className="organizer-match-modal__browser-card-image organizer-match-modal__browser-card-image--still">
        {stillUrl ? (
          <img src={stillUrl} alt="" className="organizer-match-modal__poster-image" />
        ) : (
          <div className="organizer-match-modal__poster-placeholder">
            <Clapperboard size={18} />
          </div>
        )}
      </MediaCard>
      <div className="organizer-match-modal__browser-card-copy">
        <strong className="organizer-match-modal__browser-card-title">
          {episodeEntry.name || t('organizer.details.matchModal.episodeNum').replace('{number}', episodeEntry.episode_number)}
        </strong>
        <MetaRow
          className="organizer-match-modal__browser-card-meta"
          items={[
            `E${episodeEntry.episode_number}`,
            episodeEntry.air_date ? String(episodeEntry.air_date).slice(0, 10) : null,
          ]}
        />
        <span className="organizer-match-modal__result-action">
          {isBucketed
            ? t('organizer.details.matchModal.removeFromBucket')
            : t('organizer.details.matchModal.addToBucket')}
        </span>
      </div>
    </button>
  );
}
