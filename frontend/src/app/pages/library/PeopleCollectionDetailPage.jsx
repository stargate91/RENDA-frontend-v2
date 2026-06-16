import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PosterGrid from '@/ui/PosterGrid';
import PosterCard from '@/ui/PosterCard';
import Pill from '@/ui/Pill';
import {
  BadgeInfo,
  Calendar,
  Film,
  Layers,
  Sparkles,
  Tv,
  User,
} from 'lucide-react';
import { useTranslation } from '@/providers/LanguageContext';
import { API_BASE } from '@/lib/backend';
import {
  useLibraryCollectionDetailQuery,
  usePersonDetailQuery,
} from '@/queries/metadataQueries';
import { resolveDetailsImageUrl } from './utils/detailUtils';
import DetailPageShell from './components/detail/DetailPageShell';
import './PeopleCollectionDetailPage.css';

function DetailSection({ title, children, emptyText }) {
  return (
    <div className="details-panel details-panel--custom">
      <h4 className="details-panel__section-title">{title}</h4>
      {children || <div className="details-panel__no-ratings">{emptyText}</div>}
    </div>
  );
}

function EntityCardGrid({ items, type, navigate, t }) {
  if (!items?.length) {
    return null;
  }

  const openItem = (item) => {
    if (type === 'series') {
      const seriesId = item.library_series_tmdb_id || item.series_tmdb_id || item.tmdb_id || item.id;
      navigate(`/library/series/${seriesId}`);
      return;
    }

    const movieId = item.in_library ? (item.library_item_id || item.id) : `tmdb_${item.tmdb_id || item.id}`;
    navigate(`/library/movie/${movieId}`);
  };

  return (
    <PosterGrid>
      {items.map((item, index) => {
        const subtitleParts = [];
        if (item.year) subtitleParts.push(String(item.year));
        if (item.job) subtitleParts.push(item.job);
        if (item.character) subtitleParts.push(item.character);
        if (item.episode_count) {
          subtitleParts.push(
            t('library.details.episodePlural', {
              count: item.episode_count,
              defaultValue: `${item.episode_count} Episodes`,
            })
          );
        }

        return (
          <PosterCard
            key={`${type}-${item.tmdb_id || item.id}`}
            title={item.title}
            subtitle={subtitleParts.join(' - ')}
            imageUrl={resolveDetailsImageUrl(item.poster_path, API_BASE, 'poster')}
            ratingImdb={item.rating_imdb}
            ratingTmdb={item.rating_tmdb ?? item.rating}
            icon={type === 'series' ? Tv : Film}
            customStyle={{ '--item-index': index }}
            onClick={() => openItem(item)}
          />
        );
      })}
    </PosterGrid>
  );
}

