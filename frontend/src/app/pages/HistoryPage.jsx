import Card from '../ui/Card';
import Page from '../ui/Page';
import Spinner from '../ui/Spinner';
import Table from '../ui/Table';
import { useHistoryQuery } from '../queries';

export default function HistoryPage() {
  const historyQuery = useHistoryQuery();
  const rows = Array.isArray(historyQuery.data)
    ? historyQuery.data.slice(0, 15).map((item, index) => ({
        id: item.id || index,
        batch: item.batch_id || '-',
        result: `${item.success_count || 0} ok / ${item.failure_count || 0} fail`,
        date: item.created_at || '-',
      }))
    : [];

  return (
    <Page
      eyebrow="Support screen"
      title="History"
      description="Query-backed read models should be cheap to add once the shell and table system are stable."
    >
      <Card title="Recent operations" eyebrow="Read model">
        {historyQuery.isLoading ? <Spinner label="Loading history" /> : null}
        {!historyQuery.isLoading ? (
          <Table
            columns={[
              { key: 'batch', label: 'Batch' },
              { key: 'result', label: 'Result' },
              { key: 'date', label: 'Created' },
            ]}
            rows={rows}
          />
        ) : null}
      </Card>
    </Page>
  );
}
