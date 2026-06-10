export default function ToastViewport({ toasts }) {
  return (
    <div className="ui-toast-viewport" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`ui-toast ui-toast--${toast.tone}`}>
          <div className="ui-toast__title">{toast.title}</div>
        </div>
      ))}
    </div>
  );
}
