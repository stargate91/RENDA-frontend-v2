import { useNavigate } from 'react-router-dom';
import Page from '@/ui/Page';
import NavButton from '@/ui/NavButton';
import { Eye, EyeOff } from 'lucide-react';
import UtilityBarPortal from '../../../../../components/UtilityBarPortal';
import HeroSection from './HeroSection';
import '../../MediaDetailPage.css';

export default function DetailPageShell({
  children,
  backdropUrl,
  fallbackUrl,
  backLabel = 'Back',
  activePanel,
  isLoading = false,
  isSideNavVisible = true,
  onToggleSideNav,
  renderPanelContent,
  sideNav,
  topRightControls,
  pageClassName = '',
  panelOpenClassName = 'media-detail-page__container--panel-open',
  isScene = false,
}) {
  const navigate = useNavigate();

  const combinedClassName = `media-detail-page ${isScene ? 'media-detail-page--scene' : ''} ${pageClassName}`.trim();

  if (isLoading) {
    return (
      <Page className={combinedClassName}>
        <div className="library-loading">
          <div className="library-spinner" />
        </div>
      </Page>
    );
  }

  return (
    <Page className={combinedClassName}>
      <UtilityBarPortal>
        <NavButton className="media-detail-page__back-button" onClick={() => navigate(-1)}>
          {backLabel}
        </NavButton>
      </UtilityBarPortal>

      <HeroSection backdropUrl={backdropUrl || fallbackUrl} isFallback={!backdropUrl && !isScene} />

      <div className="media-detail-page__layout-wrapper">
        {(topRightControls || onToggleSideNav) ? (
          <div className={`media-detail-page__top-right-controls ${!isSideNavVisible ? 'hidden-state' : ''}`}>
            {topRightControls}
            {onToggleSideNav ? (
              <button
                onClick={onToggleSideNav}
                className="media-detail-page__side-nav-toggle"
                title={isSideNavVisible ? 'Hide Info Panels' : 'Show Info Panels'}
              >
                {isSideNavVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          className={`media-detail-page__container${activePanel ? ` ${panelOpenClassName}` : ''}`}
        >
          {children}
        </div>

        <div className={`media-detail-page__side-panel ${activePanel ? 'is-open' : ''}`}>
          <div className="media-detail-page__side-panel-content">
            {activePanel ? renderPanelContent?.() : null}
          </div>
        </div>

        {isSideNavVisible ? (
          <div className="media-detail-page__side-nav">
            {sideNav}
          </div>
        ) : null}
      </div>
    </Page>
  );
}
