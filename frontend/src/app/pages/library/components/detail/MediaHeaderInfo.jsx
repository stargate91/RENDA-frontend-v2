import { Calendar, Clock, Video, Globe } from 'lucide-react';
import Pill from '@/ui/Pill';
import { useMediaDetailContext } from './MediaDetailContext';
import './MediaHeaderInfo.css';


export default function MediaHeaderInfo() {
  const { state, handleOpenLogoModal } = useMediaDetailContext();
  const {
    title,
    logoUrl,
    showOriginalTitle,
    originalTitle,
    tagline,
    taglineText,
    metaDate,
    isMovie,
    formattedDuration,
    seasonsText,
    episodesText,
    langText,
    showImdb,
    ratingImdb,
    showTmdb,
    ratingTmdb,
    normalizedGenres,
    item,
    showStudioPill,
    showNetworkPill,
    studioName,
    networkName
  } = state;

  return (
    <div className="media-detail-page__header-layout">
      <div className="media-detail-page__header-copy">
        <div
          className="media-detail-page__logo-container clickable"
          onClick={handleOpenLogoModal}
          title={logoUrl ? 'Change Logo' : 'Add Logo'}
        >
          {logoUrl ? (
            <img src={logoUrl} alt={title} className="media-detail-page__logo" />
          ) : (
            <h1 className="media-detail-page__fallback-title">{title}</h1>
          )}
        </div>

        {logoUrl && item?.type === 'scene' && (
          <h1 className="media-detail-page__scene-title-below-logo">{title}</h1>
        )}

        <div className="media-detail-page__details-group">
          {showOriginalTitle && (
            <div className="media-detail-page__original-title">
              {originalTitle}
            </div>
          )}

          {tagline && (
            <div className="media-detail-page__tagline">
              {taglineText}
            </div>
          )}

          {(metaDate || formattedDuration || seasonsText || episodesText || langText || ratingImdb || ratingTmdb || showStudioPill || showNetworkPill) && (
            <div className="media-detail-page__meta-row">
              {showStudioPill && (
                <Pill variant="meta">
                  <Video size={14} />
                  {studioName}
                </Pill>
              )}
              {showNetworkPill && (
                <Pill variant="meta">
                  <Globe size={14} />
                  {networkName}
                </Pill>
              )}
              {metaDate && (
                <Pill variant="meta">
                  <Calendar size={14} />
                  {metaDate}
                </Pill>
              )}
              {isMovie && formattedDuration && (
                <Pill variant="meta">
                  <Clock size={14} />
                  {formattedDuration}
                </Pill>
              )}
              {!isMovie && seasonsText && (
                <Pill variant="meta">
                  {seasonsText}
                </Pill>
              )}
              {!isMovie && episodesText && (
                <Pill variant="meta">
                  {episodesText}
                </Pill>
              )}
              {langText && (
                <Pill variant="meta">
                  {langText}
                </Pill>
              )}
              {showImdb && (
                <Pill variant="meta">
                  <img
                    src="/rating/imdb.png"
                    alt="IMDb"
                    className="rating-pill-img"
                  />
                  <span>{isNaN(parseFloat(ratingImdb)) ? ratingImdb : parseFloat(ratingImdb).toFixed(1)}</span>
                </Pill>
              )}
              {showTmdb && (
                <Pill variant="meta">
                  <img
                    src="/rating/tmdb.png"
                    alt="TMDb"
                    className="rating-pill-img"
                  />
                  <span>{isNaN(parseFloat(ratingTmdb)) ? ratingTmdb : parseFloat(ratingTmdb).toFixed(1)}</span>
                </Pill>
              )}
            </div>
          )}

          {normalizedGenres && normalizedGenres.length > 0 && (
            <div className="media-detail-page__meta-row">
              {normalizedGenres.map((genre, idx) => (
                <Pill key={idx} variant="meta">
                  {genre.toUpperCase()}
                </Pill>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
