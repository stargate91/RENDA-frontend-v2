import './Switch.css';

export default function Switch({
  checked = false,
  onChange,
  disabled = false,
  children,
  className = '',
  id,
}) {
  const handleChange = (e) => {
    if (disabled) return;
    if (onChange) {
      onChange(e);
    }
  };

  return (
    <label className={`ui-switch-container ${className} ${disabled ? 'is-disabled' : ''}`.trim()} htmlFor={id}>
      <div className="ui-switch">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="ui-switch__input"
        />
        <div className="ui-switch__track">
          <div className="ui-switch__thumb" />
        </div>
      </div>
      {children ? <span className="ui-switch__label">{children}</span> : null}
    </label>
  );
}