export default function PeopleCollectionDetailPage({ type = 'people' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isPeople = type === 'people';

  const [activePanel, setActivePanel] = useState(null);
  const [isSideNavVisible, setIsSideNavVisible] = useState(true);

  const personQuery = usePersonDetailQuery(id, { enabled: isPeople && Boolean(id) });
  const collectionQuery = useLibraryCollectionDetailQuery(id, { enabled: !isPeople && Boolean(id) });

  const item = isPeople ? personQuery.data : collectionQuery.data;
  const isLoading = isPeople ? personQuery.isLoading : collectionQuery.isLoading;
  const queryError = isPeople ? personQuery.error : collectionQuery.error;
  const hasError = isPeople ? personQuery.isError : collectionQuery.isError;

  const panelItems = useMemo(() => {
    if (!item) return [];

    if (isPeople) {
      return [
        { id: 'overview', icon: BadgeInfo, title: t('library.details.biographyTitle') || 'Biography', visible: Boolean(item.biography) },
        { id: 'known-for', icon: Sparkles, title: t('library.details.knownForTitle') || 'Known For', visible: Boolean(item.known_for?.length) },
        { id: 'movies', icon: Film, title: t('library.details.moviesTitle') || 'Movies', visible: Boolean(item.movies?.length) },
        { id: 'series', icon: Tv, title: t('library.details.seriesTitle') || 'Series', visible: Boolean(item.series?.length) },
      ];
    }

    return [
      { id: 'overview', icon: BadgeInfo, title: t('library.details.collectionOverviewTitle') || 'Overview', visible: Boolean(item.overview) },
      { id: 'movies', icon: Film, title: t('library.details.collectionItemsTitle') || 'Collection Items', visible: Boolean(item.movies?.length) },
    ];
  }, [isPeople, item, t]);

  const visiblePanels = useMemo(
    () => panelItems.filter((panel) => panel.visible),
    [panelItems]
  );

  useEffect(() => {
    if (!visiblePanels.length) {
      setActivePanel(null);
      return;
    }
    setActivePanel((current) => (
      current && visiblePanels.some((panel) => panel.id === current) ? current : visiblePanels[0].id
    ));
  }, [visiblePanels]);

  const backdropUrl = resolveDetailsImageUrl(item?.backdrop_path, API_BASE, 'backdrop');
  const mediaUrl = resolveDetailsImageUrl(
    isPeople ? item?.profile_path : item?.poster_path,
    API_BASE,
    'poster'
  );

  const metaPills = isPeople
    ? [
        item?.known_for_department,
        item?.birthday ? `${t('library.details.born') || 'Born'} ${item.birthday}` : null,
        item?.place_of_birth,
      ].filter(Boolean)
    : [
        item?.owned_count !== undefined && item?.total_count !== undefined
          ? `${item.owned_count}/${item.total_count} ${t('library.details.collectionItemsTitle') || 'Collection Items'}`
          : null,
      ].filter(Boolean);

  const renderPanelContent = () => {
    if (!item || !activePanel) return null;

    if (activePanel === 'overview') {
      return (
        <DetailSection
          title={
            isPeople
              ? (t('library.details.biographyTitle') || 'Biography')
              : (t('library.details.collectionOverviewTitle') || 'Overview')
          }
          emptyText={t('library.details.noOverviewAvailable') || 'No overview available.'}
        >
          <div className="entity-detail-page__panel-text">{item.biography || item.overview}</div>
        </DetailSection>
      );
    }

    if (activePanel === 'known-for') {
      return (
        <DetailSection
          title={t('library.details.knownForTitle') || 'Known For'}
          emptyText={t('library.details.noItemsFound') || 'No items found.'}
        >
          <EntityCardGrid items={item.known_for} type="movie" navigate={navigate} t={t} />
        </DetailSection>
      );
    }

    if (activePanel === 'movies') {
      return (
        <DetailSection
          title={isPeople ? (t('library.details.moviesTitle') || 'Movies') : (t('library.details.collectionItemsTitle') || 'Collection Items')}
          emptyText={t('library.details.noItemsFound') || 'No items found.'}
        >
          <EntityCardGrid items={item.movies} type="movie" navigate={navigate} t={t} />
        </DetailSection>
      );
    }

    if (activePanel === 'series') {
      return (
        <DetailSection
          title={t('library.details.seriesTitle') || 'Series'}
          emptyText={t('library.details.noItemsFound') || 'No items found.'}
        >
          <EntityCardGrid items={item.series} type="series" navigate={navigate} t={t} />
        </DetailSection>
      );
    }

    return null;
  };

  return (
    <DetailPageShell
      backdropUrl={backdropUrl}
      backLabel={t('common.back') || 'Back'}
      activePanel={activePanel}
      isLoading={isLoading}
      isSideNavVisible={isSideNavVisible}
      onToggleSideNav={() => {
        setIsSideNavVisible((current) => {
          const next = !current;
          if (!next) {
            setActivePanel(null);
          } else if (!activePanel && visiblePanels.length) {
            setActivePanel(visiblePanels[0].id);
          }
          return next;
        });
      }}
      renderPanelContent={renderPanelContent}
      pageClassName="entity-detail-page"
      sideNav={visiblePanels.map((panel) => {
        const Icon = panel.icon;
        return (
          <button
            key={panel.id}
            onClick={() => setActivePanel((current) => (current === panel.id ? null : panel.id))}
            className={`media-detail-page__side-nav-btn ${activePanel === panel.id ? 'active' : ''}`}
            title={panel.title}
          >
            <Icon size={20} />
          </button>
        );
      })}
    >
      {hasError && (
        <section className="entity-detail-page__content-section entity-detail-page__content-section--status">
          <div className="entity-detail-page__status-card">
            <h2>{isPeople ? 'Unable to load person' : 'Unable to load collection'}</h2>
            <p>{queryError?.message || 'The detail request failed.'}</p>
          </div>
        </section>
      )}

      {!hasError && !item && !isLoading && (
        <section className="entity-detail-page__content-section entity-detail-page__content-section--status">
          <div className="entity-detail-page__status-card">
            <h2>{isPeople ? 'Person not found' : 'Collection not found'}</h2>
            <p>{isPeople ? 'No person detail was returned for this route.' : 'No collection detail was returned for this route.'}</p>
          </div>
        </section>
      )}

      {!hasError && (
      <section className="entity-detail-page__hero-grid">
        <div className={`entity-detail-page__media-card ${isPeople ? 'entity-detail-page__media-card--profile' : ''}`}>
          {mediaUrl ? (
            <img
              src={mediaUrl}
              alt={item?.name || item?.title || 'Detail artwork'}
              className="entity-detail-page__media-image"
            />
          ) : (
            <div className="entity-detail-page__media-placeholder">
              {isPeople ? <User size={44} /> : <Layers size={44} />}
            </div>
          )}
        </div>

        <div className="entity-detail-page__summary">
          <div className="entity-detail-page__eyebrow">
            {isPeople
              ? (t('library.details.personLabel') || 'Person Profile')
              : (t('library.details.collectionLabel') || 'Collection Details')}
          </div>

          <div className="entity-detail-page__headline-block">
            <h1 className="entity-detail-page__title">
              {item?.name || item?.title || (isPeople ? 'Unknown Person' : 'Unknown Collection')}
            </h1>

            {metaPills.length > 0 && (
              <div className="entity-detail-page__meta-row">
                {metaPills.map((value) => (
                  <Pill key={value} variant="meta">{value}</Pill>
                ))}
              </div>
            )}
          </div>

          <div className="entity-detail-page__summary-layout">
            <div className="entity-detail-page__summary-text">
              {(item?.biography || item?.overview) ? (
                <p className="entity-detail-page__overview-text">
                  {item.biography || item.overview}
                </p>
              ) : (
                <p className="entity-detail-page__overview-text entity-detail-page__overview-text--muted">
                  {t('library.details.noOverviewAvailable') || 'No overview available.'}
                </p>
              )}
            </div>

            <div className="entity-detail-page__meta-stack">
              {isPeople && item?.deathday && (
                <div className="entity-detail-page__meta-item">
                  <span className="entity-detail-page__meta-label">{t('library.details.died') || 'Died'}</span>
                  <span>{item.deathday}</span>
                </div>
              )}
              {isPeople && item?.gender && (
                <div className="entity-detail-page__meta-item">
                  <span className="entity-detail-page__meta-label">{t('library.details.gender') || 'Gender'}</span>
                  <span>{item.gender}</span>
                </div>
              )}
              {!isPeople && (
                <>
                  <div className="entity-detail-page__meta-item">
                    <span className="entity-detail-page__meta-label">{t('library.details.inLibrary') || 'In Library'}</span>
                    <span>{item?.owned_count ?? 0}</span>
                  </div>
                  <div className="entity-detail-page__meta-item">
                    <span className="entity-detail-page__meta-label">{t('library.details.total') || 'Total'}</span>
                    <span>{item?.total_count ?? 0}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {!hasError && isPeople && item?.known_for?.length > 0 && (
        <section className="entity-detail-page__content-section">
          <div className="entity-detail-page__section-header">
            <Sparkles size={16} />
            <h2>{t('library.details.knownForTitle') || 'Known For'}</h2>
          </div>
          <EntityCardGrid items={item.known_for} type="movie" navigate={navigate} t={t} />
        </section>
      )}

      {!hasError && !isPeople && item?.movies?.length > 0 && (
        <section className="entity-detail-page__content-section">
          <div className="entity-detail-page__section-header">
            <Calendar size={16} />
            <h2>{t('library.details.collectionItemsTitle') || 'Collection Items'}</h2>
          </div>
          <EntityCardGrid items={item.movies} type="movie" navigate={navigate} t={t} />
        </section>
      )}
    </DetailPageShell>
  );
}
