import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Checkbox from '../ui/Checkbox';
import { useSettingsQuery, useUpdateSettingsMutation } from '../queries';
import { useTranslation } from '../providers/LanguageProvider';
import { sendIpc, onIpc } from '../lib/electron';

const sendCloseResponse = (payload) => {
  sendIpc('app-close-response', payload);
};

export default function AppClosePrompt() {
  const settingsQuery = useSettingsQuery();
  const updateSettingsMutation = useUpdateSettingsMutation();
  const closeBehavior = settingsQuery.data?.close_button_behavior || 'ask';
  const [isOpen, setIsOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const handleCloseRequested = (_event, payload = {}) => {
      const source = payload?.source || 'quit-button';

      if (closeBehavior === 'tray') {
        sendCloseResponse({ action: 'minimize-to-tray', rememberChoice: true, source });
        return;
      }

      if (closeBehavior === 'quit') {
        sendCloseResponse({ action: 'quit', rememberChoice: true, source });
        return;
      }

      setIsOpen(true);
    };

    const unsubscribe = onIpc('app-close-requested', handleCloseRequested);
    return () => {
      unsubscribe();
    };
  }, [closeBehavior]);

  const handleAction = async (action) => {
    setIsOpen(false);
    
    if (remember && (action === 'minimize-to-tray' || action === 'quit')) {
      const targetBehavior = action === 'minimize-to-tray' ? 'tray' : 'quit';
      try {
        await updateSettingsMutation.mutateAsync({
          close_button_behavior: targetBehavior,
        });
      } catch (err) {
        console.error('Failed to save close behavior:', err);
      }
    }
    
    sendCloseResponse({ action, rememberChoice: remember, source: 'quit-button' });
    setRemember(false);
  };

  return (
    <Modal
      open={isOpen}
      onClose={() => handleAction('cancel')}
      title={t('closePrompt.title')}
      description={t('closePrompt.description')}
      variant="danger"
      icon={AlertTriangle}
      footer={(
        <>
          <Button variant="secondary-neutral" onClick={() => handleAction('cancel')}>{t('closePrompt.action.cancel')}</Button>
          <Button variant="secondary-neutral" onClick={() => handleAction('minimize-to-tray')}>{t('closePrompt.action.tray')}</Button>
          <Button variant="danger" onClick={() => handleAction('quit')}>{t('closePrompt.action.quit')}</Button>
        </>
      )}
    >
      <p className="support-copy shell__close-prompt-copy">{t('closePrompt.info')}</p>
      <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)}>
        {t('closePrompt.dontAskAgain')}
      </Checkbox>
    </Modal>
  );
}
