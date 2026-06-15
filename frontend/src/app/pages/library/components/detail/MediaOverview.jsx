import { useMediaDetailContext } from './MediaDetailContext';
import './MediaOverview.css';


export default function MediaOverview() {
  const { state, actions, t } = useMediaDetailContext();
  const {
    overview,
    overviewRef,
    isTruncated
  } = state;

  const {
    handleReadMore
  } = actions;

  if (!overview) return null;

  return (
    <div className="media-detail-page__overview">
      <div
        ref={overviewRef}
        className="media-detail-page__overview-text"
      >
        {overview}
      </div>
      {isTruncated && (
        <button
          type="button"
          className="media-detail-page__read-more-btn"
          onClick={handleReadMore}
        >
          {t('library.details.readMore') || 'Read More'}
        </button>
      )}
    </div>
  );
}
