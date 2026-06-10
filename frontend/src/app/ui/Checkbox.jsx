import './Checkbox.css';

export default function Checkbox({ checked, onChange, disabled, className = '', ...props }) {
  return (
    <label className={`ui-checkbox-wrap ${disabled ? 'is-disabled' : ''} ${className}`.trim()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="ui-checkbox-input"
        {...props}
      />
      <span className="ui-checkbox" />
    </label>
  );
}
