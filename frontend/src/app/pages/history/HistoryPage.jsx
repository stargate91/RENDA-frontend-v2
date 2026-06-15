import Page from '@/ui/Page';
import EmptyState from '@/ui/EmptyState';
import Button from '@/ui/Button';
import Spinner from '@/ui/Spinner';
import PageHeader from '@/ui/PageHeader';
import { useTranslation } from '@/providers/LanguageContext';
import { useUi } from '@/providers/UiProvider';
import { useHistoryQuery, useUndoMutation, useScanStatusQuery } from '@/queries';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import HistoryCard from './components/HistoryCard';
import './HistoryPage.css';

export default function HistoryPage() {
  const { t } = useTranslation();
  const { openModal, closeModal, toast } = useUi();
  const { data: history, isLoading: isHistoryLoading } = useHistoryQuery();
  const { data: scanStatus } = useScanStatusQuery();
  const undoMutation = useUndoMutation();

  const isAnyTaskActive = scanStatus?.active;
  const isUndoing = scanStatus?.active && scanStatus?.phase === 'undoing';

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
              undoMutation.mutate(batch.id, {
                onSuccess: () => {
                  toast(t('historyPage.toastStartedDesc') || 'Reverting batch in the background...', 'success');
                },
                onError: (err) => {
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

  const renderContent = () => {
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
    const mostRecentReversibleBatch = history.find(b => b.status !== 'undone');
    const mostRecentReversibleBatchId = mostRecentReversibleBatch ? mostRecentReversibleBatch.id : null;

    return (
      <div className="history-list">
        {history.map((batch, index) => (
          <HistoryCard
            key={batch.id}
            batch={batch}
            index={index}
            isLatestReversible={batch.id === mostRecentReversibleBatchId}
            isAnyTaskActive={isAnyTaskActive}
            isUndoing={isUndoing}
            onConfirmUndo={handleConfirmUndo}
          />
        ))}
      </div>
    );
  };

  return (
    <Page>
      <div className="history-page">
        <PageHeader
          title={t('historyPage.pageTitle') || 'Rename history'}
          description={t('historyPage.pageDesc') || 'Review and revert past physical organization and renaming actions.'}
        />

        {isUndoing && (
          <div className="history-page__undo-banner">
            <Spinner size={16} />
            <span className="history-page__undo-banner-text">
              {t('historyPage.undoActiveProgress') || 'Reverting batch organization files in the background...'}
            </span>
          </div>
        )}

        {renderContent()}
      </div>
    </Page>
  );
}
