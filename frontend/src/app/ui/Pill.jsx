import './Pill.css';

export default function Pill({ children, variant = 'default', className = '', as: Component = 'span', ...props }) {
  const DefaultComponent = props.onClick ? 'button' : Component;
  return (
    <DefaultComponent
      type={DefaultComponent === 'button' ? 'button' : undefined}
      className={`ui-pill ui-pill--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </DefaultComponent>
  );
}
