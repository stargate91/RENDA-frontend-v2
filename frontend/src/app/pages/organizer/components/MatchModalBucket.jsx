const getEpisodeLabel = (num) => `E${num}`;

export default function MatchModalBucket({
  view,
  bucketEpisodeNumbers,
  onToggle,
  t,
}) {
  if (view !== 'episodes' || bucketEpisodeNumbers.length === 0) {
    return null;
  }

  return (
    <div className="organizer-match-modal__bucket">
      <strong className="organizer-match-modal__bucket-title">
        {t('organizer.details.matchModal.bucketTitle')}
      </strong>
      <div className="organizer-match-modal__bucket-items">
        {bucketEpisodeNumbers.map((episodeNumber) => (
          <button
            key={`bucket-${episodeNumber}`}
            type="button"
            className="organizer-match-modal__bucket-chip"
            onClick={() => onToggle(episodeNumber)}
          >
            {getEpisodeLabel(episodeNumber)}
          </button>
        ))}
      </div>
    </div>
  );
}
