import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Page from '@/ui/Page';
import EmptyState from '@/ui/EmptyState';
import Button from '@/ui/Button';
import Spinner from '@/ui/Spinner';
import PageHeader from '@/ui/PageHeader';
import SegmentedControl from '@/ui/SegmentedControl';
import { useTranslation } from '@/providers/LanguageContext';
import { useUi } from '@/providers/UiProvider';
import { useHistoryQuery, useUndoMutation, useScanStatusQuery, useWatchedHistoryQuery, usePlayMediaMutation } from '@/queries';
import { RotateCcw, AlertTriangle, Play, CheckCircle2, Clock, Tv, Film } from 'lucide-react';
import { API_BASE } from '@/lib/backend';
import HistoryCard from './components/HistoryCard';
import './HistoryPage.css';

const getPosterUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
};

const formatTime = (seconds) => {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${mStr}:${sStr}`;
  }
  return `${m}:${sStr}`;
};

export default function HistoryPage() {
  const { t } = useTranslation();
  const { openModal, closeModal, toast } = useUi();
  const [activeTab, setActiveTab] = useState('rename');
  const [utilityBarTarget, setUtilityBarTarget] = useState(null);

  useEffect(() => {
    setUtilityBarTarget(document.getElementById('shell-utility-bar-center'));
  }, []);

  // Rename History
  const { data: history, isLoading: isHistoryLoading } = useHistoryQuery();
  const { data: scanStatus } = useScanStatusQuery();
  const undoMutation = useUndoMutation();
  const [revertingBatchIds, setRevertingBatchIds] = useState(new Set());

  const isAnyTaskActive = scanStatus?.active;
  const isUndoing = scanStatus?.active && scanStatus?.phase === 'undoing';

  // Playback History
  const { data: watchedHistory, isLoading: isWatchedLoading } = useWatchedHistoryQuery();
  const playMutation = usePlayMediaMutation();

  const handleConfirmUndo = (batch) => {
    openModal({
      title: t('historyPage.confirmTitle') || 'Confirm Action Reversion',
      description: t('historyPage.confirmDesc') || 'This will physically move and rename all successfully organized files back to their previous naming scheme and folders.',
      icon: AlertTriangle,
      content: (
        <div className="history-undo-modal">
          <p className="history-undo-modal__warning">
            {t('historyPage.confirmWarning') || 'Are you sure you want to revert this batch?'}
          </p>
          <div className="history-undo-modal__details">
            <div className="history-undo-modal__row">
              <span className="history-undo-modal__label">{t('historyPage.batchLabel') || 'Batch:'}</span>
              <span className="history-undo-modal__value">{batch.name}</span>
            </div>
            <div className="history-undo-modal__row">
              <span className="history-undo-modal__label">{t('historyPage.filesLabel') || 'Files:'}</span>
              <span className="history-undo-modal__value--success">
                {t('historyPage.succeededCount', { defaultValue: '{{count}} succeeded', count: batch.success_count })}
              </span>
            </div>
          </div>
        </div>
      ),
      footer: (
        <div className="history-undo-modal__footer">
          <Button variant="secondary-neutral" onClick={closeModal}>
            {t('common.cancel') || 'Cancel'}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              closeModal();
              setRevertingBatchIds((prev) => {
                const next = new Set(prev);
                next.add(batch.id);
                return next;
              });
              undoMutation.mutate(batch.id, {
                onSuccess: () => {
                  toast(t('historyPage.toastStartedDesc') || 'Reverting batch in the background...', 'success');
                },
                onError: (err) => {
                  setRevertingBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(batch.id);
                    return next;
                  });
                  toast(err?.message || t('historyPage.toastErrorDesc') || 'Could not launch undo operation.', 'danger');
                }
              });
            }}
          >
            {t('historyPage.confirmButton') || 'Revert Action'}
          </Button>
        </div>
      ),
    });
  };

  const handlePlay = (itemId) => {
    playMutation.mutate(itemId);
  };

  const renderRenameContent = () => {
    if (isHistoryLoading) {
      return (
        <div className="history-page__loading-container">
          <Spinner size={32} />
        </div>
      );
    }

    if (!history || history.length === 0) {
      return (
        <div className="history-page__empty-container">
          <EmptyState
            title={t('historyPage.emptyTitle') || 'No action history'}
            description={t('historyPage.emptyDesc') || 'Reversible file organization batches will be listed here.'}
            icon={RotateCcw}
          />
        </div>
      );
    }

    return (
      <div className="history-list">
        {history.map((batch, index) => (
          <HistoryCard
            key={batch.id}
            batch={batch}
            index={index}
            isAnyTaskActive={isAnyTaskActive}
            isUndoing={isUndoing}
            isReverting={revertingBatchIds.has(batch.id)}
            onConfirmUndo={handleConfirmUndo}
          />
        ))}
      </div>
    );
  };

  const renderWatchedContent = () => {
    if (isWatchedLoading) {
      return (
        <div className="watched-history-page__loading-container">
          <Spinner size={32} />
        </div>
      );
    }

    if (!watchedHistory || watchedHistory.length === 0) {
      return (
        <div className="watched-history-page__empty-container">
          <EmptyState
            title={t('historyPage.watchedEmptyTitle') || 'No playback history'}
            description={t('historyPage.watchedEmptyDesc') || 'Your recently watched movies and series will be listed here.'}
            icon={Clock}
          />
        </div>
      );
    }

    return (
      <div className="watched-history-list">
        {watchedHistory.map((log, index) => {
          const isMovie = log.type === 'movie';
          const poster = isMovie ? log.poster_path : (log.series_poster_path || log.poster_path);
          const posterUrl = getPosterUrl(poster);
          const percent = log.duration > 0 ? Math.round((log.resume_position / log.duration) * 100) : 0;

          return (
            <div
              key={log.id}
              className="watched-history-card"
              style={{ '--item-index': index }}
            >
              <div className="watched-history-card__poster-wrapper">
                {posterUrl ? (
                  <img src={posterUrl} alt="" className="watched-history-card__poster" />
                ) : (
                  <div className="watched-history-card__poster-placeholder">
                    {isMovie ? <Film size={18} /> : <Tv size={18} />}
                  </div>
                )}
              </div>

              <div className="watched-history-card__content">
                <div className="watched-history-card__header">
                  {isMovie ? (
                    <div className="watched-history-card__title-group">
                      <h3 className="watched-history-card__title">{log.title}</h3>
                      {log.year && <span className="watched-history-card__year">({log.year})</span>}
                    </div>
                  ) : (
                    <div className="watched-history-card__title-group">
                      <h3 className="watched-history-card__title">{log.series_title}</h3>
                      <span className="watched-history-card__episode-info">
                        S{String(log.season_number).padStart(2, '0')}E{String(log.episode_number).padStart(2, '0')} - {log.episode_title || log.title}
                      </span>
                    </div>
                  )}
                </div>

                <div className="watched-history-card__meta">
                  <div className="watched-history-card__meta-item">
                    <Clock size={12} />
                    <span>{new Date(log.watched_at).toLocaleString()}</span>
                  </div>

                  {log.is_watched ? (
                    <div className="watched-history-card__status watched-history-card__status--watched">
                      <CheckCircle2 size={12} />
                      <span>{t('historyPage.watchedStatus') || 'Watched'}</span>
                    </div>
                  ) : (
                    percent > 0 && (
                      <div className="watched-history-card__progress-info">
                        <span className="watched-history-card__percent">{percent}%</span>
                        <span className="watched-history-card__time">
                          ({formatTime(log.resume_position)} / {formatTime(log.duration)})
                        </span>
                      </div>
                    )
                  )}
                </div>

                {!log.is_watched && percent > 0 && (
                  <div className="watched-history-card__progress-bar-wrapper">
                    <div
                      className="watched-history-card__progress-bar"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="watched-history-card__right">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePlay(log.media_item_id)}
                  disabled={playMutation.isPending && playMutation.variables === log.media_item_id}
                  icon={
                    playMutation.isPending && playMutation.variables === log.media_item_id ? (
                      <Spinner size={14} />
                    ) : log.is_watched ? (
                      <RotateCcw size={14} />
                    ) : (
                      <Play size={14} />
                    )
                  }
                >
                  {log.is_watched
                    ? t('historyPage.watchedRewatch') || 'Rewatch'
                    : t('historyPage.watchedContinue') || 'Continue'
                  }
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Page>
      {utilityBarTarget && createPortal(
        <SegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'rename', label: t('historyPage.tabRename') || 'Rename Logs' },
            { value: 'watched', label: t('historyPage.tabWatched') || 'Playback Logs' }
          ]}
        />,
        utilityBarTarget
      )}
      <div className="history-page">
        <PageHeader
          title={activeTab === 'rename' ? (t('historyPage.pageTitle') || 'Rename history') : (t('historyPage.watchedPageTitle') || 'Watched History')}
          description={activeTab === 'rename' ? (t('historyPage.pageDesc') || 'Review and revert past physical organization and renaming actions.') : (t('historyPage.watchedPageDesc') || 'See recently watched items and playback activity.')}
        />

        {activeTab === 'rename' ? renderRenameContent() : renderWatchedContent()}
      </div>
    </Page>
  );
}
