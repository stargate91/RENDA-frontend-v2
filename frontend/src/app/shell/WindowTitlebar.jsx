import { Minus, Square, X, AlertTriangle } from 'lucide-react';
import UtilityButton from '../ui/UtilityButton';
import ProgressBar from '../ui/ProgressBar';
import Button from '../ui/Button';
import Tooltip from '../ui/Tooltip';
import api from '../lib/api';
import { useUi } from '../providers/UiProvider';
import { useTranslation } from '../providers/LanguageProvider';
import useWindowProgress from './useWindowProgress';
import useWindowControls from './useWindowControls';

export default function WindowTitlebar() {
  const { hasProgress, scanProgress, imageProgress, hydrateProgress, syncProgress } = useWindowProgress();
  const { openModal, closeModal, toast } = useUi();
  const { t } = useTranslation();
  const { minimize, toggleMaximize, close, resizeToMinimum } = useWindowControls();

  const handleAbort = (type) => {
    let titleKey = 'progress.abortConfirm.title';
    let descKey = 'progress.abortConfirm.description';
    let bodyKey = 'progress.abortConfirm.body';

    if (type === 'images') {
      titleKey = 'progress.abortConfirm.titleImages';
      descKey = 'progress.abortConfirm.descriptionImages';
      bodyKey = 'progress.abortConfirm.bodyImages';
    } else if (type === 'people') {
      titleKey = 'progress.abortConfirm.titlePeople';
      descKey = 'progress.abortConfirm.descriptionPeople';
      bodyKey = 'progress.abortConfirm.bodyPeople';
    } else if (type === 'sync') {
      titleKey = 'progress.abortConfirm.titleSync';
      descKey = 'progress.abortConfirm.descriptionSync';
      bodyKey = 'progress.abortConfirm.bodySync';
    }

    openModal({
      title: t(titleKey),
      description: t(descKey),
      icon: AlertTriangle,
      variant: 'danger',
      content: (
        <div className="ui-modal__body-text">
          {t(bodyKey)}
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
                await api.task.stop();
              } catch (err) {
                console.error('Failed to stop background task:', err);
                toast(err.message || t('organizer.toasts.abortTaskFailed'), 'danger');
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
        onDoubleClick={resizeToMinimum}
      >
        <span className="window-titlebar__brand-text">RENDA</span>
      </div>

      {hasProgress ? (
        <div className="window-titlebar__progress">
          {scanProgress ? <ProgressBar {...scanProgress} onAbort={() => handleAbort('scan')} /> : null}
          {imageProgress ? <ProgressBar {...imageProgress} variant="sub" onAbort={() => handleAbort('images')} /> : null}
          {hydrateProgress ? <ProgressBar {...hydrateProgress} variant="sub" onAbort={() => handleAbort('people')} /> : null}
          {syncProgress ? <ProgressBar {...syncProgress} variant="sub" onAbort={() => handleAbort('sync')} /> : null}
        </div>
      ) : null}

      <div className="window-titlebar__actions">
        <Tooltip content={t('titlebar.minimize')} side="bottom">
          <UtilityButton
            type="button"
            className="window-titlebar__button"
            size="titlebar"
            tabIndex={-1}
            aria-label="Minimize window"
            onClick={minimize}
          >
            <Minus size={16} />
          </UtilityButton>
        </Tooltip>
        <Tooltip content={t('titlebar.maximize')} side="bottom">
          <UtilityButton
            type="button"
            className="window-titlebar__button"
            size="titlebar"
            tabIndex={-1}
            aria-label="Maximize window"
            onClick={toggleMaximize}
          >
            <Square size={14} />
          </UtilityButton>
        </Tooltip>
        <Tooltip content={t('titlebar.close')} side="bottom">
          <UtilityButton
            type="button"
            className="window-titlebar__button window-titlebar__button--close"
            size="titlebar"
            danger
            tabIndex={-1}
            aria-label="Close window"
            onClick={close}
          >
            <X size={16} />
          </UtilityButton>
        </Tooltip>
      </div>
    </header>
  );
}
