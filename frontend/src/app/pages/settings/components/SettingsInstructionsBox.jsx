export default function SettingsInstructionsBox({ title, steps }) {
  return (
    <div className="settings-instructions-box">
      <div className="settings-instructions-title">
        {title}
      </div>
      <ol className="settings-instructions-list">
        {steps.map((step, index) => (
          <li key={index}>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
