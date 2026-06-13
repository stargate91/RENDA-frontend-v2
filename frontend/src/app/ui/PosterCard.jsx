import MediaCard from './MediaCard';
import RatingPill from './RatingPill';
import './PosterCard.css';

export default function PosterCard({
  as: Component,
  className = '',
  imageUrl,
  backgroundColor,
  icon: IconComponent,
  placeholderText,
  title,
  subtitle,
  badge,
  overlay,
  ratingImdb,
  ratingTmdb,
  onClick,
  disabled = false,
  active = false,
  children,
  ...props
}) {
  const isInteractive = !!onClick;
  const DefaultComponent = Component || (isInteractive ? 'button' : 'div');

  const cardClassName = `ui-poster-card ${active ? 'is-active' : ''} ${className}`.trim();

  return (
    <div className={cardClassName}>
      <DefaultComponent
        type={DefaultComponent === 'button' ? 'button' : undefined}
        className="ui-poster-card__image-wrapper"
        onClick={onClick}
        disabled={disabled || undefined}
        {...props}
      >
        <MediaCard className="ui-poster-card__media">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="ui-poster-card__image" />
          ) : (
            <div 
              className="ui-poster-card__placeholder" 
              style={backgroundColor ? { background: backgroundColor } : undefined}
            >
              {IconComponent && <IconComponent size={32} className="ui-poster-card__placeholder-icon" />}
              {placeholderText && <span className="ui-poster-card__placeholder-text">{placeholderText}</span>}
            </div>
          )}
          {overlay}
          {badge}
          {children}
        </MediaCard>
      </DefaultComponent>

      {(title || subtitle || ratingImdb || ratingTmdb) && (
        <div className="ui-poster-card__details">
          {title && <div className="ui-poster-card__title" title={title}>{title}</div>}
          {(subtitle || ratingImdb || ratingTmdb) && (
            <div className="ui-poster-card__subtitle-row">
              {subtitle && <div className="ui-poster-card__subtitle">{subtitle}</div>}
              {(() => {
                const hasImdb = ratingImdb !== undefined && ratingImdb !== null && ratingImdb !== '';
                const hasTmdb = ratingTmdb !== undefined && ratingTmdb !== null && ratingTmdb !== '';
                if (hasImdb) {
                  const val = parseFloat(ratingImdb);
                  return <RatingPill type="imdb">{isNaN(val) ? ratingImdb : val.toFixed(1)}</RatingPill>;
                } else if (hasTmdb) {
                  const val = parseFloat(ratingTmdb);
                  return <RatingPill type="tmdb">{isNaN(val) ? ratingTmdb : val.toFixed(1)}</RatingPill>;
                }
                return null;
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

