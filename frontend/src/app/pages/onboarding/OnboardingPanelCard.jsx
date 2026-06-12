export default function OnboardingPanelCard({
  className = '',
  eyebrow,
  title,
  meta,
  description,
  children,
  footerLabel,
  footerValue,
}) {
  return (
    <div className={`onboarding-form-panel welcome-lang-panel ${className}`.trim()}>
      <div className="welcome-lang-panel-shell">
        <div className="welcome-lang-header">
          <div>
            {eyebrow ? <span className="welcome-lang-eyebrow">{eyebrow}</span> : null}
            <h3>{title}</h3>
          </div>
          {meta}
        </div>
        {description ? <p>{description}</p> : null}
      </div>

      <div className="welcome-lang-panel-body">{children}</div>

      {(footerLabel || footerValue) ? (
        <div className="welcome-lang-panel-footer">
          <span className="welcome-lang-footer-label">{footerLabel}</span>
          <strong>{footerValue}</strong>
        </div>
      ) : null}
    </div>
  );
}
