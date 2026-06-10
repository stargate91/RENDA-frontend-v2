import './Feedback.css';

export default function Spinner({
  label = 'Loading',
  description = '',
  className = '',
}) {
  return (
    <div
      className={`ui-spinner-wrap ${className}`.trim()}
      aria-live="polite"
      aria-label={label}
      role="status"
    >
      <span className="ui-spinner" />
      <div className="ui-spinner__text">
        <span className="ui-spinner__label">{label}</span>
        {description ? <span className="ui-spinner__description">{description}</span> : null}
      </div>
    </div>
  );
}
