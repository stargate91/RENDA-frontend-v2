import { ArrowLeft } from 'lucide-react';
import './NavButton.css';

export default function NavButton({
  children,
  className = '',
  icon: Icon = ArrowLeft,
  iconPosition = 'left',
  ...props
}) {
  return (
    <button
      type="button"
      className={`ui-nav-button ui-nav-button--icon-${iconPosition} ${className}`.trim()}
      {...props}
    >
      {Icon ? <Icon size={14} className="ui-nav-button__icon" /> : null}
      <span className="ui-nav-button__label">{children}</span>
    </button>
  );
}
