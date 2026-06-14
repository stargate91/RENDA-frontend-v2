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
        <div style={{ padding: 'var(--space-2) 0' }}>
          <p style={{ color: 'var(--text-color-primary)', fontSize: 'var(--font-size-md)', margin: '0 0 var(--space-4) 0' }}>
            {t('historyPage.confirmWarning') || 'Are you sure you want to revert this batch?'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', background: 'var(--ui-surface-soft)', padding: 'var(--space-3)', borderRadius: 'var(--border-radius-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)' }}>
              <span style={{ color: 'var(--text-color-secondary)' }}>Batch:</span>
              <span style={{ color: 'var(--text-color-primary)', fontWeight: 'var(--font-weight-semibold)' }}>{batch.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)' }}>
              <span style={{ color: 'var(--text-color-secondary)' }}>Files:</span>
              <span style={{ color: 'var(--color-positive-muted)', fontWeight: 'var(--font-weight-bold)' }}>{batch.success_count} succeeded</span>
            </div>
          </div>
        </div>
      ),
      footer: (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', width: '100%' }}>
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
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
          <Spinner size={32} />
        </div>
      );
    }

    if (!history || history.length === 0) {
      return (
        <div style={{ marginTop: 'var(--space-5)' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'var(--ui-surface-soft)', border: '1px solid var(--ui-border-soft)', padding: 'var(--space-4)', borderRadius: 'var(--border-radius-md)', marginBottom: 'var(--space-6)' }}>
            <Spinner size={16} />
            <span style={{ color: 'var(--text-color-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>
              {t('historyPage.undoActiveProgress') || 'Reverting batch organization files in the background...'}
            </span>
          </div>
        )}

        {renderContent()}
      </div>
    </Page>
  );
}
