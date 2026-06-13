import { useSettingsQuery } from '@/queries/settingsQueries';
import Card from '@/ui/Card';
import Page from '@/ui/Page';
import './DashboardPage.css';

export default function DashboardPage() {
  const { data: settings, isLoading } = useSettingsQuery();

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
          <h1>Hello, <span className="highlight">{displayName}</span>!</h1>
          <p>Your media library is looking great. What are we watching today?</p>
        </div>
        <div className="dashboard-grid">
          <Card className="dashboard-stat-card">
            <h3>Welcome to your Dashboard</h3>
            <p>Select scan source or target folder in settings to start organizing your files.</p>
          </Card>
        </div>
      </div>
    </Page>
  );
}
