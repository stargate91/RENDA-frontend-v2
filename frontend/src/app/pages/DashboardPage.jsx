import { useSettingsQuery } from '@/queries/settingsQueries';
import Card from '@/ui/Card';
import Page from '@/ui/Page';
import { useTranslation } from '@/providers/LanguageContext';
import './DashboardPage.css';

export default function DashboardPage() {
  const { data: settings, isLoading } = useSettingsQuery();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Page className="dashboard-page" contentBottom>
        <div className="dashboard-loading">
          <div className="dashboard-spinner" />
        </div>
      </Page>
    );
  }

  const displayName = settings?.user_name ? settings.user_name : 'Guest';

  return (
    <Page className="dashboard-page" contentBottom>
      <div className="dashboard-container">
        <div className="dashboard-welcome-banner">
          <h1>{t('dashboard.welcome', { name: displayName })}</h1>
          <p>{t('dashboard.subtitle')}</p>
        </div>
        <div className="dashboard-grid">
          <Card className="dashboard-stat-card">
            <h3>{t('dashboard.cardTitle')}</h3>
            <p>{t('dashboard.cardDescription')}</p>
          </Card>
        </div>
      </div>
    </Page>
  );
}
