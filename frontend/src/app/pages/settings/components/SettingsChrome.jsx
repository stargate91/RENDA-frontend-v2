import { X } from 'lucide-react';
import IconButton from '@/ui/IconButton';

export default function SettingsChrome({ t, onClose }) {
  return (
    <div className="settings-close-container">
      <IconButton
        className="settings-close-btn"
        onClick={onClose}
        label={t('settingsPage.closeSettings')}
        title={null}
        size="md"
      >
        <X size={18} />
      </IconButton>
      <span className="settings-close-esc-hint">{t('settingsPage.closeShortcut')}</span>
    </div>
  );
}
