import './Input.css';

export default function Input({ label, hint, className = '', ...props }) {
  return (
    <label className={`ui-field ${className}`.trim()}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      {hint ? <span className="ui-field__hint">{hint}</span> : null}
      <input className="ui-input" {...props} />
    </label>
  );
}
