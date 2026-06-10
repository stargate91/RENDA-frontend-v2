export default function IconButton({
  children,
  className = '',
  variant = 'secondary-neutral',
  size = 'md',
  label,
  title,
  ...props
}) {
  const accessibleLabel = label || title;

  return (
    <button
      className={`ui-icon-button ui-icon-button--${variant} ui-icon-button--${size} ${className}`.trim()}
      aria-label={accessibleLabel}
      title={title === null ? undefined : (title || accessibleLabel)}
      {...props}
    >
      {children}
    </button>
  );
}
