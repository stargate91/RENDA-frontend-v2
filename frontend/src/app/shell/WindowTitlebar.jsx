import { Minus, Square, X, AlertTriangle } from 'lucide-react';
import UtilityButton from '../ui/UtilityButton';
import ProgressBar from '../ui/ProgressBar';
import Button from '../ui/Button';
import { sendWindowEvent } from '../lib/ipc';
import { fetchJson } from '../lib/http';
import { useUi } from '../providers/UiProvider';
import { useTranslation } from '../providers/LanguageProvider';
import useWindowProgress from './useWindowProgress';

export default function WindowTitlebar() {
  const { hasProgress, scanProgress, imageProgress } = useWindowProgress();
  const { openModal, closeModal } = useUi();
  const { t } = useTranslation();

  const handleAbort = () => {
    openModal({
      title: t('progress.abortConfirm.title'),
      description: t('progress.abortConfirm.description'),
      icon: AlertTriangle,
      variant: 'danger',
      content: (
        <div style={{ padding: '4px 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-muted)' }}>
          {t('progress.abortConfirm.body')}
        </div>
      ),
      footer: (
        <>
          <Button variant="secondary-neutral" onClick={closeModal}>
            {t('progress.abortConfirm.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              closeModal();
              try {
                await fetchJson('/api/task/stop', { method: 'POST' });
              } catch (err) {
                console.error('Failed to stop background task:', err);
              }
            }}
          >
            {t('progress.abortConfirm.confirm')}
          </Button>
        </>
      ),
    });
  };

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
          {scanProgress ? <ProgressBar {...scanProgress} onAbort={handleAbort} /> : null}
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
