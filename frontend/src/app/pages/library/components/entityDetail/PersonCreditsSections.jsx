import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PersonCreditsGridSection from './PersonCreditsGridSection';

export default function PersonCreditsSections({ id, item, navigate, t }) {
  const hasMovies = Number(item?.total_movie_credits) > 0;
  const hasSeries = Number(item?.total_series_credits) > 0;
  const hasScenes = Number(item?.total_scene_credits) > 0;
  
  const isAdult = !!item?.is_adult;

  const [activeTab, setActiveTab] = useState(() => {
    if (hasMovies) return 'movies';
    if (hasSeries) return 'series';
    if (hasScenes) return 'scenes';
    return '';
  });

  const [paginationInfo, setPaginationInfo] = useState(null);

  const tabs = [];
  if (hasMovies) {
    tabs.push({ id: 'movies', label: t('library.details.moviesTitle') || 'Movies', count: item.total_movie_credits });
  }
  if (hasSeries) {
    tabs.push({ id: 'series', label: t('library.details.tvShowsTitle') || 'TV Shows', count: item.total_series_credits });
  }
  if (hasScenes) {
    tabs.push({ id: 'scenes', label: t('library.details.scenesTitle') || 'Scenes', count: item.total_scene_credits });
  }

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPaginationInfo(null);
  };

  return (
    <div className="person-credits-section-container">
      {tabs.length > 1 && (
        <div className="person-credits-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`person-credits-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
              {tab.count > 0 && <span className="person-credits-tab-count">{tab.count}</span>}
            </button>
          ))}

          {paginationInfo && paginationInfo.totalPages > 1 && (
            <div className="entity-detail-page__section-pager" style={{ marginLeft: 'auto' }}>
              <button
                type="button"
                className="entity-detail-page__section-pager-btn"
                onClick={() => paginationInfo.setPage((current) => Math.max(1, current - 1))}
                disabled={paginationInfo.page <= 1}
                aria-label={t('common.previous') || 'Previous'}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="entity-detail-page__section-pager-btn"
                onClick={() => paginationInfo.setPage((current) => Math.min(paginationInfo.totalPages, current + 1))}
                disabled={paginationInfo.page >= paginationInfo.totalPages}
                aria-label={t('common.next') || 'Next'}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'movies' && hasMovies && (
        <PersonCreditsGridSection
          key={`${id}-movies`}
          title={t('library.details.moviesTitle') || 'Movies'}
          personId={id}
          mediaType="movies"
          totalCount={item?.total_movie_credits}
          initialPageData={item?.initial_movie_credits_page}
          navigate={navigate}
          t={t}
          onPaginationData={setPaginationInfo}
        />
      )}

      {activeTab === 'series' && hasSeries && (
        <PersonCreditsGridSection
          key={`${id}-series`}
          title={t('library.details.tvShowsTitle') || 'TV Shows'}
          personId={id}
          mediaType="series"
          totalCount={item?.total_series_credits}
          initialPageData={item?.initial_series_credits_page}
          navigate={navigate}
          t={t}
          onPaginationData={setPaginationInfo}
        />
      )}

      {activeTab === 'scenes' && hasScenes && (
        <PersonCreditsGridSection
          key={`${id}-scenes`}
          title={t('library.details.scenesTitle') || 'Scenes'}
          personId={id}
          mediaType="scenes"
          totalCount={item?.total_scene_credits}
          initialPageData={item?.initial_scene_credits_page}
          navigate={navigate}
          t={t}
          onPaginationData={setPaginationInfo}
        />
      )}
    </div>
  );
}
