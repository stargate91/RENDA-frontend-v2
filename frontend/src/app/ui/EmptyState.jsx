export default function EmptyState({
  title,
  description,
  icon: Icon = null,
  actions = null,
  className = '',
}) {
  return (
    <div className={`ui-empty-state ${className}`.trim()}>
      {Icon ? (
        <div className="ui-empty-state__icon" aria-hidden="true">
          <Icon size={22} />
        </div>
      ) : null}
      <div className="ui-empty-state__body">
        <h3 className="ui-empty-state__title">{title}</h3>
        {description ? <p className="ui-empty-state__description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-empty-state__actions">{actions}</div> : null}
    </div>
  );
}
