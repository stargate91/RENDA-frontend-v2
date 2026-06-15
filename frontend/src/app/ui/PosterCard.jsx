import MediaCard from './MediaCard';
import Pill from './Pill';
import { Star } from 'lucide-react';
import './PosterCard.css';

export default function PosterCard({
  as: Component,
  className = '',
  variant = 'default',
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
  style,
  customStyle,
  children,
  ...props
}) {
  const isInteractive = !!onClick;
  const DefaultComponent = Component || (isInteractive ? 'button' : 'div');
  const isOverlayTitle = variant === 'overlay-title';

  const cardClassName = `ui-poster-card ${isOverlayTitle ? 'ui-poster-card--overlay-title' : ''} ${active ? 'is-active' : ''} ${className}`.trim();

  return (
    /* eslint-disable-next-line react/forbid-dom-props */
    <div className={cardClassName} style={customStyle || style}>
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
              /* eslint-disable-next-line react/forbid-dom-props */
              style={backgroundColor ? { background: backgroundColor } : undefined}
            >
              {IconComponent && <IconComponent size={32} className="ui-poster-card__placeholder-icon" />}
              {placeholderText && <span className="ui-poster-card__placeholder-text">{placeholderText}</span>}
            </div>
          )}
          {overlay}
          {badge}
          {isOverlayTitle && title ? (
            <div className="ui-poster-card__title-overlay">
              <div className="ui-poster-card__title-overlay-gradient" />
              <div className="ui-poster-card__title-overlay-label" title={title}>{title}</div>
            </div>
          ) : null}
          {children}
        </MediaCard>
      </DefaultComponent>

      {!isOverlayTitle && (title || subtitle || ratingImdb || ratingTmdb) && (
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
                  return (
                    <Pill variant="imdb">
                      <Star size={10} fill="currentColor" strokeWidth={1.8} />
                      {isNaN(val) ? ratingImdb : val.toFixed(1)}
                    </Pill>
                  );
                } else if (hasTmdb) {
                  const val = parseFloat(ratingTmdb);
                  return (
                    <Pill variant="tmdb">
                      <Star size={10} fill="currentColor" strokeWidth={1.8} />
                      {isNaN(val) ? ratingTmdb : val.toFixed(1)}
                    </Pill>
                  );
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
