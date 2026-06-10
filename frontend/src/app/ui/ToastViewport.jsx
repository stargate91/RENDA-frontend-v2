import { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import './Feedback.css';

function ToastItem({ toast, onRemove }) {
  const { id, title, tone, duration } = toast;
  const timerRef = useRef(null);
  const remainingTimeRef = useRef(duration);
  const startTimeRef = useRef(null);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      onRemove(id);
    }, remainingTimeRef.current);
  }, [id, onRemove]);

  const pauseTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      remainingTimeRef.current -= Date.now() - startTimeRef.current;
    }
  };

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [startTimer]);

  return (
    <div
      className={`ui-toast ui-toast--${tone}`}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
    >
      <div className="ui-toast__header">
        <h4 className="ui-toast__title">{title}</h4>
        <button
          type="button"
          className="ui-toast__close"
          onClick={() => onRemove(id)}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default function ToastViewport({ toasts, onRemoveToast }) {
  return (
    <div className="ui-toast-viewport" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemoveToast} />
      ))}
    </div>
  );
}
