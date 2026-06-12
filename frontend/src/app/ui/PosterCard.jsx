import React from 'react';
import MediaCard from './MediaCard';
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

      {(title || subtitle) && (
        <div className="ui-poster-card__details">
          {title && <div className="ui-poster-card__title" title={title}>{title}</div>}
          {subtitle && <div className="ui-poster-card__subtitle">{subtitle}</div>}
        </div>
      )}
    </div>
  );
}
