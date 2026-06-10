import './Feedback.css';

export default function ProgressBar({ taskName, progress = 0, timeRemaining = '--:--', active = true, variant = 'primary' }) {
  const isSub = variant === 'sub';
  const containerClass = `ui-progress-bar-container ${isSub ? 'ui-progress-bar-container--sub' : ''}`.trim();
  const dotClass = `ui-progress-bar__pulse-dot ${isSub ? 'ui-progress-bar__pulse-dot--sub' : ''}`.trim();
  const fillClass = `ui-progress-bar__fill ${isSub ? 'ui-progress-bar__fill--sub' : ''}`.trim();

  return (
    <div className={containerClass}>
      {active && <span className={dotClass} />}
      <span className="ui-progress-bar__text" title={taskName}>
        {taskName}
      </span>
      <div className="ui-progress-bar__track">
        <div className={fillClass} style={{ width: `${progress}%` }} />
      </div>
      <span className="ui-progress-bar__stats">
        {progress}% | {timeRemaining}
      </span>
    </div>
  );
}
