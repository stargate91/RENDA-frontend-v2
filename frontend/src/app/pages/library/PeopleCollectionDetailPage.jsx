import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PosterGrid from '@/ui/PosterGrid';
import PosterCard from '@/ui/PosterCard';
import Pill from '@/ui/Pill';
import { useUpdatePersonStatusMutation } from '@/queries/libraryQueries';
import {
  Calendar,
  CalendarX2,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Layers,
  MapPin,
  Minus,
  Briefcase,
  Mars,
  Venus,
  VenusAndMars,
  Heart,
  PenLine,
  Plus,
  Star,
  Tv,
  User,
  X,
} from 'lucide-react';
import { useTranslation } from '@/providers/LanguageContext';
import { useUi } from '@/providers/UiProvider';
import { API_BASE } from '@/lib/backend';
import {
  useLibraryCollectionDetailQuery,
  usePersonCreditsQuery,
  usePersonDetailQuery,
} from '@/queries/metadataQueries';
import { isTvLikeMediaType } from '@/lib/mediaTypes';
import { resolveDetailsImageUrl } from './utils/detailUtils';
import DetailPageShell from './components/detail/DetailPageShell';
import './PeopleCollectionDetailPage.css';
import './components/detail/UserRatingSection.css';
import ReviewModalContent from './components/detail/modals/ReviewModalContent';
import Button from '@/ui/Button';

function getGenderLabel(gender, t) {
  if (gender === 1 || gender === '1') {
    return t('library.details.female') || 'Female';
  }
  if (gender === 2 || gender === '2') {
    return t('library.details.male') || 'Male';
  }
  if (gender === 3 || gender === '3') {
    return t('library.details.nonBinary') || 'Non-binary';
  }
  return null;
}

function getGenderIcon(gender) {
  if (gender === 1 || gender === '1') {
    return Venus;
  }
  if (gender === 2 || gender === '2') {
    return Mars;
  }
  if (gender === 3 || gender === '3') {
    return VenusAndMars;
  }
  return User;
}

function OverviewContent({ text, title, emptyText, t, openModal, className = '' }) {
  const overviewRef = useRef(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = overviewRef.current;
    if (!element) {
      return undefined;
    }

    let frameId = null;
    let resizeObserver = null;

    const measure = () => {
      setIsTruncated(element.scrollHeight > element.clientHeight + 1);
    };

    const scheduleMeasure = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(measure);
    };

    scheduleMeasure();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleMeasure();
      });
      resizeObserver.observe(element);
    }

    window.addEventListener('resize', scheduleMeasure);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [text]);

  return (
    <div className={`media-detail-page__overview entity-detail-page__overview ${className}`.trim()}>
      {text ? (
        <>
          <div ref={overviewRef} className="media-detail-page__overview-text">
            {text}
          </div>
          {isTruncated && (
            <button
              type="button"
              className="media-detail-page__read-more-btn"
              onClick={() => {
                openModal({
                  title,
                  variant: 'wide',
                  content: (
                    <div className="read-more-overview">
                      {text.split(/\n{2,}/).map((paragraph, index) => (
                        <p key={index} className="read-more-paragraph">{paragraph}</p>
                      ))}
                    </div>
                  ),
                });
              }}
            >
              {t('library.details.readMore') || 'Read More'}
            </button>
          )}
        </>
      ) : (
        <p className="entity-detail-page__overview-text entity-detail-page__overview-text--muted">
          {emptyText}
        </p>
      )}
    </div>
  );
}

function EntityCardGrid({ items, type, navigate, t }) {
  if (!items?.length) {
    return null;
  }

  const openItem = (item) => {
    const resolvedType = item.media_type || item.type || type;
    if (isTvLikeMediaType(resolvedType)) {
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
        const resolvedType = item.media_type || item.type || type;
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
            icon={isTvLikeMediaType(resolvedType) ? Tv : Film}
            customStyle={{ '--item-index': index }}
            onClick={() => openItem(item)}
          />
        );
      })}
    </PosterGrid>
  );
}

