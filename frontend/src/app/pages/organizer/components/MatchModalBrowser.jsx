import { useState, useRef, useCallback, useEffect } from 'react';
import EmptyState from '../../../ui/EmptyState';
import MatchSeasonCard from './MatchSeasonCard';
import MatchEpisodeCard from './MatchEpisodeCard';

export default function MatchModalBrowser({
  browserState,
  isBrowserLoading,
  row,
  bucketEpisodeNumbers,
  isResolvingId,
  onBrowseSeason,
  onSelectEpisode,
  onToggleBucketEpisode,
  t,
}) {
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

  const visibleEpisodes = browserState.episodes.slice(0, visibleCount);

  return (
    <>
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
                  onSelect={onBrowseSeason}
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
                    onSelect={onSelectEpisode}
                    onToggle={onToggleBucketEpisode}
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
    </>
  );
}
