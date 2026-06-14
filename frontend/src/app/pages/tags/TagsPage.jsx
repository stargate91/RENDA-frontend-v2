import LibraryPage from '../library/LibraryPage';
import { useTranslation } from '@/providers/LanguageContext';

export default function TagsPage() {
  const { t } = useTranslation();

  return (
    <LibraryPage
      initialTab="tags"
      lockTab
      showTabs={false}
      pageTitle={t('library.tags.pageTitle') || 'TAGS'}
    />
  );
}
