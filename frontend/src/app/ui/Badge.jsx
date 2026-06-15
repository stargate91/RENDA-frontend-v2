import './Badge.css';

export default function Badge({
  children,
  family = 'default',
  tone = 'neutral',
  variant = 'inline',
  className = '',
  as: Component = 'span',
  ...props
}) {
  return (
    <Component
      className={`ui-badge ui-badge--${family} ui-badge--${tone} ui-badge--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}
