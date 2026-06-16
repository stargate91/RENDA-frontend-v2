import { useParams, useNavigate } from 'react-router-dom';
import {
  Users, BadgeInfo, Layers3, Tags, Clapperboard,
  SlidersHorizontal, CheckCheck, Image as ImageIcon
} from 'lucide-react';
import { useTranslation } from '@/providers/LanguageContext';
import { useUi } from '@/providers/UiProvider';

// Context
import { MediaDetailProvider } from './components/detail/MediaDetailContext';

// Hook
import useMediaDetail from './hooks/useMediaDetail';

import MediaHeaderInfo from './components/detail/MediaHeaderInfo';
import UserRatingSection from './components/detail/UserRatingSection';
import MediaOverview from './components/detail/MediaOverview';
import MediaActions from './components/detail/MediaActions';
import DetailPageShell from './components/detail/DetailPageShell';

// Panels
import SeasonsPanel from './components/detail/panels/SeasonsPanel';
import CastPanel from './components/detail/panels/CastPanel';
import DetailsPanel from './components/detail/panels/DetailsPanel';
import TechnicalPanel from './components/detail/panels/TechnicalPanel';
import ExtrasPanel from './components/detail/panels/ExtrasPanel';
import WatchedPanel from './components/detail/panels/WatchedPanel';
import TagsPanel from './components/detail/panels/TagsPanel';
import BackdropsPanel from './components/detail/panels/BackdropsPanel';

export default function MediaDetailPage({ type = 'movie' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { openModal, closeModal, toast } = useUi();

  const isMovie = type === 'movie';

  const detailState = useMediaDetail({
    id,
    type,
    t,
    openModal,
    closeModal
  });

  const { state, actions } = detailState;
  const {
    activePanel,
    isSideNavVisible,
    backdropUrl,
    item,
    isLoading,
    hasTechnicalPanel
  } = state;

  const {
    togglePanel,
    handleToggleSideNav
  } = actions;

  const renderPanelContent = () => {
    if (!item) return null;

    switch (activePanel) {
      case 'seasons':
        return <SeasonsPanel />;
      case 'cast':
        return <CastPanel />;
      case 'details':
        return <DetailsPanel />;
      case 'technical':
        return <TechnicalPanel />;
      case 'extras':
        return <ExtrasPanel />;
      case 'watched':
        return <WatchedPanel />;
      case 'tags':
        return <TagsPanel />;
      case 'backdrops':
        return <BackdropsPanel />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return <DetailPageShell isLoading />;
  }

  return (
    <MediaDetailProvider value={{ ...detailState, t, navigate, toast, type, id }}>
      <DetailPageShell
        backdropUrl={backdropUrl}
        backLabel={t('common.back') || 'Back'}
        activePanel={activePanel}
        isSideNavVisible={isSideNavVisible}
        onToggleSideNav={handleToggleSideNav}
        renderPanelContent={renderPanelContent}
        sideNav={(
          <>
            {isMovie ? (
              <>
                {item?.cast && item.cast.length > 0 && (
                  <button
                    onClick={() => togglePanel('cast')}
                    className={`media-detail-page__side-nav-btn ${activePanel === 'cast' ? 'active' : ''}`}
                    title={t('library.details.cast') || 'Cast & Crew'}
                  >
                    <Users size={20} />
                  </button>
                )}
                <button
                  onClick={() => togglePanel('details')}
                  className={`media-detail-page__side-nav-btn ${activePanel === 'details' ? 'active' : ''}`}
                  title={t('library.details.details') || 'Details'}
                >
                  <BadgeInfo size={20} />
                </button>
              </>
            ) : (
              <>
                {!isMovie && item?.seasons && item.seasons.length > 0 && (
                  <button
                    onClick={() => togglePanel('seasons')}
                    className={`media-detail-page__side-nav-btn ${activePanel === 'seasons' ? 'active' : ''}`}
                    title={t('library.details.seasons') || 'Seasons'}
                  >
                    <Layers3 size={20} />
                  </button>
                )}
                {item?.cast && item.cast.length > 0 && (
                  <button
                    onClick={() => togglePanel('cast')}
                    className={`media-detail-page__side-nav-btn ${activePanel === 'cast' ? 'active' : ''}`}
                    title={t('library.details.cast') || 'Cast & Crew'}
                  >
                    <Users size={20} />
                  </button>
                )}
                <button
                  onClick={() => togglePanel('details')}
                  className={`media-detail-page__side-nav-btn ${activePanel === 'details' ? 'active' : ''}`}
                  title={t('library.details.details') || 'Details'}
                >
                  <BadgeInfo size={20} />
                </button>
              </>
            )}

            <button
              onClick={() => togglePanel('tags')}
              className={`media-detail-page__side-nav-btn ${activePanel === 'tags' ? 'active' : ''}`}
              title={t('library.details.tagger') || 'Tagger'}
            >
              <Tags size={20} />
            </button>

            {item?.extras && item.extras.length > 0 && (
              <button
                onClick={() => togglePanel('extras')}
                className={`media-detail-page__side-nav-btn ${activePanel === 'extras' ? 'active' : ''}`}
                title={t('library.details.extras') || 'Film Extras'}
              >
                <Clapperboard size={20} />
              </button>
            )}
            <button
              onClick={() => togglePanel('backdrops')}
              className={`media-detail-page__side-nav-btn ${activePanel === 'backdrops' ? 'active' : ''}`}
              title={t('library.details.backdrops') || 'Choose Backdrop'}
            >
              <ImageIcon size={20} />
            </button>

            {item && (
              <button
                onClick={() => togglePanel('watched')}
                className={`media-detail-page__side-nav-btn ${activePanel === 'watched' ? 'active' : ''}`}
                title={t('library.details.watchedPanel') || 'Watched Panel'}
              >
                <CheckCheck size={20} />
              </button>
            )}

            {hasTechnicalPanel && (
              <button
                onClick={() => togglePanel('technical')}
                className={`media-detail-page__side-nav-btn ${activePanel === 'technical' ? 'active' : ''}`}
                title={t('library.details.technicalInfo') || 'Technical Info'}
              >
                <SlidersHorizontal size={20} />
              </button>
            )}
          </>
        )}
      >
        <MediaHeaderInfo />
        <UserRatingSection />
        <MediaOverview />
        <MediaActions />
      </DetailPageShell>
    </MediaDetailProvider>
  );
}
