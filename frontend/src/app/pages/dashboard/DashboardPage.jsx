import { useSettingsQuery } from '@/queries/settingsQueries';
import Page from '@/ui/Page';
import PageHeader from '@/ui/PageHeader';
import { useTranslation } from '@/providers/LanguageContext';
import './DashboardPage.css';

export default function DashboardPage() {
  const { data: settings, isLoading: isSettingsLoading } = useSettingsQuery();
  const { t } = useTranslation();
  const isLoading = isSettingsLoading;

  if (isLoading) {
    return (
      <Page className="dashboard-page" contentBottom>
        <div className="dashboard-loading">
          <div className="dashboard-spinner" />
        </div>
      </Page>
    );
  }

  const displayName = settings?.user_name?.trim();
  const welcomeTitle = displayName
    ? `${t('dashboard.welcome') || 'Welcome'} ${displayName},`
    : (t('dashboard.welcome') || 'Welcome');

  return (
    <Page className="dashboard-page" contentBottom>
      <div className="dashboard-container">
        <PageHeader
          title={welcomeTitle}
          description={t('dashboard.subtitle')}
        />
      </div>
    </Page>
  );
}
