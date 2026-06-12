import './SelectableCard.css';

export default function SelectableCard({
  children,
  className = '',
  as = 'button',
  selected = false,
  disabled = false,
  onClick,
  type = 'button',
  ...props
}) {
  const sharedClassName = `ui-selectable-card${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''} ${className}`.trim();

  if (as === 'div') {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        className={sharedClassName}
        aria-disabled={disabled}
        onClick={disabled ? undefined : onClick}
        onKeyDown={disabled ? undefined : (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick?.(event);
          }
        }}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <button
      type={type}
      className={sharedClassName}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
