import { sendWindowEvent } from '../lib/ipc';

export default function useWindowControls() {
  const minimize = () => sendWindowEvent('window-minimize');
  const toggleMaximize = () => sendWindowEvent('window-maximize-toggle');
  const close = () => sendWindowEvent('app-quit');
  const resizeToMinimum = () => sendWindowEvent('window-resize-to-minimum');

  return {
    minimize,
    toggleMaximize,
    close,
    resizeToMinimum,
  };
}
