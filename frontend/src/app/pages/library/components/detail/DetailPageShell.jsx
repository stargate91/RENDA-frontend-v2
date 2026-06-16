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
  backLabel = 'Back',
  activePanel,
  isLoading = false,
  isSideNavVisible = true,
  onToggleSideNav,
  renderPanelContent,
  sideNav,
  pageClassName = '',
  panelOpenClassName = 'media-detail-page__container--panel-open',
}) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Page className={`media-detail-page ${pageClassName}`.trim()}>
        <div className="library-loading">
          <div className="library-spinner" />
        </div>
      </Page>
    );
  }

  return (
    <Page className={`media-detail-page ${pageClassName}`.trim()}>
      <UtilityBarPortal>
        <NavButton className="media-detail-page__back-button" onClick={() => navigate(-1)}>
          {backLabel}
        </NavButton>
      </UtilityBarPortal>

      <HeroSection backdropUrl={backdropUrl} />

      <div className="media-detail-page__layout-wrapper">
        {onToggleSideNav ? (
          <button
            onClick={onToggleSideNav}
            className={`media-detail-page__side-nav-toggle ${!isSideNavVisible ? 'hidden-state' : ''}`}
            title={isSideNavVisible ? 'Hide Info Panels' : 'Show Info Panels'}
          >
            {isSideNavVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        ) : null}

        <div
          className={`media-detail-page__container${activePanel ? ` ${panelOpenClassName}` : ''}`}
        >
          {children}
        </div>

        {activePanel ? (
          <div className="media-detail-page__side-panel">
            <div className="media-detail-page__side-panel-content">
              {renderPanelContent?.()}
            </div>
          </div>
        ) : null}

        {isSideNavVisible ? (
          <div className="media-detail-page__side-nav">
            {sideNav}
          </div>
        ) : null}
      </div>
    </Page>
  );
}
