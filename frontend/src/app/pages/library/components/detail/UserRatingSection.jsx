import { PenLine, Star } from 'lucide-react';
import Pill from '@/ui/Pill';
import { useMediaDetailContext } from './MediaDetailContext';
import './UserRatingSection.css';


export default function UserRatingSection() {
  const { state, actions, t } = useMediaDetailContext();
  const {
    displayRating,
    starsStyleSheetText,
    verticalBarText
  } = state;

  const {
    handleOpenReviewModal,
    handleMouseMove,
    handleMouseLeave,
    handleClick
  } = actions;

  return (
    <div className="media-detail-page__meta-row">
      <Pill variant="meta-large" className="rating-pill--large">
        <button
          onClick={handleOpenReviewModal}
          className="review-trigger-btn"
          title={t('library.details.writeReview') || 'Write Review'}
        >
          <PenLine size={15} />
        </button>
        <span className="pill-vertical-separator">{verticalBarText}</span>

        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          className="rating-stars-container"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleClick}
        >
          <div className="rating-stars-underlay">
            <Star size={18} strokeWidth={2.3} />
            <Star size={18} strokeWidth={2.3} />
            <Star size={18} strokeWidth={2.3} />
            <Star size={18} strokeWidth={2.3} />
            <Star size={18} strokeWidth={2.3} />
          </div>
          <style>{starsStyleSheetText}</style>
          <div className="rating-stars-overlay rating-stars-overlay-dynamic">
            <div className="rating-stars-overlay-inner">
              <Star size={18} fill="currentColor" />
              <Star size={18} fill="currentColor" />
              <Star size={18} fill="currentColor" />
              <Star size={18} fill="currentColor" />
              <Star size={18} fill="currentColor" />
            </div>
          </div>
        </div>
        <span className={`user-rating-label ${displayRating !== undefined && displayRating !== null ? 'has-value' : ''}`}>
          {displayRating !== undefined && displayRating !== null
            ? displayRating.toFixed(1)
            : (t('library.details.yourRating') || 'Your Rating')}
        </span>
      </Pill>
    </div>
  );
}
