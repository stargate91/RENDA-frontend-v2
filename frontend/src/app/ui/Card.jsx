export default function Card({ title, eyebrow, actions, children, className = '' }) {
  return (
    <section className={`ui-card ${className}`.trim()}>
      {(title || eyebrow || actions) ? (
        <header className="ui-card__header">
          <div>
            {eyebrow ? <div className="ui-card__eyebrow">{eyebrow}</div> : null}
            {title ? <h2 className="ui-card__title">{title}</h2> : null}
          </div>
          {actions ? <div className="ui-card__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="ui-card__body">{children}</div>
    </section>
  );
}
