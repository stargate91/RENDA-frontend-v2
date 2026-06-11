export default function Inline({ className = '', children, ...props }) {
  return (
    <div className={`ui-inline ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
