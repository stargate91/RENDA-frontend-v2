export default function StatusPill({ children, tone = 'default', className = '' }) {
  return (
    <span className={`ui-status-pill ui-status-pill--${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}