function HorizontalCollectionItemsList({ items, navigate, t }) {
  if (!items?.length) {
    return null;
  }

  const openItem = (item) => {
    if (isTvLikeMediaType(item.media_type || item.type)) {
      const seriesId = item.library_series_tmdb_id || item.series_tmdb_id || item.tmdb_id || item.id;
      navigate(`/library/series/${seriesId}`);
      return;
    }

    const movieId = item.in_library ? (item.library_item_id || item.id) : `tmdb_${item.tmdb_id || item.id}`;
    navigate(`/library/movie/${movieId}`);
  };

  return (
    <div className="entity-detail-page__credits-list entity-detail-page__credits-list--collection-items">
      {items.map((item) => {
        const isTv = isTvLikeMediaType(item.media_type || item.type);
        const imdbRating = Number(item.rating_imdb);
        const tmdbRating = Number(item.rating_tmdb ?? item.rating);
        const hasImdbRating = Number.isFinite(imdbRating) && imdbRating > 0;
        const hasTmdbRating = Number.isFinite(tmdbRating) && tmdbRating > 0;
        const metaParts = [];
        if (item.year) metaParts.push(String(item.year));

        return (
          <button
            key={`collection-item-${item.media_type || item.type || 'movie'}-${item.tmdb_id || item.id}`}
            type="button"
            className={`entity-detail-page__credit-card entity-detail-page__credit-card--collection-item ${
              item.in_library ? 'entity-detail-page__credit-card--owned' : 'entity-detail-page__credit-card--missing'
            }`}
            onClick={() => openItem(item)}
          >
            <div className="entity-detail-page__credit-poster-wrap">
              {item.poster_path ? (
                <img
                  src={resolveDetailsImageUrl(item.poster_path, API_BASE, 'poster')}
                  alt={item.title || 'Collection item poster'}
                  className="entity-detail-page__credit-poster"
                />
              ) : (
                <div className="entity-detail-page__credit-poster entity-detail-page__credit-poster--placeholder">
                  {isTv ? <Tv size={18} /> : <Film size={18} />}
                </div>
              )}
            </div>

            <div className="entity-detail-page__credit-body">
              <div className="entity-detail-page__credit-topline">
                <div className="entity-detail-page__credit-title">{item.title}</div>
              </div>
              <div className="entity-detail-page__credit-meta">
                {item.year && <span>{item.year}</span>}
                {(hasImdbRating || hasTmdbRating) && (
                  <Pill
                    variant={hasImdbRating ? 'imdb' : 'tmdb'}
                    className="entity-detail-page__credit-rating-pill"
                  >
                    <Star size={10} fill="currentColor" strokeWidth={1.8} />
                    {(hasImdbRating ? imdbRating : tmdbRating).toFixed(1)}
                  </Pill>
                )}
                <Pill
                  variant={item.in_library ? 'success' : 'default'}
                  className={`entity-detail-page__credit-status-pill${
                    item.in_library ? '' : ' entity-detail-page__credit-status-pill--missing'
                  }`}
                >
                  {item.in_library
                    ? (t('library.details.have') || 'Have')
                    : (t('library.details.missing') || 'Missing')}
                </Pill>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CollectionItemsSection({ items, navigate, t }) {
  const containerRef = useRef(null);
  const [columns, setColumns] = useState(1);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    let frameId = null;
    let resizeObserver = null;

    const measure = () => {
      const styles = window.getComputedStyle(element);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || '16') || 16;
      const minCardWidth = 224;
      const width = element.clientWidth || 0;
      const nextColumns = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
      setColumns((current) => (current === nextColumns ? current : nextColumns));
    };

    const scheduleMeasure = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(measure);
    };

    scheduleMeasure();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleMeasure();
      });
      resizeObserver.observe(element);
    }

    window.addEventListener('resize', scheduleMeasure);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, []);

  const itemsPerPage = Math.max(1, columns * 3);
  const totalPages = Math.max(1, Math.ceil((items?.length || 0) / itemsPerPage));
  const safePage = Math.min(page, totalPages - 1);
  const visibleItems = (items || []).slice(safePage * itemsPerPage, (safePage + 1) * itemsPerPage);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  return (
    <section className="entity-detail-page__content-section">
      <div className="entity-detail-page__section-header">
        <h2>{t('library.details.collectionItemsTitle') || 'Collection Items'}</h2>
        {totalPages > 1 && (
          <div className="entity-detail-page__section-pager">
            <button
              type="button"
              className="entity-detail-page__section-pager-btn"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={safePage === 0}
              aria-label={t('common.previous') || 'Previous'}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="entity-detail-page__section-pager-btn"
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              disabled={safePage >= totalPages - 1}
              aria-label={t('common.next') || 'Next'}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      <div ref={containerRef}>
        <HorizontalCollectionItemsList items={visibleItems} navigate={navigate} t={t} />
      </div>
    </section>
  );
}

function normalizeCreditType(item) {
  return isTvLikeMediaType(item?.media_type || item?.type) ? 'tv' : 'movie';
}

function normalizeCreditTitle(item) {
  return String(item?.title || item?.name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function getCreditIdentityCandidates(item) {
  return [
    item?.tmdb_id,
    item?.series_tmdb_id,
    item?.library_series_tmdb_id,
    item?.library_item_id,
    item?.id,
  ]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value));
}

function isKnownForMatch(entry, knownForEntry) {
  if (normalizeCreditType(entry) !== normalizeCreditType(knownForEntry)) {
    return false;
  }

  const entryIds = getCreditIdentityCandidates(entry);
  const knownForIds = getCreditIdentityCandidates(knownForEntry);
  if (entryIds.some((id) => knownForIds.includes(id))) {
    return true;
  }

  const entryTitle = normalizeCreditTitle(entry);
  const knownForTitle = normalizeCreditTitle(knownForEntry);
  const entryYear = String(entry?.year || '');
  const knownForYear = String(knownForEntry?.year || '');

  if (!entryTitle || !knownForTitle) {
    return false;
  }

  if (entryTitle === knownForTitle && entryYear === knownForYear) {
    return true;
  }

  return entryTitle === knownForTitle;
}

function prioritizePersonCredits(items, knownForItems) {
  if (!items?.length) {
    return [];
  }

  const knownForRank = new Map(
    (knownForItems || []).map((entry, index) => {
      const ids = getCreditIdentityCandidates(entry);
      const key = ids[0] || `${normalizeCreditType(entry)}:${normalizeCreditTitle(entry)}:${entry?.year || ''}`;
      return [key, index];
    })
  );

  return [...items]
    .map((entry) => {
      const matchedKnownFor = (knownForItems || []).find((knownForEntry) => isKnownForMatch(entry, knownForEntry));
      const matchIds = matchedKnownFor ? getCreditIdentityCandidates(matchedKnownFor) : [];
      const fallbackKey = `${normalizeCreditType(entry)}:${normalizeCreditTitle(entry)}:${entry?.year || ''}`;
      const rankKey = matchIds[0] || fallbackKey;
      return {
        ...entry,
        is_known_for: Boolean(matchedKnownFor),
        known_for_rank: matchedKnownFor ? (knownForRank.get(rankKey) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => {
      if (Boolean(a?.is_known_for) !== Boolean(b?.is_known_for)) {
        return a?.is_known_for ? -1 : 1;
      }

      if (a?.is_known_for && b?.is_known_for) {
        return (a?.known_for_rank ?? Number.MAX_SAFE_INTEGER) - (b?.known_for_rank ?? Number.MAX_SAFE_INTEGER);
      }

      if (Boolean(a?.in_library) !== Boolean(b?.in_library)) {
        return a?.in_library ? -1 : 1;
      }

      const yearDiff = (Number(b?.year) || 0) - (Number(a?.year) || 0);
      if (yearDiff !== 0) {
        return yearDiff;
      }

      return String(a?.title || '').localeCompare(String(b?.title || ''));
    });
}

function PersonCreditsGridSection({ title, personId, mediaType, totalCount, navigate, t }) {
  const shouldLoad = Boolean(personId) && Number(totalCount) > 0;
  const containerRef = useRef(null);
  const [columns, setColumns] = useState(1);
  const [page, setPage] = useState(1);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    let frameId = null;
    let resizeObserver = null;

    const measure = () => {
      const styles = window.getComputedStyle(element);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || '16') || 16;
      const minCardWidth = 224;
      const width = element.clientWidth || 0;
      const nextColumns = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
      setColumns((current) => (current === nextColumns ? current : nextColumns));
    };

    const scheduleMeasure = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(measure);
    };

    scheduleMeasure();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleMeasure();
      });
      resizeObserver.observe(element);
    }

    window.addEventListener('resize', scheduleMeasure);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, []);

  const itemsPerPage = Math.max(1, columns * 2);
  const creditsQuery = usePersonCreditsQuery(personId, mediaType, page, itemsPerPage, {
    enabled: shouldLoad,
  });
  const totalPages = Math.max(1, Number(creditsQuery.data?.total_pages) || Math.ceil(Number(totalCount) / itemsPerPage) || 1);
  const safePage = Math.min(page, totalPages);
  const visibleItems = creditsQuery.data?.items || [];
  const fillerCount = Math.max(0, itemsPerPage - visibleItems.length);
  const isPageFetching = creditsQuery.isFetching;

  if (!shouldLoad) {
    return null;
  }

  useEffect(() => {
    setPage((current) => Math.max(1, Math.min(current, totalPages)));
  }, [totalPages]);

  const openItem = (item) => {
    if (isTvLikeMediaType(item.media_type || item.type)) {
      const seriesId = item.library_series_tmdb_id || item.series_tmdb_id || item.tmdb_id || item.id;
      navigate(`/library/series/${seriesId}`);
      return;
    }

    const movieId = item.in_library ? (item.library_item_id || item.id) : `tmdb_${item.tmdb_id || item.id}`;
    navigate(`/library/movie/${movieId}`);
  };

  return (
    <section className="entity-detail-page__content-section">
      <div className="entity-detail-page__section-header">
        <h2>{title}</h2>
        {totalPages > 1 && (
          <div className="entity-detail-page__section-pager">
            <button
              type="button"
              className="entity-detail-page__section-pager-btn"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage <= 1}
              aria-label={t('common.previous') || 'Previous'}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="entity-detail-page__section-pager-btn"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage >= totalPages}
              aria-label={t('common.next') || 'Next'}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className={`entity-detail-page__credits-list entity-detail-page__credits-list--people-grid${
          isPageFetching ? ' entity-detail-page__credits-list--fetching' : ''
        }`}
      >
        {visibleItems.map((item) => (
          <button
            key={`credit-grid-${item.media_type || item.type || 'movie'}-${item.tmdb_id || item.id}`}
            type="button"
            className={`entity-detail-page__credit-card entity-detail-page__credit-card--collection-item entity-detail-page__credit-card--people-grid ${
              item.is_known_for ? ' entity-detail-page__credit-card--known-for' : ''
            }${
              item.in_library ? ' entity-detail-page__credit-card--owned' : ' entity-detail-page__credit-card--missing'
            }`}
            onClick={() => openItem(item)}
          >
            <div className="entity-detail-page__credit-poster-wrap">
              {item.poster_path ? (
                <img
                  src={resolveDetailsImageUrl(item.poster_path, API_BASE, 'poster')}
                  alt={item.title || 'Credit poster'}
                  className="entity-detail-page__credit-poster"
                />
              ) : (
                <div className="entity-detail-page__credit-poster entity-detail-page__credit-poster--placeholder">
                  {isTvLikeMediaType(item.media_type || item.type) ? <Tv size={18} /> : <Film size={18} />}
                </div>
              )}
            </div>
            <div className="entity-detail-page__credit-body">
              <div className="entity-detail-page__credit-topline">
                <div className="entity-detail-page__credit-title">{item.title}</div>
              </div>
              <div className="entity-detail-page__credit-meta">
                {item.year && <span>{item.year}</span>}
                {(() => {
                  const imdbRating = Number(item.rating_imdb);
                  const tmdbRating = Number(item.rating_tmdb ?? item.rating);
                  const hasImdbRating = Number.isFinite(imdbRating) && imdbRating > 0;
                  const hasTmdbRating = Number.isFinite(tmdbRating) && tmdbRating > 0;

                  if (!hasImdbRating && !hasTmdbRating) {
                    return null;
                  }

                  return (
                    <Pill
                      variant={hasImdbRating ? 'imdb' : 'tmdb'}
                      className="entity-detail-page__credit-rating-pill"
                    >
                      <Star size={10} fill="currentColor" strokeWidth={1.8} />
                      {hasImdbRating ? imdbRating.toFixed(1) : tmdbRating.toFixed(1)}
                    </Pill>
                  );
                })()}
                <Pill
                  variant={item.in_library ? 'success' : 'default'}
                  className={`entity-detail-page__credit-status-pill${
                    item.in_library ? '' : ' entity-detail-page__credit-status-pill--missing'
                  }`}
                >
                  {item.in_library
                    ? (t('library.details.have') || 'Have')
                    : (t('library.details.missing') || 'Missing')}
                </Pill>
              </div>
            </div>
          </button>
        ))}
        {Array.from({ length: fillerCount }).map((_, index) => (
          <div
            key={`credit-grid-filler-${mediaType}-${safePage}-${index}`}
            className="entity-detail-page__credit-card entity-detail-page__credit-card--collection-item entity-detail-page__credit-card--people-grid entity-detail-page__credit-card--placeholder"
            aria-hidden="true"
          />
        ))}
      </div>
    </section>
  );
}

