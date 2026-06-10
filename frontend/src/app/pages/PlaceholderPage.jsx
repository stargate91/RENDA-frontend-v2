import Card from '../ui/Card';
import Page from '../ui/Page';

export default function PlaceholderPage({ eyebrow, title, description }) {
  return (
    <Page eyebrow={eyebrow} title={title} description={description}>
      <Card title="Scaffold ready" eyebrow="Next build step">
        <p className="support-copy">The route, layout slot, and navigation entry are ready for this page.</p>
      </Card>
    </Page>
  );
}
