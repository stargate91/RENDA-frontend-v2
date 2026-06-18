import Pill from '@/ui/Pill';
import { Check, Heart, Minus, PenLine, Plus, Star } from 'lucide-react';
import './PersonRatingControls.css';

export default function PersonRatingControls({
  item,
  displayRating,
  isActivateHovered,
  starsStyleSheetText,
  t,
  setIsActivateHovered,
  handleToggleFavorite,
  handleToggleActive,
  handleOpenReviewModal,
  handlePeopleRatingMouseMove,
  handlePeopleRatingMouseLeave,
  handlePeopleRatingClick,
}) {
  return (
    <div className="media-detail-page__meta-row">
      <Pill variant="meta-large" className="rating-pill--large entity-detail-page__person-rating-pill">
        <div className="entity-detail-page__person-rating-actions">
          <button
            type="button"
            className={`entity-detail-page__person-rating-action entity-detail-page__person-rating-action--favorite${item?.is_favorite ? ' is-active' : ''}`}
            onClick={handleToggleFavorite}
            title={t('library.details.favorite') || 'Favorite'}
          >
            <Heart size={15} fill={item?.is_favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className={`entity-detail-page__person-rating-action entity-detail-page__person-rating-action--activate${item?.is_active ? ' is-active' : ''}`}
            onClick={handleToggleActive}
            onMouseEnter={() => setIsActivateHovered(true)}
            onMouseLeave={() => setIsActivateHovered(false)}
            title={t('library.people.addPeopleBtn') || 'Activate'}
          >
            {item?.is_active
              ? (isActivateHovered ? <Minus size={15} /> : <Check size={15} />)
              : <Plus size={15} />}
          </button>
          <button
            type="button"
            className="review-trigger-btn entity-detail-page__person-rating-action"
            onClick={handleOpenReviewModal}
            title={t('library.details.writeReview') || 'Write Review'}
          >
            <PenLine size={15} />
          </button>
        </div>
        <div className="entity-detail-page__person-rating-value">
          <span className="pill-vertical-separator" aria-hidden="true">{String.fromCharCode(124)}</span>
          <div
            className="rating-stars-container"
            onMouseMove={handlePeopleRatingMouseMove}
            onMouseLeave={handlePeopleRatingMouseLeave}
            onMouseUp={handlePeopleRatingClick}
            role="slider"
            tabIndex={0}
            aria-label={t('library.details.yourRating') || 'Your Rating'}
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={displayRating ?? 0}
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
        </div>
      </Pill>
    </div>
  );
}
