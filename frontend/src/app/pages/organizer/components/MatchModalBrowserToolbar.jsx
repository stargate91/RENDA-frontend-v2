import { ArrowLeft } from 'lucide-react';
import Button from '../../../ui/Button';
import MetaRow from '../../../ui/MetaRow';

export default function MatchModalBrowserToolbar({
  view,
  browserTitle,
  browserMetaItems,
  seriesCandidate,
  selectedSeason,
  bucketEpisodeNumbers,
  onBack,
  onResolve,
  onApplyBucket,
  t,
}) {
  if (view === 'results') {
    return null;
  }

  return (
    <div className="organizer-match-modal__browser-toolbar">
      <button
        type="button"
        className="organizer-match-modal__browser-back"
        onClick={onBack}
      >
        <ArrowLeft size={14} />
        {t('organizer.details.matchModal.back')}
      </button>
      <div className="organizer-match-modal__browser-copy">
        <strong className="organizer-match-modal__browser-title">{browserTitle}</strong>
        <MetaRow className="organizer-match-modal__browser-meta" items={browserMetaItems} />
      </div>
      {view === 'seasons' ? (
        <Button
          type="button"
          variant="secondary-neutral"
          size="sm"
          onClick={() => onResolve(seriesCandidate)}
        >
          {t('organizer.details.matchModal.useSeries')}
        </Button>
      ) : null}
      {view === 'episodes' ? (
        <div className="organizer-match-modal__browser-actions">
          <Button
            type="button"
            variant="secondary-neutral"
            size="sm"
            onClick={() => onResolve(seriesCandidate, {
              season: selectedSeason?.season_number,
              episode: null,
            })}
          >
            {t('organizer.details.matchModal.useSeason')}
          </Button>
          <Button
            type="button"
            variant="secondary-neutral"
            size="sm"
            disabled={bucketEpisodeNumbers.length === 0}
            onClick={onApplyBucket}
          >
            {t('organizer.details.matchModal.useBucket')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
