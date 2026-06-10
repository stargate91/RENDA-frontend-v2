import Card from '../ui/Card';
import Page from '../ui/Page';
import Table from '../ui/Table';

const sampleRows = [
  { id: 'm1', title: 'Blade Runner 2049', type: 'Movie', state: 'Watched' },
  { id: 's1', title: 'The Bear', type: 'Series', state: 'Tracking' },
  { id: 'm2', title: 'Heat', type: 'Movie', state: 'Queued' },
];

export default function LibraryPage() {
  return (
    <Page
      eyebrow="Second pillar"
      title="Library"
      description="This page is the next step after Discovery: listing, filters, paging, then details."
    >
      <Card title="Listing baseline" eyebrow="Table system">
        <Table
          columns={[
            { key: 'title', label: 'Title' },
            { key: 'type', label: 'Type' },
            { key: 'state', label: 'State' },
          ]}
          rows={sampleRows}
        />
      </Card>
    </Page>
  );
}
