import { Clapperboard } from 'lucide-react';
import MediaCard from '@/ui/MediaCard';
import MetaRow from '@/ui/MetaRow';
import StatusBadge from '@/ui/StatusBadge';

const TMDB_IMAGE_SIZE_POSTER = 'w154';

const getDisplayTitle = (candidate, mediaType, t) => (
  candidate?.title
  || candidate?.name
  || candidate?.original_title
  || candidate?.original_name
  || (mediaType === 'tv' ? t('organizer.details.matchModal.unknownSeries') : t('organizer.details.matchModal.unknownMovie'))
);

const getDisplayYear = (candidate, mediaType) => {
  const rawDate = mediaType === 'tv'
    ? candidate?.first_air_date
    : candidate?.release_date;
  return rawDate ? String(rawDate).slice(0, 4) : null;
};

const getImageUrl = (path, size = TMDB_IMAGE_SIZE_POSTER) => (
  !path ? ''
    : String(path).startsWith('http://') || String(path).startsWith('https://')
      ? path
      : `https://image.tmdb.org/t/p/${size}${path}`
);

const normalizeCandidateType = (value, fallbackMode) => {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'tv' || normalized === 'series' || normalized === 'season' || normalized === 'episode'
    ? 'tv'
    : fallbackMode === 'tv' ? 'tv' : 'movie';
};

export default function MatchCandidateCard({
  candidate,
  sourceLabel,
  variant = 'list',
  mode,
  isResolvingId,
  isBrowserLoading,
  onSelect,
  t,
}) {
  const mediaType = normalizeCandidateType(candidate.type || candidate.media_type, mode);
  const displayTitle = getDisplayTitle(candidate, mediaType, t);
  const displayYear = getDisplayYear(candidate, mediaType);
  const candidateId = candidate.tmdb_id || candidate.id;
  const posterUrl = getImageUrl(candidate.poster_path, TMDB_IMAGE_SIZE_POSTER);
  const isDisabled = isResolvingId === candidateId || isBrowserLoading;

  if (variant === 'poster') {
    return (
      <div
        key={`${sourceLabel}-${candidateId}`}
        className={`organizer-match-modal__poster-card${candidate.is_active ? ' is-active' : ''}`.trim()}
      >
        <button
          type="button"
          className="organizer-match-modal__poster-card-image"
          onClick={() => onSelect(candidate)}
          disabled={isDisabled}
        >
          <MediaCard>
            {posterUrl ? (
              <img src={posterUrl} alt="" className="organizer-match-modal__poster-image" />
            ) : (
              <div className="organizer-match-modal__poster-placeholder">
                <Clapperboard size={18} />
              </div>
            )}
            {candidate.is_active ? (
              <StatusBadge variant="overlay">
                {t('organizer.details.matchModal.current')}
              </StatusBadge>
            ) : null}
          </MediaCard>
        </button>
        <div className="organizer-match-modal__poster-card-copy">
          <strong className="organizer-match-modal__poster-card-title">{displayTitle}</strong>
          <MetaRow
            className="organizer-match-modal__poster-card-meta"
            items={[
              displayYear,
              mediaType === 'tv' ? t('organizer.details.matchModal.series') : t('organizer.details.matchModal.movie'),
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <button
      key={`${sourceLabel}-${candidateId}`}
      type="button"
      className={`organizer-match-modal__result-card${candidate.is_active ? ' is-active' : ''}`.trim()}
      onClick={() => onSelect(candidate)}
      disabled={isDisabled}
    >
      <div className="organizer-match-modal__poster">
        {posterUrl ? (
          <img src={posterUrl} alt="" className="organizer-match-modal__poster-image" />
        ) : (
          <div className="organizer-match-modal__poster-placeholder">
            <Clapperboard size={18} />
          </div>
        )}
      </div>
      <div className="organizer-match-modal__result-copy">
        <div className="organizer-match-modal__result-topline">
          <strong className="organizer-match-modal__result-title">{displayTitle}</strong>
          {candidate.is_active ? (
            <StatusBadge>
              {t('organizer.details.matchModal.current')}
            </StatusBadge>
          ) : null}
        </div>
        <MetaRow
          className="organizer-match-modal__result-meta"
          items={[
            mediaType === 'tv' ? t('organizer.details.matchModal.series') : t('organizer.details.matchModal.movie'),
            displayYear,
          ]}
        />
        {candidate.overview ? (
          <p className="organizer-match-modal__result-overview">{candidate.overview}</p>
        ) : null}
        {mediaType !== 'tv' && (
          <span className="organizer-match-modal__result-action">
            {isResolvingId === candidateId
              ? t('organizer.details.matchModal.applying')
              : t('organizer.details.matchModal.useMatch')}
          </span>
        )}
      </div>
    </button>
  );
}
