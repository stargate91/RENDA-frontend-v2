import './TagButton.css';

export default function TagButton({
  children,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`ui-tag-button ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
