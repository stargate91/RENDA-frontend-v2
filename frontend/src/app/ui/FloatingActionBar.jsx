export default function FloatingActionBar({
  visible = false,
  eyebrow,
  title,
  description,
  actions = [],
}) {
  return (
    <div className={`ui-floating-bar-shell${visible ? ' is-visible' : ''}`}>
      <div className="ui-floating-bar" aria-hidden={visible ? undefined : true}>
        <div className="ui-floating-bar__copy">
          {eyebrow ? <span className="ui-floating-bar__eyebrow">{eyebrow}</span> : null}
          {title ? <strong className="ui-floating-bar__title">{title}</strong> : null}
          {description ? <span className="ui-floating-bar__description">{description}</span> : null}
        </div>
        <div className="ui-floating-bar__actions">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`ui-floating-bar__action ${action.className || ''}`.trim()}
              onClick={action.onClick}
              disabled={action.disabled}
              aria-label={action.label}
              title={action.label}
            >
              {action.icon ? <action.icon size={16} /> : null}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
