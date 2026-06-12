import Spinner from '@/ui/Spinner';

export default function SettingsLoadingState({ t }) {
  return (
    <div className="settings-overlay settings-overlay--centered">
      <div className="settings-loading-state">
        <Spinner label={t('settingsPage.loading')} />
        <span className="settings-loading-text">
          {t('settingsPage.loading')}
        </span>
      </div>
    </div>
  );
}
