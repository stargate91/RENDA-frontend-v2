export default function OnboardingInfoCard({
  visual,
  kicker,
  title,
  description,
  items = [],
}) {
  return (
    <div className="onboarding-info-panel">
      {visual}
      {kicker ? <span className="welcome-kicker">{kicker}</span> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}

      {items.length > 0 ? (
        <div className="feature-list">
          {items.map(({ icon: Icon, title: itemTitle, description: itemDescription }) => (
            <div className="feature-item" key={itemTitle}>
              <span className="feature-icon">{Icon ? <Icon size={18} /> : null}</span>
              <div>
                <strong>{itemTitle}</strong>
                <p>{itemDescription}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