function HorizontalCreditsList({ items, navigate, t }) {
  if (!items?.length) {
    return null;
  }

  const openItem = (item) => {
    if (isTvLikeMediaType(item.media_type || item.type)) {
      const seriesId = item.library_series_tmdb_id || item.series_tmdb_id || item.tmdb_id || item.id;
      navigate(`/library/series/${seriesId}`);
      return;
    }

    const movieId = item.in_library ? (item.library_item_id || item.id) : `tmdb_${item.tmdb_id || item.id}`;
    navigate(`/library/movie/${movieId}`);
  };

  return (
    <div className="entity-detail-page__credits-list">
      {items.map((item) => {
        const isTv = isTvLikeMediaType(item.media_type || item.type);
        const imdbRating = Number(item.rating_imdb);
        const tmdbRating = Number(item.rating_tmdb ?? item.rating);
        const hasImdbRating = Number.isFinite(imdbRating) && imdbRating > 0;
        const hasTmdbRating = Number.isFinite(tmdbRating) && tmdbRating > 0;
        const metaParts = [];
        const roleText = String(item.job || '').trim();
        const characterText = String(item.character || '').trim();
        const normalizedRole = roleText.toLowerCase();
        const normalizedCharacter = characterText.toLowerCase();
        const roleContainsCharacter = normalizedCharacter
          ? normalizedRole
            .split(',')
            .map((part) => part.trim())
            .some((part) => part === normalizedCharacter || part === `as ${normalizedCharacter}`)
          : false;

        if (item.year) metaParts.push(String(item.year));
        if (roleText) metaParts.push(roleText);
        if (
          characterText
          && normalizedCharacter !== normalizedRole
          && normalizedRole !== `as ${normalizedCharacter}`
          && !roleContainsCharacter
        ) {
          metaParts.push(characterText);
        }
        if (item.episode_count) {
          metaParts.push(
            t('library.details.episodePlural', {
              count: item.episode_count,
              defaultValue: `${item.episode_count} Episodes`,
            })
          );
        }
        const metaText = metaParts.length > 1
          ? `${metaParts[0]} - ${metaParts.slice(1).join(' • ')}`
          : (metaParts[0] || '');

        return (
          <button
            key={`credit-${item.media_type || item.type}-${item.tmdb_id || item.id}`}
            type="button"
            className="entity-detail-page__credit-card"
            onClick={() => openItem(item)}
          >
            <div className="entity-detail-page__credit-poster-wrap">
              {item.poster_path ? (
                <img
                  src={resolveDetailsImageUrl(item.poster_path, API_BASE, 'poster')}
                  alt={item.title || 'Credit poster'}
                  className="entity-detail-page__credit-poster"
                />
              ) : (
                <div className="entity-detail-page__credit-poster entity-detail-page__credit-poster--placeholder">
                  {isTv ? <Tv size={18} /> : <Film size={18} />}
                </div>
              )}
            </div>

            <div className="entity-detail-page__credit-body">
              <div className="entity-detail-page__credit-topline">
                <div className="entity-detail-page__credit-title">{item.title}</div>
                {(hasImdbRating || hasTmdbRating) && (
                  <Pill
                    variant={hasImdbRating ? 'imdb' : 'tmdb'}
                    className="entity-detail-page__credit-rating-pill"
                  >
                    <Star size={10} fill="currentColor" strokeWidth={1.8} />
                    {(hasImdbRating ? imdbRating : tmdbRating).toFixed(1)}
                  </Pill>
                )}
              </div>
              <div className="entity-detail-page__credit-meta">
                {metaText && <span>{metaText}</span>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function buildPersonExternalLinks(item, t) {
  if (!item?.id) {
    return [];
  }

  const externalIds = item.external_ids || {};
  const links = [
    {
      key: 'tmdb',
      label: t('library.details.tmdb') || 'TMDb',
      href: `https://www.themoviedb.org/person/${item.id}`,
      iconSrc: '/links/tmdb.svg',
      brandColor: 'var(--color-brand-tmdb)',
    },
    item.homepage
      ? {
          key: 'website',
          label: t('library.details.website') || 'Website',
          href: item.homepage,
          iconSrc: '/links/website.svg',
          brandColor: 'var(--color-text-primary)',
        }
      : null,
    externalIds.imdb_id
      ? {
          key: 'imdb',
          label: t('library.details.imdb') || 'IMDb',
          href: `https://www.imdb.com/name/${externalIds.imdb_id}`,
          iconSrc: '/links/imdb.svg',
          brandColor: 'var(--color-brand-imdb)',
        }
      : null,
    externalIds.instagram_id
      ? {
          key: 'instagram',
          label: 'Instagram',
          href: `https://www.instagram.com/${externalIds.instagram_id}`,
          iconSrc: '/links/instagram.svg',
          brandColor: '#f77737',
        }
      : null,
    externalIds.facebook_id
      ? {
          key: 'facebook',
          label: 'Facebook',
          href: `https://www.facebook.com/${externalIds.facebook_id}`,
          iconSrc: '/links/facebook.svg',
          brandColor: '#1877f2',
        }
      : null,
    externalIds.twitter_id
      ? {
          key: 'x',
          label: 'X',
          href: `https://x.com/${externalIds.twitter_id}`,
          iconSrc: '/links/x.svg',
          brandColor: '#ffffff',
        }
      : null,
    externalIds.youtube_id
      ? {
          key: 'youtube',
          label: 'YouTube',
          href: `https://www.youtube.com/${externalIds.youtube_id.startsWith('@') ? externalIds.youtube_id : `@${externalIds.youtube_id}`}`,
          iconSrc: '/links/youtube.svg',
          brandColor: '#ff0033',
        }
      : null,
    externalIds.tiktok_id
      ? {
          key: 'tiktok',
          label: 'TikTok',
          href: `https://www.tiktok.com/@${externalIds.tiktok_id.replace(/^@/, '')}`,
          iconSrc: '/links/tiktok.svg',
          brandColor: '#25f4ee',
        }
      : null,
  ];

  return links.filter(Boolean);
}

function enrichKnownForItems(knownForItems, movies, series) {
  if (!knownForItems?.length) {
    return [];
  }

  const movieRatings = new Map(
    (movies || [])
      .filter((entry) => entry?.id != null)
      .map((entry) => [String(entry.id), entry.rating_imdb])
  );

  const seriesRatings = new Map();
  for (const entry of series || []) {
    const rating = entry?.rating_imdb;
    const keys = [entry?.series_tmdb_id, entry?.tmdb_id, entry?.id];
    for (const key of keys) {
      if (key != null && !seriesRatings.has(String(key)) && rating != null) {
        seriesRatings.set(String(key), rating);
      }
    }
  }

  return knownForItems.map((entry) => {
    const isTv = isTvLikeMediaType(entry.media_type || entry.type);
    const lookupKeys = isTv
      ? [entry.series_tmdb_id, entry.library_series_tmdb_id, entry.tmdb_id, entry.id]
      : [entry.library_item_id, entry.tmdb_id, entry.id];

    const sourceMap = isTv ? seriesRatings : movieRatings;
    const fallbackImdb = lookupKeys
      .map((key) => (key != null ? sourceMap.get(String(key)) : null))
      .find((value) => value != null);

    return {
      ...entry,
      rating_imdb: entry.rating_imdb ?? fallbackImdb ?? null,
    };
  });
}

export default function PeopleCollectionDetailPage({ type = 'people' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { openModal, closeModal } = useUi();
  const isPeople = type === 'people';

  const [hoveredRating, setHoveredRating] = useState(null);
  const [isActivateHovered, setIsActivateHovered] = useState(false);

  const personQuery = usePersonDetailQuery(id, { enabled: isPeople && Boolean(id) });
  const collectionQuery = useLibraryCollectionDetailQuery(id, { enabled: !isPeople && Boolean(id) });
  const updatePersonStatusMutation = useUpdatePersonStatusMutation();

  const item = isPeople ? personQuery.data : collectionQuery.data;
  const isLoading = isPeople ? personQuery.isLoading : collectionQuery.isLoading;
  const queryError = isPeople ? personQuery.error : collectionQuery.error;
  const hasError = isPeople ? personQuery.isError : collectionQuery.isError;
  const overviewTitle = isPeople
    ? (t('library.details.biographyTitle') || 'Biography')
    : (t('library.details.collectionOverviewTitle') || 'Overview');
  const overviewText = item?.biography || item?.overview || '';
  const overviewEmptyText = t('library.details.noOverviewAvailable') || 'No overview available.';
  const externalLinks = useMemo(
    () => (isPeople ? buildPersonExternalLinks(item, t) : []),
    [isPeople, item, t]
  );
  const profileLinks = useMemo(
    () => externalLinks.filter((link) => link.key === 'tmdb' || link.key === 'imdb'),
    [externalLinks]
  );
  const backdropUrl = resolveDetailsImageUrl(item?.backdrop_path, API_BASE, 'backdrop');
  const mediaUrl = resolveDetailsImageUrl(
    isPeople ? item?.profile_path : item?.poster_path,
    API_BASE,
    'poster'
  );
  const currentRating = item?.user_rating ?? null;
  const displayRating = hoveredRating !== null ? hoveredRating : currentRating;
  const starsFillPercent = displayRating ? (displayRating / 10) * 100 : 0;
  const starsStyleSheetText = `.rating-stars-overlay-dynamic { width: ${starsFillPercent}% !important; }`;

  const handlePeopleRatingMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    let val = Math.ceil(percent * 20) / 2;
    val = Math.max(0.5, Math.min(10.0, val));
    setHoveredRating(val);
  };

  const handlePeopleRatingMouseLeave = () => {
    setHoveredRating(null);
  };

  const handlePeopleRatingClick = () => {
    if (!isPeople || hoveredRating === null || !item?.id) {
      return;
    }
    const isSame = currentRating !== null && currentRating !== undefined && Number(currentRating) === Number(hoveredRating);
    updatePersonStatusMutation.mutate({
      personId: item.id,
      payload: {
        user_rating: isSame ? null : hoveredRating,
      },
    });
  };

  const handleToggleFavorite = () => {
    if (!isPeople || !item?.id) {
      return;
    }
    updatePersonStatusMutation.mutate({
      personId: item.id,
      payload: {
        is_favorite: !item?.is_favorite,
      },
    });
  };

  const handleToggleActive = () => {
    if (!isPeople || !item?.id) {
      return;
    }
    updatePersonStatusMutation.mutate({
      personId: item.id,
      payload: {
        is_active: !item?.is_active,
      },
    });
  };

  const handleOpenReviewModal = () => {
    if (!isPeople || !item?.id) {
      return;
    }

    openModal({
      title: t('library.details.writeReview') || 'Write Review',
      icon: PenLine,
      content: (
        <ReviewModalContent
          initialComment={item?.user_comment}
          onSave={(newComment) => {
            updatePersonStatusMutation.mutate({
              personId: item.id,
              payload: {
                user_comment: newComment || null,
              },
            });
            closeModal();
          }}
          t={t}
        />
      ),
      footer: (
        <div className="modal-footer-row">
          <Button variant="secondary-neutral" onClick={closeModal}>
            {t('common.close') || 'Close'}
          </Button>
          <Button variant="primary" type="submit" form="review-modal-form">
            {t('common.save') || 'Save'}
          </Button>
        </div>
      ),
    });
  };

  const metaPills = isPeople
    ? [
        (() => {
          const GenderIcon = getGenderIcon(item?.gender);
          const genderLabel = getGenderLabel(item?.gender, t);
          if (!genderLabel) {
            return null;
          }

          return {
            key: 'gender',
            content: (
              <span className="entity-detail-page__meta-pill-content">
                <GenderIcon size={14} />
                <span>{genderLabel}</span>
              </span>
            )
          };
        })(),
        item?.known_for_department ? {
          key: 'department',
          content: (
            <span className="entity-detail-page__meta-pill-content">
              <Briefcase size={14} />
              <span>{item.known_for_department}</span>
            </span>
          )
        } : null,
        item?.birthday ? {
          key: 'birthday',
          content: (
            <span className="entity-detail-page__meta-pill-content">
              <Calendar size={14} />
              <span>{item.birthday}</span>
            </span>
          )
        } : null,
        item?.deathday ? {
          key: 'deathday',
          content: (
            <span className="entity-detail-page__meta-pill-content">
              <CalendarX2 size={14} />
              <span>{item.deathday}</span>
            </span>
          )
        } : null,
        item?.place_of_birth ? {
          key: 'place-of-birth',
          content: (
            <span className="entity-detail-page__meta-pill-content">
              <MapPin size={14} />
              <span>{item.place_of_birth}</span>
            </span>
          )
        } : null,
      ].filter(Boolean)
    : [
        item?.total_count !== undefined
          ? {
              key: 'total-count',
              content: (
                <span className="entity-detail-page__meta-pill-content">
                  <Layers size={14} />
                  <span>
                    {t('library.details.totalCount', {
                      count: item.total_count,
                      defaultValue: `${item.total_count} total`,
                    })}
                  </span>
                </span>
              )
            }
          : null,
        item?.owned_count !== undefined
          ? {
              key: 'owned-count',
              content: (
                <span className="entity-detail-page__meta-pill-content">
                  {Number(item.owned_count) === 0 ? <X size={14} /> : <Check size={14} />}
                  <span>
                    {t('library.details.inLibraryCount', {
                      count: item.owned_count,
                      defaultValue: `${item.owned_count} in library`,
                    })}
                  </span>
                </span>
              )
            }
          : null,
      ].filter(Boolean);

  return (
    <DetailPageShell
      backdropUrl={backdropUrl}
      backLabel={t('common.back') || 'Back'}
      isLoading={isLoading}
      pageClassName={`entity-detail-page ${isPeople ? 'entity-detail-page--people' : 'entity-detail-page--collection'}`}
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
        <div className="entity-detail-page__media-column">
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

          {isPeople && profileLinks.length > 0 && (
            <div className="entity-detail-page__profile-links">
              {profileLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="entity-detail-page__profile-link"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}

        </div>

        <div className="entity-detail-page__summary">
          <div className="entity-detail-page__headline-block">
            <h1 className="entity-detail-page__title">
              {item?.name || item?.title || (isPeople ? 'Unknown Person' : 'Unknown Collection')}
            </h1>
            {isPeople && item?.alternate_names?.length > 0 && (
              <div className="entity-detail-page__alternate-names">
                {item.alternate_names.join(', ')}
              </div>
            )}

            {metaPills.length > 0 && (
              <div className="entity-detail-page__meta-row">
                {metaPills.map((item) => (
                  <Pill key={item.key} variant="meta">{item.content}</Pill>
                ))}
              </div>
            )}

          </div>

          {isPeople && (
            <div className="media-detail-page__meta-row">
              <Pill variant="meta-large" className="rating-pill--large entity-detail-page__person-rating-pill">
                <div className="entity-detail-page__person-rating-actions">
                  <button
                    type="button"
                    className={`entity-detail-page__person-rating-action entity-detail-page__person-rating-action--favorite${item?.is_favorite ? ' is-active' : ''}`}
                    onClick={handleToggleFavorite}
                    title={t('library.details.favorite') || 'Favorite'}
                  >
                    <Heart size={15} fill={item?.is_favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    className={`entity-detail-page__person-rating-action entity-detail-page__person-rating-action--activate${item?.is_active ? ' is-active' : ''}`}
                    onClick={handleToggleActive}
                    onMouseEnter={() => setIsActivateHovered(true)}
                    onMouseLeave={() => setIsActivateHovered(false)}
                    title={t('library.people.addPeopleBtn') || 'Activate'}
                  >
                    {item?.is_active
                      ? (isActivateHovered ? <Minus size={15} /> : <Check size={15} />)
                      : <Plus size={15} />}
                  </button>
                  <button
                    type="button"
                    className="review-trigger-btn entity-detail-page__person-rating-action"
                    onClick={handleOpenReviewModal}
                    title={t('library.details.writeReview') || 'Write Review'}
                  >
                    <PenLine size={15} />
                  </button>
                </div>
                <div className="entity-detail-page__person-rating-value">
                  <span className="pill-vertical-separator">|</span>
                  <div
                    className="rating-stars-container"
                    onMouseMove={handlePeopleRatingMouseMove}
                    onMouseLeave={handlePeopleRatingMouseLeave}
                    onMouseUp={handlePeopleRatingClick}
                  >
                    <div className="rating-stars-underlay">
                      <Star size={18} strokeWidth={2.3} />
                      <Star size={18} strokeWidth={2.3} />
                      <Star size={18} strokeWidth={2.3} />
                      <Star size={18} strokeWidth={2.3} />
                      <Star size={18} strokeWidth={2.3} />
                    </div>
                    <style>{starsStyleSheetText}</style>
                    <div className="rating-stars-overlay rating-stars-overlay-dynamic">
                      <div className="rating-stars-overlay-inner">
                        <Star size={18} fill="currentColor" />
                        <Star size={18} fill="currentColor" />
                        <Star size={18} fill="currentColor" />
                        <Star size={18} fill="currentColor" />
                        <Star size={18} fill="currentColor" />
                      </div>
                    </div>
                  </div>
                  <span className={`user-rating-label ${displayRating !== undefined && displayRating !== null ? 'has-value' : ''}`}>
                    {displayRating !== undefined && displayRating !== null
                      ? displayRating.toFixed(1)
                      : (t('library.details.yourRating') || 'Your Rating')}
                  </span>
                </div>
              </Pill>
            </div>
          )}

          {overviewText && (
            <div className="entity-detail-page__summary-layout">
              <div className="entity-detail-page__summary-text">
                <OverviewContent
                  text={overviewText}
                  title={overviewTitle}
                  emptyText={overviewEmptyText}
                  t={t}
                  openModal={openModal}
                />
              </div>
            </div>
          )}
        </div>
      </section>
      )}

      {!hasError && isPeople && Number(item?.total_movie_credits) > 0 && (
        <PersonCreditsGridSection
          title={t('library.details.moviesTitle') || 'Movies'}
          personId={id}
          mediaType="movies"
          totalCount={item?.total_movie_credits}
          navigate={navigate}
          t={t}
        />
      )}

      {!hasError && isPeople && Number(item?.total_series_credits) > 0 && (
        <PersonCreditsGridSection
          title={t('library.details.tvShowsTitle') || 'TV Shows'}
          personId={id}
          mediaType="series"
          totalCount={item?.total_series_credits}
          navigate={navigate}
          t={t}
        />
      )}

      {!hasError && !isPeople && item?.movies?.length > 0 && (
        <CollectionItemsSection items={item.movies} navigate={navigate} t={t} />
      )}
    </DetailPageShell>
  );
}
