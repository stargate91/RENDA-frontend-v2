import { useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ImageOff, Star } from 'lucide-react';
import EmptyState from '@/ui/EmptyState';
import NavButton from '@/ui/NavButton';
import Pill from '@/ui/Pill';
import SegmentedControl from '@/ui/SegmentedControl';
import CreditCard from '@/ui/CreditCard';
import TMDBImageGrid from './TMDBImageGrid';
import ImageUploadPanel from '../../modals/ImageUploadPanel';
import { useUi } from '@/providers/UiProvider';
import api from '@/lib/api';
import { API_BASE } from '@/lib/backend';
import { getPosterImagePath } from '@/lib/imageUrls';
import { usePersonBackdropChooserStore, createPersonBackdropChooserSession } from '@/stores/usePersonBackdropChooserStore';
import { usePersonCreditBackdropsQuery, usePersonCreditsQuery } from '@/queries/metadataQueries';
import { isTvLikeMediaType } from '@/lib/mediaTypes';
import { resolveDetailsImageUrl } from '../../utils/detailUtils';
import {
  mergeBackdropCreditPages,
  normalizeBackdropKey,
  prioritizePersonCredits,
  sortBackdropCredits,
} from '../../peopleCollectionDetailUtils.jsx';
import './PersonBackdropPickerModal.css';

const PERSON_BACKDROP_INITIAL_ROWS = 2;
const PERSON_BACKDROP_COLUMNS = 4;
const PERSON_BACKDROP_PAGE_SIZE = 20;

