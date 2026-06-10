export default function Input({ label, hint, className = '', ...props }) {
  return (
    <label className={`ui-field ${className}`.trim()}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      <input className="ui-input" {...props} />
      {hint ? <span className="ui-field__hint">{hint}</span> : null}
    </label>
  );
}
