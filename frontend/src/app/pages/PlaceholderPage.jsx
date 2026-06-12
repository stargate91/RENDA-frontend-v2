import Page from '@/ui/Page';
import EmptyState from '@/ui/EmptyState';

export default function PlaceholderPage({
  eyebrow,
  title = 'Planned page',
  description = 'This page is not built yet.',
}) {
  return (
    <Page
      eyebrow={eyebrow}
      title={title}
      description={description}
      contentBottom
    >
      <EmptyState
        title={title}
        description={description}
        variant="simple"
      />
    </Page>
  );
}
