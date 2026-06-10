export default function Inline({ className = '', children }) {
  return (
    <div className={`ui-inline ${className}`.trim()}>
      {children}
    </div>
  );
}
