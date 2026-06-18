import Pill from '@/ui/Pill';
import { Layers, User } from 'lucide-react';
import { OverviewContent } from './EntityDetailSections';
import PersonRatingControls from './PersonRatingControls';
import './EntityDetailHeroSection.css';

export default function EntityDetailHeroSection({
  isPeople,
  item,
  mediaUrl,
  profileLinks,
  metaPills,
  overviewText,
  overviewTitle,
  overviewEmptyText,
  displayRating,
  isActivateHovered,
  starsStyleSheetText,
  t,
  openModal,
  setIsActivateHovered,
  handleToggleFavorite,
  handleToggleActive,
  handleOpenReviewModal,
  handlePeopleRatingMouseMove,
  handlePeopleRatingMouseLeave,
  handlePeopleRatingClick,
}) {
  return (
    <section className="entity-detail-page__hero-grid">
      <div className="entity-detail-page__media-column">
        <div className={`entity-detail-page__media-card ${isPeople ? 'entity-detail-page__media-card--profile' : ''}`}>
          {mediaUrl ? (
            <img
              src={mediaUrl}
              alt={item?.name || item?.title || 'Detail artwork'}
              className="entity-detail-page__media-image"
            />
          ) : (
            <div className="entity-detail-page__media-placeholder">
              {isPeople ? <User size={44} /> : <Layers size={44} />}
            </div>
          )}
        </div>

        {isPeople && profileLinks.length > 0 && (
          <div className="entity-detail-page__profile-links">
            {profileLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="entity-detail-page__profile-link"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="entity-detail-page__summary">
        <div className="entity-detail-page__headline-block">
          <h1 className="entity-detail-page__title">
            {item?.name || item?.title || (isPeople ? 'Unknown Person' : 'Unknown Collection')}
          </h1>
          {isPeople && item?.alternate_names?.length > 0 && (
            <div className="entity-detail-page__alternate-names">
              {item.alternate_names.join(', ')}
            </div>
          )}

          {metaPills.length > 0 && (
            <div className="entity-detail-page__meta-row">
              {metaPills.map((metaItem) => (
                <Pill key={metaItem.key} variant="meta">{metaItem.content}</Pill>
              ))}
            </div>
          )}
        </div>

        {isPeople && (
          <PersonRatingControls
            item={item}
            displayRating={displayRating}
            isActivateHovered={isActivateHovered}
            starsStyleSheetText={starsStyleSheetText}
            t={t}
            setIsActivateHovered={setIsActivateHovered}
            handleToggleFavorite={handleToggleFavorite}
            handleToggleActive={handleToggleActive}
            handleOpenReviewModal={handleOpenReviewModal}
            handlePeopleRatingMouseMove={handlePeopleRatingMouseMove}
            handlePeopleRatingMouseLeave={handlePeopleRatingMouseLeave}
            handlePeopleRatingClick={handlePeopleRatingClick}
          />
        )}

        {overviewText && (
          <div className="entity-detail-page__summary-layout">
            <div className="entity-detail-page__summary-text">
              <OverviewContent
                text={overviewText}
                title={overviewTitle}
                emptyText={overviewEmptyText}
                t={t}
                openModal={openModal}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
