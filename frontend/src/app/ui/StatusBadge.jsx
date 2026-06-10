import './StatusBadge.css';

export default function StatusBadge({
  children,
  tone = 'accent',
  variant = 'inline',
  className = '',
}) {
  return (
    <span className={`ui-status-badge ui-status-badge--${tone} ui-status-badge--${variant} ${className}`.trim()}>
      {children}
    </span>
  );
}
