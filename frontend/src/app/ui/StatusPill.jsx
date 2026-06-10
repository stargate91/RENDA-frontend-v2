import './StatusPill.css';

export default function StatusPill({ children, tone = 'default', className = '', ...props }) {
  return (
    <span className={`ui-status-pill ui-status-pill--${tone} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}
