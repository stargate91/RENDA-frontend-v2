export default function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}) {
  return (
    <button
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
