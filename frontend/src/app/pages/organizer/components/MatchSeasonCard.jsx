import { Clapperboard } from 'lucide-react';
import MediaCard from '../../../ui/MediaCard';
import MetaRow from '../../../ui/MetaRow';
import StatusBadge from '../../../ui/StatusBadge';

const TMDB_IMAGE_SIZE_POSTER = 'w154';

const getImageUrl = (path, size = TMDB_IMAGE_SIZE_POSTER) => (
  !path ? ''
    : String(path).startsWith('http://') || String(path).startsWith('https://')
      ? path
      : `https://image.tmdb.org/t/p/${size}${path}`
);

export default function MatchSeasonCard({
  seasonEntry,
  isBrowserLoading,
  onSelect,
  isActive = false,
  t,
}) {
  const posterUrl = getImageUrl(seasonEntry.poster_path, TMDB_IMAGE_SIZE_POSTER);

  return (
    <div
      key={`season-${seasonEntry.season_number}`}
      className="organizer-match-modal__browser-card"
    >
      <button
        type="button"
        className="organizer-match-modal__browser-card-image organizer-match-modal__browser-card-image--poster organizer-match-modal__browser-card--clickable"
        onClick={() => onSelect(seasonEntry)}
        disabled={isBrowserLoading}
      >
        <MediaCard>
          {posterUrl ? (
            <img src={posterUrl} alt="" className="organizer-match-modal__poster-image" />
          ) : (
            <div className="organizer-match-modal__poster-placeholder">
              <Clapperboard size={18} />
            </div>
          )}
          {isActive ? (
            <StatusBadge variant="overlay">
              {t('organizer.details.matchModal.current')}
            </StatusBadge>
          ) : null}
        </MediaCard>
      </button>
      <div className="organizer-match-modal__browser-card-copy">
        <strong className="organizer-match-modal__browser-card-title">
          {seasonEntry.name || t('organizer.details.matchModal.seasonNum').replace('{number}', seasonEntry.season_number)}
        </strong>
        <MetaRow
          className="organizer-match-modal__browser-card-meta"
          items={[
            seasonEntry.episode_count ? `${seasonEntry.episode_count} eps` : null,
          ]}
        />
      </div>
    </div>
  );
}
