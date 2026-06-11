import Card from '../ui/Card';
import Page from '../ui/Page';
import { useSettingsQuery, useStatsQuery } from '../queries';

export default function DashboardPage() {
  const statsQuery = useStatsQuery();
  const settingsQuery = useSettingsQuery();
  const stats = statsQuery.data || {};
  const settings = settingsQuery.data || {};

  return (
    <Page
      eyebrow="Foundation"
      title="Dashboard"
      description="This is the new shell baseline: query-driven summaries and tokenized cards."
    >
      <div className="metric-grid">
        <Card title="Library footprint" eyebrow="Stats">
          <div className="metric-row"><span>Movies</span><strong>{stats.total_movies ?? '-'}</strong></div>
          <div className="metric-row"><span>Series</span><strong>{stats.total_series ?? '-'}</strong></div>
          <div className="metric-row"><span>Episodes</span><strong>{stats.total_episodes ?? '-'}</strong></div>
        </Card>
        <Card title="Storage" eyebrow="Stats">
          <div className="metric-row"><span>Space</span><strong>{stats.storage || '-'}</strong></div>
          <div className="metric-row"><span>Unmatched</span><strong>{stats.unmatched ?? '-'}</strong></div>
        </Card>
        <Card title="Settings snapshot" eyebrow="Query">
          <div className="metric-row"><span>Language</span><strong>{settings.app_language || 'en'}</strong></div>
          <div className="metric-row"><span>Scan dir</span><strong>{settings.default_scan_dir || '-'}</strong></div>
        </Card>
      </div>
    </Page>
  );
}
