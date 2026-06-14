import { useMatchSearch } from './hooks/useMatchSearch';
import { useMatchBrowser } from './hooks/useMatchBrowser';
import { useMatchResolve } from './hooks/useMatchResolve';

const normalizeCandidateType = (value) => {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'tv' || normalized === 'series' || normalized === 'season' || normalized === 'episode'
    ? 'tv'
    : 'movie';
};

export default function useMatchModalViewModel({
  row,
  rows = [],
  t,
  toast,
  onResolved,
}) {
  const targetRows = rows.length > 0 ? rows : (row ? [row] : []);
  const isBulk = targetRows.length > 1;

  const {
    query,
    setQuery,
    mode,
    setMode,
    year,
    setYear,
    season,
    setSeason,
    episode,
    setEpisode,
    results,
    hasSearched,
    isSearching,
    isSeriesMode,
    existingCandidates,
    performSearch,
  } = useMatchSearch({ rows: targetRows, t, toast });

  const {
    browserState,
    isBrowserLoading,
    resetBrowser,
    handleBrowseSeries,
    handleBrowseSeason,
    handleDirectBrowse,
    handleBrowserBack,
    browserTitle,
    browserMetaItems,
    bucketEpisodeNumbers,
    toggleBucketEpisode,
  } = useMatchBrowser({ t });

  const {
    confirmState,
    setConfirmState,
    isResolvingId,
    handleResolve,
  } = useMatchResolve({
    rows: targetRows,
    t,
    toast,
    onResolved,
    mode,
    season,
    episode,
  });

  const handleBrowseSeasonClick = async (seasonEntry) => {
    if (isBulk) {
      await handleResolve(browserState.seriesCandidate, {
        season: seasonEntry.season_number,
        episode: null,
      });
    } else {
      await handleBrowseSeason(seasonEntry);
    }
  };

  const handleSearch = async (event) => {
    event?.preventDefault();
    const searchResults = await performSearch(resetBrowser);
    if (searchResults && searchResults.length === 1 && mode === 'tv') {
      const parsedSeason = Number.parseInt(season, 10);
      if (Number.isFinite(parsedSeason)) {
        handleDirectBrowse(searchResults[0], parsedSeason);
      } else {
        handleBrowseSeries(searchResults[0]);
      }
    }
  };

  const handleModeChange = async (nextMode) => {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    resetBrowser();

    if (hasSearched && !isSearching) {
      const searchResults = await performSearch(resetBrowser, nextMode);
      if (searchResults && searchResults.length === 1 && nextMode === 'tv') {
        const parsedSeason = Number.parseInt(season, 10);
        if (Number.isFinite(parsedSeason)) {
          handleDirectBrowse(searchResults[0], parsedSeason);
        } else {
          handleBrowseSeries(searchResults[0]);
        }
      }
    }
  };

  const handleCandidateSelect = async (candidate) => {
    const mediaType = normalizeCandidateType(candidate.type || candidate.media_type || mode);
    if (mediaType === 'tv') {
      await handleBrowseSeries(candidate);
      return;
    }
    if (candidate.is_active) {
      toast(t('organizer.toasts.matchAlreadyActive'), 'info');
      return;
    }
    await handleResolve(candidate);
  };

  const handleApplyBucket = async () => {
    if (!browserState.seriesCandidate || !browserState.selectedSeason || bucketEpisodeNumbers.length === 0) {
      return;
    }

    await handleResolve(
      {
        ...browserState.seriesCandidate,
        episodes: bucketEpisodeNumbers,
      },
      {
        season: browserState.selectedSeason.season_number,
        episode: null,
      },
    );
  };

  const handleSelectEpisode = async (episodeEntry) => {
    if (!browserState.seriesCandidate || !browserState.selectedSeason) {
      return;
    }

    await handleResolve(
      browserState.seriesCandidate,
      {
        season: browserState.selectedSeason.season_number,
        episode: episodeEntry.episode_number,
      },
    );
  };

  const visibleResultCandidates = hasSearched ? results : existingCandidates;
  const shouldShowPosterResults = browserState.view === 'results' && !hasSearched && visibleResultCandidates.length > 0;
  const shouldShowListResults = browserState.view === 'results' && hasSearched && results.length > 0;

  return {
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
    handleBrowseSeason: handleBrowseSeasonClick,
    handleCandidateSelect,
    handleBrowserBack,
    toggleBucketEpisode,
    handleApplyBucket,
    handleSelectEpisode,
    confirmState,
    setConfirmState,
  };
}
