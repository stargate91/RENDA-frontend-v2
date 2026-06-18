import { Film, Tv } from 'lucide-react';
import './CreditCard.css';

export default function CreditCard({
  title,
  imageUrl,
  isTv = false,
  isPeopleGrid = false,
  isCollectionItem = false,
  isKnownFor = false,
  isOwned = false,
  isMissing = false,
  isUnframed = false,
  isPlaceholder = false,
  onClick,
  disabled,
  className = '',
  children,
  ...props
}) {
  const cardClass = [
    'ui-credit-card',
    isPeopleGrid && 'ui-credit-card--people-grid',
    isCollectionItem && 'ui-credit-card--collection-item',
    isKnownFor && 'ui-credit-card--known-for',
    isOwned && 'ui-credit-card--owned',
    isMissing && 'ui-credit-card--missing',
    isUnframed && 'ui-credit-card--unframed',
    isPlaceholder && 'ui-credit-card--placeholder',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cardClass}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      <div className="ui-credit-card__poster-wrap">
        {!isPlaceholder && (imageUrl ? (
          <img src={imageUrl} alt="" className="ui-credit-card__poster" />
        ) : (
          <div className="ui-credit-card__poster ui-credit-card__poster--placeholder">
            {isTv ? <Tv size={16} /> : <Film size={16} />}
          </div>
        ))}
      </div>

      <div className="ui-credit-card__body">
        <div className="ui-credit-card__topline">
          <div className="ui-credit-card__title">{title}</div>
        </div>
        {children}
      </div>
    </button>
  );
}
