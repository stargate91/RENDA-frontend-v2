import { HelpCircle } from 'lucide-react';
import Button from '../../../ui/Button';
import Checkbox from '../../../ui/Checkbox';

export default function MatchModalConfirmDialog({
  confirmState,
  dontShowAgain,
  setDontShowAgain,
  onCancel,
  onConfirm,
  t,
}) {
  if (!confirmState) return null;

  return (
    <div className="ui-confirm-overlay">
      <div className="ui-confirm-dialog">
        <div className="ui-confirm-header">
          <HelpCircle size={20} className="ui-confirm-icon" />
          <strong className="ui-confirm-title">
            {t(`organizer.details.matchModal.confirm.${confirmState.type}.title`)}
          </strong>
        </div>
        <p className="ui-confirm-description">
          {confirmState.type === 'bucket'
            ? t('organizer.details.matchModal.confirm.bucket.desc')
            : confirmState.hasExisting
              ? t(`organizer.details.matchModal.confirm.${confirmState.type}.descWithExisting`).replace('{existing}', confirmState.existingDetails)
              : t(`organizer.details.matchModal.confirm.${confirmState.type}.descNoExisting`)}
        </p>
        <div className="ui-confirm-optout">
          <Checkbox
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          >
            {t('organizer.details.matchModal.confirm.dontShowAgain')}
          </Checkbox>
        </div>
        <div className="ui-confirm-actions">
          <Button
            type="button"
            variant="secondary-neutral"
            size="sm"
            onClick={onCancel}
          >
            {t('organizer.details.matchModal.confirm.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onConfirm}
          >
            {t('organizer.details.matchModal.confirm.confirmBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
