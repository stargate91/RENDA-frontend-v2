import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Page from '../ui/Page';

export default function NotFoundPage() {
  return (
    <Page centered>
      <Card title="Route not found" eyebrow="Router">
        <p className="support-copy">The new route map is active, but this destination is not wired yet.</p>
        <Link to="/discovery" className="link-reset">
          <Button variant="primary">Go to Discovery</Button>
        </Link>
      </Card>
    </Page>
  );
}
