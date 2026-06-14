import { RotateCcw, Calendar, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import Button from '@/ui/Button';
import Tooltip from '@/ui/Tooltip';
import Spinner from '@/ui/Spinner';
import { useTranslation } from '@/providers/LanguageProvider';

const getCardIconAndClass = (status) => {
  switch (status) {
    case 'completed':
      return {
        icon: <CheckCircle2 size={18} />,
        accentColor: 'var(--color-state-success, #10b981)',
      };
    case 'partial':
      return {
        icon: <AlertTriangle size={18} />,
        accentColor: 'var(--color-state-warning, #f59e0b)',
      };
    case 'undone':
      return {
        icon: <RotateCcw size={18} />,
        accentColor: 'var(--color-text-muted, #94a3b8)',
      };
    default:
      return {
        icon: <Clock size={18} />,
        accentColor: 'var(--color-accent, #1493ff)',
      };
  }
};

export default function HistoryCard({
  batch,
  index,
  isLatestReversible,
  isAnyTaskActive,
  isUndoing,
  onConfirmUndo,
}) {
  const { t } = useTranslation();
  const isUndone = batch.status === 'undone';
  const isRevertDisabled = isUndone || isAnyTaskActive || !isLatestReversible;
  const { icon, accentColor } = getCardIconAndClass(batch.status);

  return (
    <div
      className={`history-card history-card--${batch.status}`}
      style={{ '--item-index': index, '--accent-color': accentColor }}
    >
      <div className="history-card__icon-wrapper">
        {icon}
      </div>
      <div className="history-card__left">
        <div className="history-card__header">
          {batch.success_count > 0 && (
            <div className="history-card__detailed-stats">
              {batch.movie_count > 0 && (
                <div className="history-card__stat-badge">
                  <span className="history-card__badge-val">{batch.movie_count}</span>
                  <span className="history-card__badge-lbl">{t('historyPage.badgeMovies') || 'Movies'}</span>
                </div>
              )}
              {batch.episode_count > 0 && (
                <div className="history-card__stat-badge">
                  <span className="history-card__badge-val">{batch.episode_count}</span>
                  <span className="history-card__badge-lbl">{t('historyPage.badgeEpisodes') || 'Episodes'}</span>
                </div>
              )}
              {batch.extra_count > 0 && (
                <div className="history-card__stat-badge">
                  <span className="history-card__badge-val">{batch.extra_count}</span>
                  <span className="history-card__badge-lbl">{t('historyPage.badgeExtras') || 'Extras'}</span>
                </div>
              )}
              <div className="history-card__stat-badge history-card__stat-badge--total">
                <span className="history-card__badge-val">{batch.success_count}</span>
                <span className="history-card__badge-lbl">{t('historyPage.statTotal') || 'Total'}</span>
              </div>
              {batch.undone_count > 0 && batch.remaining_count > 0 && (
                <>
                  <div className="history-card__stat-badge history-card__stat-badge--undone">
                    <span className="history-card__badge-val">{batch.undone_count}</span>
                    <span className="history-card__badge-lbl">{t('historyPage.statReverted') || 'Reverted'}</span>
                  </div>
                  <div className="history-card__stat-badge history-card__stat-badge--remaining">
                    <span className="history-card__badge-val">{batch.remaining_count}</span>
                    <span className="history-card__badge-lbl">{t('historyPage.statRemaining') || 'Remaining'}</span>
                  </div>
                </>
              )}
            </div>
          )}
          {batch.failed_count > 0 && (
            <div className="history-card__stat-badge history-card__stat-badge--failed">
              <span className="history-card__badge-val">{batch.failed_count}</span>
              <span className="history-card__badge-lbl">{t('historyPage.statFailed') || 'Failed'}</span>
            </div>
          )}
        </div>
        <div className="history-card__meta">
          <div className="history-card__meta-item">
            <Calendar size={14} />
            <span>{new Date(batch.created_at).toLocaleString()}</span>
          </div>
          <div className="history-card__meta-item">
            <Clock size={14} />
            <span>ID: #{batch.id}</span>
          </div>
        </div>
      </div>
      <div className="history-card__right">
        <div className="history-card__actions">
          <Tooltip
            content={
              isUndone
                ? (t('historyPage.alreadyRevertedTooltip') || 'This batch has already been reverted.')
                : (!isLatestReversible ? (t('historyPage.revertDisabledTooltip') || 'Only the most recent batch can be reverted to prevent file structure conflicts.') : null)
            }
            side="left"
          >
            <Button
              variant="secondary-neutral"
              size="sm"
              disabled={isRevertDisabled}
              onClick={() => onConfirmUndo(batch)}
              icon={isUndoing && isAnyTaskActive ? <Spinner size={14} /> : <RotateCcw size={14} />}
            >
              {t('historyPage.revertButton') || 'Revert'}
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
