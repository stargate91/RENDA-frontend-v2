export default function UtilityButton({
  children,
  className = '',
  size = 'md',
  danger = false,
  ...props
}) {
  return (
    <button
      className={`ui-utility-button ui-utility-button--${size}${danger ? ' is-danger' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
