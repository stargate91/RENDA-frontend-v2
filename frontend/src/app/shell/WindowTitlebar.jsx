import { Minus, Square, X } from 'lucide-react';
import UtilityButton from '../ui/UtilityButton';
import ProgressBar from '../ui/ProgressBar';
import { sendWindowEvent } from '../lib/ipc';
import useWindowProgress from './useWindowProgress';

export default function WindowTitlebar() {
  const { hasProgress, scanProgress, imageProgress } = useWindowProgress();

  return (
    <header className="window-titlebar">
      <div
        className="window-titlebar__drag-region"
        onDoubleClick={() => sendWindowEvent('window-resize-to-minimum')}
      >
        <span className="window-titlebar__brand-shell">
          <img src="/favicon/32x32.png" alt="RENDA" className="window-titlebar__brand-icon" />
        </span>
      </div>

      {hasProgress ? (
        <div className="window-titlebar__progress">
          {scanProgress ? <ProgressBar {...scanProgress} /> : null}
          {imageProgress ? <ProgressBar {...imageProgress} /> : null}
        </div>
      ) : null}

      <div className="window-titlebar__actions">
        <UtilityButton
          type="button"
          className="window-titlebar__button"
          size="titlebar"
          tabIndex={-1}
          aria-label="Minimize window"
          onClick={() => sendWindowEvent('window-minimize')}
        >
          <Minus size={16} />
        </UtilityButton>
        <UtilityButton
          type="button"
          className="window-titlebar__button"
          size="titlebar"
          tabIndex={-1}
          aria-label="Maximize window"
          onClick={() => sendWindowEvent('window-maximize-toggle')}
        >
          <Square size={14} />
        </UtilityButton>
        <UtilityButton
          type="button"
          className="window-titlebar__button window-titlebar__button--close"
          size="titlebar"
          danger
          tabIndex={-1}
          aria-label="Close window"
          onClick={() => sendWindowEvent('app-quit')}
        >
          <X size={16} />
        </UtilityButton>
      </div>
    </header>
  );
}
