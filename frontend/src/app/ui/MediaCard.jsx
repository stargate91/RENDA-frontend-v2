export default function MediaCard({ as: Component = 'div', className = '', children, ...props }) {
  return (
    <Component className={`ui-media-card ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}
