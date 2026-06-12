import { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useClearDatabaseMutation } from '@/queries';
import Button from '@/ui/Button';

export default function useSettingsDangerZone({
  t,
  toast,
  openModal,
  closeModal,
  onBeforeWipe,
}) {
  const clearDbMutation = useClearDatabaseMutation();
  const [isWiping, setIsWiping] = useState(false);

  const handleWipeDatabase = useCallback(() => {
    openModal({
      title: t('settingsPage.dangerZone.confirmTitle'),
      icon: AlertTriangle,
      variant: 'danger',
      content: (
        <p className="ui-modal__body-text">
          {t('settingsPage.dangerZone.confirm')}
        </p>
      ),
      footer: (
        <>
          <Button variant="secondary-neutral" onClick={closeModal}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              closeModal();
              setIsWiping(true);

              try {
                onBeforeWipe?.();
                await clearDbMutation.mutateAsync({ wipe: true });
                toast(t('settingsPage.dangerZone.success'), 'success');
              } catch (error) {
                toast(error.message || t('settingsPage.dangerZone.failed'), 'danger');
              } finally {
                setIsWiping(false);
              }
            }}
          >
            {t('settingsPage.dangerZone.button')}
          </Button>
        </>
      ),
    });
  }, [clearDbMutation, closeModal, onBeforeWipe, openModal, t, toast]);

  return {
    isWiping,
    handleWipeDatabase,
  };
}
