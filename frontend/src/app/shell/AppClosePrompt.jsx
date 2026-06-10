import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useSettingsQuery } from '../queries/appQueries';

const sendCloseResponse = (payload) => {
  try {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('app-close-response', payload);
  } catch {
    // Ignore non-Electron environments.
  }
};

export default function AppClosePrompt() {
  const settingsQuery = useSettingsQuery();
  const closeBehavior = settingsQuery.data?.close_button_behavior || 'ask';
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let ipcRenderer;

    try {
      ({ ipcRenderer } = window.require('electron'));
    } catch {
      return undefined;
    }

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

    ipcRenderer.on('app-close-requested', handleCloseRequested);
    return () => {
      ipcRenderer.removeListener('app-close-requested', handleCloseRequested);
    };
  }, [closeBehavior]);

  const handleAction = (action) => {
    setIsOpen(false);
    sendCloseResponse({ action, rememberChoice: false, source: 'quit-button' });
  };

  return (
    <Modal
      open={isOpen}
      onClose={() => handleAction('cancel')}
      title="Close RENDA?"
      description="Choose whether to quit the app or minimize it to the tray."
      variant="danger"
      icon={AlertTriangle}
      footer={(
        <>
          <Button variant="secondary-neutral" onClick={() => handleAction('cancel')}>Cancel</Button>
          <Button variant="secondary-neutral" onClick={() => handleAction('minimize-to-tray')}>Tray</Button>
          <Button variant="danger" onClick={() => handleAction('quit')}>Quit</Button>
        </>
      )}
    >
      <p className="support-copy">This prompt is connected to the custom Electron titlebar close action.</p>
    </Modal>
  );
}
