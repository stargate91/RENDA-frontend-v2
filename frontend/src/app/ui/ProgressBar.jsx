import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import IconButton from './IconButton';
import Tooltip from './Tooltip';
import './Feedback.css';

export default function ProgressBar({ taskName, progress = 0, timeRemaining = '--:--', active = true, variant = 'primary', onAbort }) {
  const isSub = variant === 'sub';
  const fillRef = useRef(null);
  const containerClass = `ui-progress-bar-container ${isSub ? 'ui-progress-bar-container--sub' : ''}`.trim();
  const dotClass = `ui-progress-bar__pulse-dot ${isSub ? 'ui-progress-bar__pulse-dot--sub' : ''}`.trim();
  const fillClass = `ui-progress-bar__fill ${isSub ? 'ui-progress-bar__fill--sub' : ''}`.trim();

  useEffect(() => {
    if (!fillRef.current) return;
    fillRef.current.style.setProperty('--ui-progress-value', `${progress}%`);
  }, [progress]);

  return (
    <div className={containerClass}>
      {active && <span className={dotClass} />}
      <span className="ui-progress-bar__text" title={taskName}>
        {taskName}
      </span>
      <div className="ui-progress-bar__track">
        <div ref={fillRef} className={fillClass} />
      </div>
      <span className="ui-progress-bar__stats">
        {progress}% | {timeRemaining}
      </span>
      {onAbort && (
        <Tooltip content="Abort task" side="bottom">
          <IconButton
            variant="danger"
            size="xs"
            onClick={onAbort}
            title={null}
          >
            <X size={10} strokeWidth={2.5} />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
}