export default function PersonBackdropPickerModal({ personId, item, t, toast, overridePersonBackdropMutation, uploadPersonBackdropMutation }) {
  const viewportRef = useRef(null);
  const { updateModal } = useUi();
  const sessionKey = String(personId || '');
  const ensureSession = usePersonBackdropChooserStore((state) => state.ensureSession);
  const patchSession = usePersonBackdropChooserStore((state) => state.patchSession);
  const session = usePersonBackdropChooserStore((state) => state.sessions[sessionKey]);
  const resolvedSession = session || createPersonBackdropChooserSession(item?.backdrop_path || '');
  const {
    activeTab,
    selectedBackdropPath,
    currentSourceCreditKey,
    selectedCredit,
    moviePages,
    seriesPages,
    movieNextPage,
    seriesNextPage,
    movieLoadingMore,
    seriesLoadingMore,
    creditValidationByKey,
  } = resolvedSession;

  const isTmdbPerformer = !!item?.external_ids?.tmdb_id || (!item?.external_ids?.stashdb_id && !item?.external_ids?.fansdb_id && !item?.external_ids?.theporndb_id);

  const selectedBackdropTmdbId = Number(selectedCredit?.series_tmdb_id || selectedCredit?.tmdb_id || selectedCredit?.id || 0);
  const selectedBackdropMediaType = isTvLikeMediaType(selectedCredit?.media_type || selectedCredit?.type) ? 'tv' : 'movie';
  const selectedBackdropMetadataQuery = usePersonCreditBackdropsQuery(personId, selectedBackdropTmdbId, selectedBackdropMediaType, {
    enabled: Boolean(personId) && Number.isFinite(selectedBackdropTmdbId) && selectedBackdropTmdbId > 0 && isTmdbPerformer,
  });

  useEffect(() => {
    ensureSession(personId, item?.backdrop_path || '');
  }, [ensureSession, item?.backdrop_path, personId]);

  useEffect(() => {
    if (!session) {
      patchSession(personId, { selectedBackdropPath: item?.backdrop_path || '' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  const initialTabPageSize = PERSON_BACKDROP_COLUMNS * PERSON_BACKDROP_INITIAL_ROWS;
  const moviesQuery = usePersonCreditsQuery(personId, 'movies', 1, PERSON_BACKDROP_PAGE_SIZE, {
    enabled: Boolean(personId) && activeTab === 'movies' && isTmdbPerformer,
    excludeKnownFor: false,
  });
  const seriesQuery = usePersonCreditsQuery(personId, 'series', 1, PERSON_BACKDROP_PAGE_SIZE, {
    enabled: Boolean(personId) && activeTab === 'series' && isTmdbPerformer,
    excludeKnownFor: false,
  });

  useEffect(() => {
    if (isTmdbPerformer && moviesQuery.data?.items && (!moviePages || moviePages.length === 0)) {
      patchSession(personId, { moviePages: [moviesQuery.data], movieNextPage: 2 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moviesQuery.data, patchSession, personId, isTmdbPerformer]);

  useEffect(() => {
    if (isTmdbPerformer && seriesQuery.data?.items && (!seriesPages || seriesPages.length === 0)) {
      patchSession(personId, { seriesPages: [seriesQuery.data], seriesNextPage: 2 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patchSession, personId, seriesQuery.data, isTmdbPerformer]);

  const currentBackdropKey = normalizeBackdropKey(selectedBackdropPath || item?.backdrop_path);
  const movieItems = useMemo(
    () => prioritizePersonCredits(
      sortBackdropCredits(mergeBackdropCreditPages(moviePages)),
      item?.known_for || []
    ),
    [item?.known_for, moviePages]
  );
  const seriesItems = useMemo(
    () => prioritizePersonCredits(
      sortBackdropCredits(mergeBackdropCreditPages(seriesPages)),
      item?.known_for || []
    ),
    [item?.known_for, seriesPages]
  );

  const activeItems = activeTab === 'movies' ? movieItems : seriesItems;
  const matchedCreditKey = useMemo(() => {
    if (!currentBackdropKey) {
      return '';
    }
    const matchedCredit = activeItems.find((credit) => normalizeBackdropKey(credit?.backdrop_path) === currentBackdropKey);
    if (!matchedCredit) {
      return '';
    }
    return String(matchedCredit.tmdb_id || matchedCredit.id || '');
  }, [activeItems, currentBackdropKey]);
  const selectedCreditKey = currentSourceCreditKey || matchedCreditKey;
  const selectedBackdrops = useMemo(() => {
    const allBackdrops = selectedBackdropMetadataQuery.data?.backdrops || [];
    return allBackdrops.filter((bd) => (!bd.iso_639_1 || bd.iso_639_1 === '') && Number(bd.width) >= 1280);
  }, [selectedBackdropMetadataQuery.data]);

  const visibleItems = useMemo(
    () => activeItems.filter((credit) => creditValidationByKey[String(credit.tmdb_id || credit.id || '')] !== false),
    [activeItems, creditValidationByKey]
  );

  const totalAvailableItems = activeTab === 'movies'
    ? Math.max(movieItems.length, Number(moviePages[0]?.total_items) || 0)
    : Math.max(seriesItems.length, Number(seriesPages[0]?.total_items) || 0);
  const progressTotal = Math.max(totalAvailableItems, activeItems.length);
  const validatedCount = useMemo(
    () => activeItems.reduce((count, credit) => {
      const key = String(credit.tmdb_id || credit.id || '');
      return count + (creditValidationByKey[key] !== undefined ? 1 : 0);
    }, 0),
    [activeItems, creditValidationByKey]
  );
  const validationPendingCount = Math.max(0, activeItems.length - validatedCount);
  const hasMore = activeItems.length < totalAvailableItems;
  const isLoading = isTmdbPerformer && (activeTab === 'movies'
    ? (moviesQuery.isLoading || movieLoadingMore)
    : activeTab === 'series'
      ? (seriesQuery.isLoading || seriesLoadingMore)
      : false);

  const loadMore = async () => {
    if (!personId || overridePersonBackdropMutation.isPending || !isTmdbPerformer) {
      return;
    }

    if (activeTab === 'movies') {
      const totalPages = Math.max(1, Number(moviePages[0]?.total_pages) || 1);
      if (movieLoadingMore || movieNextPage > totalPages) {
        return;
      }
      patchSession(personId, { movieLoadingMore: true });
      try {
        const nextPage = await api.people.getCredits(personId, 'movies', {
          page: movieNextPage,
          pageSize: PERSON_BACKDROP_PAGE_SIZE,
          excludeKnownFor: false,
        });
        patchSession(personId, (current) => ({
          moviePages: [...(current.moviePages || []), nextPage],
          movieNextPage: (current.movieNextPage || 2) + 1,
        }));
      } finally {
        patchSession(personId, { movieLoadingMore: false });
      }
      return;
    }

    if (activeTab === 'series') {
      const totalPages = Math.max(1, Number(seriesPages[0]?.total_pages) || 1);
      if (seriesLoadingMore || seriesNextPage > totalPages) {
        return;
      }
      patchSession(personId, { seriesLoadingMore: true });
      try {
        const nextPage = await api.people.getCredits(personId, 'series', {
          page: seriesNextPage,
          pageSize: PERSON_BACKDROP_PAGE_SIZE,
          excludeKnownFor: false,
        });
        patchSession(personId, (current) => ({
          seriesPages: [...(current.seriesPages || []), nextPage],
          seriesNextPage: (current.seriesNextPage || 2) + 1,
        }));
      } finally {
        patchSession(personId, { seriesLoadingMore: false });
      }
    }
  };

  useEffect(() => {
    if (selectedCredit || !hasMore || isLoading || !isTmdbPerformer) {
      return;
    }
    void loadMore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, hasMore, isLoading, selectedCredit, totalAvailableItems, isTmdbPerformer]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || selectedCredit || !hasMore || isLoading || !isTmdbPerformer) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (remaining <= 180) {
        void loadMore();
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, hasMore, isLoading, selectedCredit, visibleItems.length, isTmdbPerformer]);

  useEffect(() => {
    if (!personId || selectedCredit || activeItems.length === 0 || !isTmdbPerformer) {
      return undefined;
    }

    let cancelled = false;
    const candidates = activeItems.filter((credit) => {
      const key = String(credit.tmdb_id || credit.id || '');
      return key && creditValidationByKey[key] === undefined;
    });

    if (candidates.length === 0) {
      return undefined;
    }

    const run = async () => {
      const batch = candidates.slice(0, 4);
      const results = await Promise.all(batch.map(async (credit) => {
        const creditKey = String(credit.tmdb_id || credit.id || '');
        const tmdbId = Number(credit.series_tmdb_id || credit.tmdb_id || credit.id || 0);
        const mediaType = isTvLikeMediaType(credit.media_type || credit.type) ? 'tv' : 'movie';
        try {
          const response = await api.people.getCreditBackdrops(personId, tmdbId, mediaType);
          const hasValidBackdrops = typeof response?.has_valid_backdrops === 'boolean'
            ? response.has_valid_backdrops
            : Boolean((response?.backdrops || []).some(
              (bd) => (!bd?.iso_639_1 || bd.iso_639_1 === '') && Number(bd?.width) >= 1280
            ));
          return [creditKey, hasValidBackdrops];
        } catch {
          return [creditKey, true];
        }
      }));

      if (cancelled) {
        return;
      }

      patchSession(personId, (current) => ({
        creditValidationByKey: {
          ...(current.creditValidationByKey || {}),
          ...Object.fromEntries(results),
        },
      }));
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeItems, creditValidationByKey, patchSession, personId, selectedCredit, isTmdbPerformer]);

  const handleViewportScroll = (event) => {
    if (selectedCredit || !hasMore || isLoading || !isTmdbPerformer) {
      return;
    }
    const viewport = event.currentTarget;
    const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (remaining <= 180) {
      void loadMore();
    }
  };

  const handleOpenBackdropBrowser = (credit) => {
    if (!credit) {
      return;
    }
    const viewport = viewportRef.current;
    const scrollTop = viewport ? viewport.scrollTop : 0;
    patchSession(personId, { selectedCredit: credit, gridScrollTop: scrollTop });
    if (viewport) {
      viewport.scrollTop = 0;
    }
  };

  const handleBackToCredits = () => {
    const savedScrollTop = resolvedSession.gridScrollTop || 0;
    patchSession(personId, { selectedCredit: null });
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport) {
        viewport.scrollTop = savedScrollTop;
      }
    });
  };

  const handleUploadBackdrop = async (file) => {
    if (!file || uploadPersonBackdropMutation?.isPending) {
      return;
    }
    try {
      const data = await uploadPersonBackdropMutation.mutateAsync({
        personId,
        file,
      });
      patchSession(personId, { selectedBackdropPath: data?.backdrop_path || item?.backdrop_path || '' });
      toast(t('library.details.imageUploaded') || 'Image uploaded and updated successfully!', 'success');
    } catch (err) {
      toast(err.message || t('library.details.imageUploadFailed') || 'Failed to upload image', 'danger');
    }
  };

  const handleSaveBackdropUrl = async (backdropPath) => {
    if (!backdropPath || overridePersonBackdropMutation.isPending) {
      return;
    }
    patchSession(personId, { selectedBackdropPath: backdropPath });
    try {
      await overridePersonBackdropMutation.mutateAsync({
        personId,
        backdropPath,
      });
      toast(t('library.details.backdropUpdated') || 'Backdrop updated successfully!', 'success');
    } catch (err) {
      toast(err.message || t('library.details.backdropUpdateFailed') || 'Failed to update backdrop', 'danger');
    }
  };

  const handleSelectDetailedBackdrop = async (backdropPath) => {
    if (!backdropPath || overridePersonBackdropMutation.isPending) {
      return;
    }
    patchSession(personId, {
      selectedBackdropPath: backdropPath,
      currentSourceCreditKey: String(selectedCredit?.tmdb_id || selectedCredit?.id || ''),
    });
    try {
      await overridePersonBackdropMutation.mutateAsync({
        personId,
        backdropPath,
      });
      toast(t('library.details.backdropUpdated') || 'Backdrop updated successfully!', 'success');
    } catch (err) {
      toast(err.message || t('library.details.backdropUpdateFailed') || 'Failed to update backdrop', 'danger');
    }
  };

  const isBackdropBrowserOpen = Boolean(selectedCredit);
  const isUploadPending = Boolean(uploadPersonBackdropMutation?.isPending);
  const headerDescription = isTmdbPerformer && !isBackdropBrowserOpen && (validationPendingCount > 0 || hasMore || isLoading)
    ? t('library.details.backdropFilterRunning', {
      checked: validatedCount,
      total: progressTotal || 0,
      defaultValue: 'Checking title backdrops ({{checked}}/{{total}}). You can keep browsing.',
    })
    : undefined;

  useEffect(() => {
    updateModal({ description: headerDescription });
    return () => {
      updateModal({ description: undefined });
    };
  }, [headerDescription, updateModal]);

  return (
    <div className="person-backdrop-picker">
      {isBackdropBrowserOpen ? (
        <div className="person-backdrop-picker__detail-toolbar">
          <NavButton className="person-backdrop-picker__back-btn" onClick={handleBackToCredits} icon={ChevronLeft}>
            {t('common.back') || 'Back'}
          </NavButton>
          <h4 className="details-panel__section-title person-backdrop-picker__detail-title">
            {selectedBackdropMetadataQuery.data?.title || selectedCredit?.title}
          </h4>
        </div>
      ) : null}

      {!isBackdropBrowserOpen && (
        <ImageUploadPanel
          imageType="backdrop"
          isPending={overridePersonBackdropMutation.isPending || isUploadPending}
          t={t}
          onSaveUrl={handleSaveBackdropUrl}
          onUploadFile={handleUploadBackdrop}
        />
      )}

      {isTmdbPerformer && !isBackdropBrowserOpen && (
        <SegmentedControl
          ariaLabel={t('library.details.chooseBackdrop') || 'Choose backdrop source'}
          className="person-backdrop-picker__tabs"
          options={[
            { value: 'movies', label: t('library.details.moviesTitle') || 'Movies' },
            { value: 'series', label: t('library.details.tvShowsTitle') || 'Series' },
          ]}
          value={activeTab}
          onChange={(value) => patchSession(personId, { activeTab: value, selectedCredit: null })}
        />
      )}

      {isTmdbPerformer && (
        <div
          ref={viewportRef}
          className={`person-backdrop-picker__viewport${isBackdropBrowserOpen ? ' person-backdrop-picker__viewport--detail' : ''}`}
          onScroll={handleViewportScroll}
        >
          {isBackdropBrowserOpen ? (
            <div className="person-backdrop-picker__detail-view">
              <TMDBImageGrid
                customImages={selectedBackdrops}
                imageType="backdrop"
                currentPath={selectedBackdropPath || item?.backdrop_path}
                onSelect={handleSelectDetailedBackdrop}
                isPending={overridePersonBackdropMutation.isPending || isUploadPending}
                pendingPath={overridePersonBackdropMutation.variables?.backdropPath}
                t={t}
              />
            </div>
          ) : (
            <div className="person-backdrop-picker__grid">
              {isLoading && visibleItems.length === 0 && Array.from({ length: initialTabPageSize }).map((_, index) => (
                <div key={`person-backdrop-skeleton-${activeTab}-${index}`} className="ui-credit-card ui-credit-card--people-grid entity-detail-page__skeleton-card">
                  <div className="entity-detail-page__skeleton-block entity-detail-page__skeleton-block--credit-poster" />
                  <div className="ui-credit-card__body">
                    <div className="ui-credit-card__topline">
                      <div className="entity-detail-page__skeleton-block entity-detail-page__skeleton-block--credit-title" />
                    </div>
                    <div className="ui-credit-card__meta">
                      <div className="entity-detail-page__skeleton-block entity-detail-page__skeleton-block--credit-meta" />
                      <div className="entity-detail-page__skeleton-block entity-detail-page__skeleton-block--credit-pill" />
                    </div>
                  </div>
                </div>
              ))}

              {!isLoading && visibleItems.length === 0 && (
                <EmptyState
                  variant="detail-panel"
                  icon={ImageOff}
                  className="backdrops-panel__empty-state person-backdrop-picker__empty"
                  title={t('library.details.noBackdropsAvailable') || 'No good backdrop options found for this title.'}
                />
              )}

              {visibleItems.map((credit) => {
                const creditKey = String(credit.tmdb_id || credit.id || '');
                const isSelected = selectedCreditKey !== '' && selectedCreditKey === creditKey;
                const isPending = overridePersonBackdropMutation.isPending && overridePersonBackdropMutation.variables?.backdropPath === credit.backdrop_path;
                const rating = Number(credit.rating_tmdb ?? credit.rating);
                const hasRating = Number.isFinite(rating) && rating > 0;
                const posterPath = getPosterImagePath(credit);
                const posterUrl = posterPath ? resolveDetailsImageUrl(posterPath, API_BASE, 'poster') : null;

                return (
                  <CreditCard
                    key={`person-backdrop-${activeTab}-${credit.tmdb_id || credit.id}`}
                    title={credit.title}
                    imageUrl={posterUrl}
                    isTv={isTvLikeMediaType(credit.media_type || credit.type)}
                    isPeopleGrid={true}
                    isCollectionItem={true}
                    isKnownFor={credit.is_known_for}
                    isOwned={credit.in_library}
                    isMissing={!credit.in_library}
                    className={`${isSelected ? 'person-backdrop-picker__card--selected' : ''} ${isPending ? 'backdrop-card--disabled' : ''}`}
                    onClick={() => handleOpenBackdropBrowser(credit)}
                    disabled={overridePersonBackdropMutation.isPending || isUploadPending}
                  >
                    <div className="ui-credit-card__meta">
                      {credit.year && <span>{credit.year}</span>}
                      {hasRating && (
                        <Pill variant="tmdb" className="ui-credit-card__rating-pill">
                          <Star size={10} fill="currentColor" strokeWidth={1.8} />
                          {rating.toFixed(1)}
                        </Pill>
                      )}
                      {isSelected ? (
                        <Pill variant="success" className="ui-credit-card__status-pill">
                          {t('common.current') || 'Current'}
                        </Pill>
                      ) : (
                        <Pill
                          variant={credit.in_library ? 'success' : 'missing'}
                          className="ui-credit-card__status-pill"
                        >
                          {credit.in_library
                            ? (t('library.details.have') || 'Have')
                            : (t('library.details.missing') || 'Missing')}
                        </Pill>
                      )}
                    </div>
                  </CreditCard>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
