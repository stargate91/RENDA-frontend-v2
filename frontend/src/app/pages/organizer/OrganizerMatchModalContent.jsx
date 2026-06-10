import { useState, useRef, useCallback, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import EmptyState from '../../ui/EmptyState';
import Spinner from '../../ui/Spinner';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import MatchCandidateCard from './components/MatchCandidateCard';
import MatchSeasonCard from './components/MatchSeasonCard';
import MatchEpisodeCard from './components/MatchEpisodeCard';
import MatchModalSearchForm from './components/MatchModalSearchForm';
import MatchModalBrowserToolbar from './components/MatchModalBrowserToolbar';
import MatchModalBucket from './components/MatchModalBucket';
import useMatchModalViewModel from './components/useMatchModalViewModel';
import '../../styles/MatchModal.css';

export default function OrganizerMatchModalContent({
  row,
  t,
  toast,
  onResolved,
}) {
  const {
    query,
    setQuery,
    mode,
    year,
    setYear,
    season,
    setSeason,
    episode,
    setEpisode,
    results,
    hasSearched,
    isSearching,
    isResolvingId,
    browserState,
    isBrowserLoading,
    isSeriesMode,
    browserTitle,
    browserMetaItems,
    bucketEpisodeNumbers,
    visibleResultCandidates,
    shouldShowPosterResults,
    shouldShowListResults,
    handleSearch,
    handleModeChange,
    handleResolve,
    handleBrowseSeason,
    handleCandidateSelect,
    handleBrowserBack,
    toggleBucketEpisode,
    handleApplyBucket,
    handleSelectEpisode,
    confirmState,
    setConfirmState,
  } = useMatchModalViewModel({ row, t, toast, onResolved });

  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [prevViewSeason, setPrevViewSeason] = useState('');

  const currentViewSeason = `${browserState.view}-${browserState.selectedSeason?.id || browserState.selectedSeason?.season_number || ''}`;
  if (prevViewSeason !== currentViewSeason) {
    setPrevViewSeason(currentViewSeason);
    setVisibleCount(30);
  }

  const observerRef = useRef();
  const loadMoreRef = useCallback((node) => {
    if (isBrowserLoading) return;
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((prev) => prev + 20);
      }
    }, {
      rootMargin: '300px',
    });

    if (node) {
      observerRef.current.observe(node);
    }
  }, [isBrowserLoading]);

  // Clean up observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  const handleConfirmMatch = () => {
    if (!confirmState) return;
    if (dontShowAgain) {
      localStorage.setItem(confirmState.skipKey, 'true');
    }
    confirmState.onConfirm();
    setDontShowAgain(false);
  };

  const handleCancelConfirm = () => {
    setConfirmState(null);
    setDontShowAgain(false);
  };

  const visibleEpisodes = browserState.episodes.slice(0, visibleCount);

  return (
    <div className="organizer-match-modal">
      <MatchModalSearchForm
        query={query}
        setQuery={setQuery}
        year={year}
        setYear={setYear}
        season={season}
        setSeason={setSeason}
        episode={episode}
        setEpisode={setEpisode}
        mode={mode}
        isSeriesMode={isSeriesMode}
        isSearching={isSearching}
        onSearch={handleSearch}
        onModeChange={handleModeChange}
        t={t}
      />

      <section className="organizer-match-modal__section">
        <div className="organizer-match-modal__section-header">
          <strong>
            {browserState.view === 'results'
              ? (hasSearched
                  ? t('organizer.details.matchModal.searchResults')
                  : t('organizer.details.matchModal.detectedMatches'))
              : browserState.view === 'seasons'
                ? t('organizer.details.matchModal.seasons')
                : t('organizer.details.matchModal.episodes')}
          </strong>
          <span>
            {browserState.view === 'results'
              ? (hasSearched
                  ? t('organizer.details.matchModal.searchResultsHint')
                  : t('organizer.details.matchModal.detectedMatchesHint'))
              : browserState.view === 'seasons'
                ? t('organizer.details.matchModal.seasonsHint')
                : t('organizer.details.matchModal.episodesHint')}
          </span>
        </div>

        <MatchModalBrowserToolbar
          view={browserState.view}
          browserTitle={browserTitle}
          browserMetaItems={browserMetaItems}
          seriesCandidate={browserState.seriesCandidate}
          selectedSeason={browserState.selectedSeason}
          bucketEpisodeNumbers={bucketEpisodeNumbers}
          onBack={handleBrowserBack}
          onResolve={handleResolve}
          onApplyBucket={handleApplyBucket}
          t={t}
        />

        <MatchModalBucket
          view={browserState.view}
          bucketEpisodeNumbers={bucketEpisodeNumbers}
          onToggle={toggleBucketEpisode}
          t={t}
        />

        {isBrowserLoading ? (
          <Spinner
            label={t('organizer.details.matchModal.loading')}
          />
        ) : null}

        {browserState.view === 'results' && hasSearched && results.length === 0 && !isSearching ? (
          <EmptyState
            variant="simple"
            title={t('organizer.details.matchModal.noResults')}
          />
        ) : null}

        {shouldShowPosterResults ? (
          <div className="organizer-match-modal__poster-results">
            {visibleResultCandidates.map((candidate) => (
              <MatchCandidateCard
                key={`existing-${candidate.tmdb_id || candidate.id}`}
                candidate={candidate}
                sourceLabel="existing"
                variant="poster"
                mode={mode}
                isResolvingId={isResolvingId}
                isBrowserLoading={isBrowserLoading}
                onSelect={handleCandidateSelect}
                t={t}
              />
            ))}
          </div>
        ) : null}

        {shouldShowListResults ? (
          <div className="organizer-match-modal__results">
            {results.map((candidate) => (
              <MatchCandidateCard
                key={`search-${candidate.tmdb_id || candidate.id}`}
                candidate={candidate}
                sourceLabel="search"
                variant="list"
                mode={mode}
                isResolvingId={isResolvingId}
                isBrowserLoading={isBrowserLoading}
                onSelect={handleCandidateSelect}
                t={t}
              />
            ))}
          </div>
        ) : null}

        {browserState.view === 'seasons' && !isBrowserLoading ? (
          browserState.seasons.length > 0 ? (
            <div className="organizer-match-modal__browser-grid organizer-match-modal__browser-grid--seasons">
              {browserState.seasons.map((seasonEntry) => {
                const candidateId = Number(browserState.seriesCandidate?.tmdb_id || browserState.seriesCandidate?.id || 0);
                const rowSeriesId = Number(row.rawPayload?.series_tmdb_id || row.rawPayload?.tmdb_id || 0);
                const isCurrentSeries = candidateId > 0 && rowSeriesId > 0 && candidateId === rowSeriesId;
                const isActiveSeason = isCurrentSeries && Number(seasonEntry.season_number) === Number(row.rawPayload?.season);
                return (
                  <MatchSeasonCard
                    key={`season-${seasonEntry.season_number}`}
                    seasonEntry={seasonEntry}
                    isBrowserLoading={isBrowserLoading}
                    onSelect={handleBrowseSeason}
                    isActive={isActiveSeason}
                    t={t}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              variant="simple"
              title={t('organizer.details.matchModal.noSeasons')}
            />
          )
        ) : null}

        {browserState.view === 'episodes' && !isBrowserLoading ? (
          browserState.episodes.length > 0 ? (
            <>
              <div className="organizer-match-modal__browser-grid organizer-match-modal__browser-grid--episodes">
                {visibleEpisodes.map((episodeEntry) => {
                  const candidateId = Number(browserState.seriesCandidate?.tmdb_id || browserState.seriesCandidate?.id || 0);
                  const rowSeriesId = Number(row.rawPayload?.series_tmdb_id || row.rawPayload?.tmdb_id || 0);
                  const isCurrentSeries = candidateId > 0 && rowSeriesId > 0 && candidateId === rowSeriesId;
                  const isActiveSeason = isCurrentSeries && Number(browserState.selectedSeason?.season_number) === Number(row.rawPayload?.season);
                  const currentEpisodes = Array.isArray(row.rawPayload?.episode)
                      ? row.rawPayload.episode.map(Number)
                      : row.rawPayload?.episode != null
                        ? [Number(row.rawPayload.episode)]
                        : [];
                  const isActiveEpisode = isActiveSeason && currentEpisodes.includes(Number(episodeEntry.episode_number));
                  return (
                    <MatchEpisodeCard
                      key={`episode-${episodeEntry.id || episodeEntry.episode_number}`}
                      episodeEntry={episodeEntry}
                      isBucketed={bucketEpisodeNumbers.includes(episodeEntry.episode_number)}
                      isDisabled={isResolvingId === (browserState.seriesCandidate?.tmdb_id || browserState.seriesCandidate?.id)}
                      onSelect={handleSelectEpisode}
                      onToggle={toggleBucketEpisode}
                      isActive={isActiveEpisode}
                      t={t}
                    />
                  );
                })}
              </div>
              {browserState.episodes.length > visibleCount && (
                <div
                  ref={loadMoreRef}
                  className="organizer-match-modal__load-more-sentinel"
                  style={{ height: '20px', margin: '10px 0' }}
                />
              )}
            </>
          ) : (
            <EmptyState
              variant="simple"
              title={t('organizer.details.matchModal.noEpisodes')}
            />
          )
        ) : null}
      </section>

      {confirmState ? (
        <div className="ui-confirm-overlay">
          <div className="ui-confirm-dialog">
            <div className="ui-confirm-header">
              <HelpCircle size={20} className="ui-confirm-icon" />
              <strong className="ui-confirm-title">
                {t(`organizer.details.matchModal.confirm.${confirmState.type}.title`)}
              </strong>
            </div>
            <p className="ui-confirm-description">
              {confirmState.type === 'bucket'
                ? t('organizer.details.matchModal.confirm.bucket.desc')
                : confirmState.hasExisting
                  ? t(`organizer.details.matchModal.confirm.${confirmState.type}.descWithExisting`).replace('{existing}', confirmState.existingDetails)
                  : t(`organizer.details.matchModal.confirm.${confirmState.type}.descNoExisting`)}
            </p>
            <div className="ui-confirm-optout">
              <Checkbox
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
              >
                {t('organizer.details.matchModal.confirm.dontShowAgain')}
              </Checkbox>
            </div>
            <div className="ui-confirm-actions">
              <Button
                type="button"
                variant="secondary-neutral"
                size="sm"
                onClick={handleCancelConfirm}
              >
                {t('organizer.details.matchModal.confirm.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleConfirmMatch}
              >
                {t('organizer.details.matchModal.confirm.confirmBtn')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
