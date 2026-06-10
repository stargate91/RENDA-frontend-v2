import { ArrowLeft } from 'lucide-react';
import './NavButton.css';

export default function NavButton({
  children,
  className = '',
  ...props
}) {
  return (
    <button
      type="button"
      className={`ui-nav-button ${className}`.trim()}
      {...props}
    >
      <ArrowLeft size={14} className="ui-nav-button__icon" />
      <span className="ui-nav-button__label">{children}</span>
    </button>
  );
}
