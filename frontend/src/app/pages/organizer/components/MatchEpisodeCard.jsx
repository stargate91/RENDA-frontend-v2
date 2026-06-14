import { useRef, useEffect } from 'react';
import { Clapperboard, Check } from 'lucide-react';
import MediaCard from '../../../ui/MediaCard';
import MetaRow from '../../../ui/MetaRow';
import StatusBadge from '../../../ui/StatusBadge';
import Button from '../../../ui/Button';

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
  onSelect,
  onToggle,
  isActive = false,
  isHighlighted = false,
  t,
}) {
  const stillUrl = getImageUrl(episodeEntry.still_path, TMDB_IMAGE_SIZE_STILL);
  const cardRef = useRef();

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      // Small timeout to allow render/layout to stabilize before scrolling
      const timer = setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted]);

  return (
    <div
      ref={cardRef}
      key={`episode-${episodeEntry.id || episodeEntry.episode_number}`}
      className={`organizer-match-modal__browser-card organizer-match-modal__browser-card--episode${isBucketed ? ' is-selected' : ''}${isHighlighted ? ' is-highlighted' : ''}`.trim()}
    >
      <button
        type="button"
        className="organizer-match-modal__browser-card-image organizer-match-modal__browser-card-image--still organizer-match-modal__browser-card--clickable"
        onClick={() => onToggle(episodeEntry.episode_number)}
      >
        <MediaCard>
          {stillUrl ? (
            <img src={stillUrl} alt="" className="organizer-match-modal__poster-image" />
          ) : (
            <div className="organizer-match-modal__poster-placeholder">
              <Clapperboard size={18} />
            </div>
          )}
          {isBucketed ? (
            <div className="organizer-match-modal__browser-card-bucket-indicator">
              <Check size={12} strokeWidth={3} />
            </div>
          ) : null}
          {isActive ? (
            <StatusBadge variant="overlay">
              {t('organizer.details.matchModal.current')}
            </StatusBadge>
          ) : null}
        </MediaCard>
      </button>
      <div className="organizer-match-modal__browser-card-copy">
        <strong className="organizer-match-modal__browser-card-title">
          {episodeEntry.name || t('organizer.details.matchModal.episodeNum').replace('{number}', episodeEntry.episode_number)}
        </strong>
        <div className="organizer-match-modal__browser-card-meta-row">
          <MetaRow
            className="organizer-match-modal__browser-card-meta"
            items={[
              `E${episodeEntry.episode_number}`,
              episodeEntry.air_date ? String(episodeEntry.air_date).slice(0, 10) : null,
            ]}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="organizer-match-modal__select-button"
            onClick={() => onSelect(episodeEntry)}
            disabled={isDisabled}
          >
            {t('organizer.details.matchModal.select')}
          </Button>
        </div>
      </div>
    </div>
  );
}
