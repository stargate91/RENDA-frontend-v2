import { useNavigate } from 'react-router-dom';
import Page from '@/ui/Page';
import NavButton from '@/ui/NavButton';
import PosterGrid from '@/ui/PosterGrid';
import PosterCard from '@/ui/PosterCard';
import { ArrowLeft, User, Layers, Film } from 'lucide-react';
import { useTranslation } from '@/providers/LanguageContext';
import './PeopleCollectionDetailPage.css';

export default function PeopleCollectionDetailPage({ type = 'people' }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const isPeople = type === 'people';
  const displayTypeLabel = isPeople
    ? t('library.details.personLabel') || 'Person Profile'
    : t('library.details.collectionLabel') || 'Collection Details';

  const handleBack = () => {
    navigate(-1);
  };

  // Mock list items representing filmography or collection items
  const mockItems = [
    { id: '1', title: 'Example Media 1', year: '2024', info: 'Drama' },
    { id: '2', title: 'Example Media 2', year: '2022', info: 'Sci-Fi' },
    { id: '3', title: 'Example Media 3', year: '2020', info: 'Thriller' },
  ];

  return (
    <Page className="people-collection-detail-page">
      <div className="people-collection-detail-page__navigation">
        <NavButton onClick={handleBack} className="people-collection-detail-page__back-btn">
          <ArrowLeft size={16} />
          {t('common.back') || 'Back'}
        </NavButton>
      </div>

      <div className="people-collection-detail-page__hero">
        <div className="people-collection-detail-page__hero-backdrop" />
        <div className="people-collection-detail-page__hero-overlay" />
      </div>

      <div className="people-collection-detail-page__container">
        <div className="people-collection-detail-page__poster-column">
          <div className="people-collection-detail-page__poster-placeholder">
            {isPeople ? <User size={48} /> : <Layers size={48} />}
          </div>
        </div>

        <div className="people-collection-detail-page__content-column">
          <span className="people-collection-detail-page__eyebrow">{displayTypeLabel}</span>
          
          <h1 className="people-collection-detail-page__title">
            {isPeople ? t('library.details.personNamePlaceholder') : t('library.details.collectionTitlePlaceholder')}
          </h1>

          <div className="people-collection-detail-page__section">
            <h2 className="people-collection-detail-page__section-title">
              {isPeople ? t('library.details.biographyTitle') || 'Biography' : t('library.details.collectionOverviewTitle') || 'Overview'}
            </h2>
            <p className="people-collection-detail-page__overview-text">
              {t('library.details.dummyBiography')}
            </p>
          </div>

          <div className="people-collection-detail-page__section">
            <h2 className="people-collection-detail-page__section-title">
              {isPeople ? t('library.details.filmographyTitle') || 'Filmography' : t('library.details.collectionItemsTitle') || 'Collection Items'}
            </h2>
            
            <PosterGrid>
              {mockItems.map((item, index) => (
                <PosterCard
                  key={item.id}
                  title={item.title}
                  subtitle={`${item.year} • ${item.info}`}
                  customStyle={{ '--item-index': index }}
                  icon={Film}
                  onClick={() => navigate(`/library/movie/${item.id}`)}
                />
              ))}
            </PosterGrid>
          </div>
        </div>
      </div>
    </Page>
  );
}
