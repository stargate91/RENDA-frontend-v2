import { useMemo, useState } from 'react';
import { useTranslation } from '@/providers/LanguageProvider';
import {
  useSearchMetadataQuery,
  useTvSeasonsQuery,
  useTvEpisodesQuery,
  useResolveMetadataMutation,
} from '@/queries/organizerQueries';

const getDefaultType = (row) => (
  row?.rawType === 'episode' || row?.rawType === 'series' ? 'tv' : 'movie'
);

const getDefaultQuery = (row) => {
  const payload = row?.rawPayload || {};
  return payload.title || payload.fn_title || payload.fd_title || row?.source || '';
};

const getDefaultYear = (row) => {
  const payload = row?.rawPayload || {};
  return payload.year || payload.fn_year || payload.fd_year || '';
};

const getDefaultSeason = (row) => {
  const payload = row?.rawPayload || {};
  return payload.season ?? payload.fn_season ?? payload.fd_season ?? payload.it_season ?? '';
};

const getDefaultEpisode = (row) => {
  const payload = row?.rawPayload || {};
  return payload.episode ?? payload.fn_episode ?? payload.fd_episode ?? payload.it_episode ?? '';
};

const getDisplayTitle = (candidate, mediaType, t) => (
  candidate?.title
  || candidate?.name
  || candidate?.original_title
  || candidate?.original_name
  || (mediaType === 'tv' ? t('organizer.details.matchModal.unknownSeries') : t('organizer.details.matchModal.unknownMovie'))
);

const normalizeCandidateType = (value) => {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'tv' || normalized === 'series' || normalized === 'season' || normalized === 'episode'
    ? 'tv'
    : 'movie';
};

const toOptionalNumber = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildResolvePayload = (row, candidate, selectedMode, seasonValue, episodeValue) => {
  const episodeList = Array.isArray(candidate?.episodes) ? candidate.episodes : [];
  const mediaType = normalizeCandidateType(candidate?.type || candidate?.media_type || selectedMode);
  const season = toOptionalNumber(seasonValue);
  const episode = toOptionalNumber(episodeValue);

  const target = {
    tmdb_id: candidate.tmdb_id || candidate.id,
    item_type: mediaType,
  };

  if (mediaType === 'tv' && season != null) {
    target.season = season;
  }

  if (mediaType === 'tv' && episode != null) {
    target.episode = episode;
  }

  if (mediaType === 'tv' && episodeList.length > 0) {
    target.episodes = episodeList;
  }

  return {
    item_id: row.itemId,
    targets: [target],
  };
};

const createBrowserState = () => ({
  view: 'results',
  seriesCandidate: null,
  selectedSeason: null,
  bucketEpisodes: [],
});

export default function useMatchModalViewModel({
  row,
  t,
  toast,
  onResolved,
}) {
  const [query, setQuery] = useState(getDefaultQuery(row));
  const [mode, setMode] = useState(getDefaultType(row));
  const [year, setYear] = useState(String(getDefaultYear(row) || ''));
  const [season, setSeason] = useState(String(getDefaultSeason(row) || ''));
  const [episode, setEpisode] = useState(String(getDefaultEpisode(row) || ''));
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isResolvingId, setIsResolvingId] = useState(null);
  const [browserState, setBrowserState] = useState(createBrowserState);
  const isSeriesMode = mode === 'tv';

  const existingCandidates = useMemo(
    () => (row?.rawPayload?.matches || []).map((match) => ({
      id: match.tmdb_id,
      tmdb_id: match.tmdb_id,
      type: match.type,
      title: match.title,
      release_date: match.year ? `${match.year}-01-01` : null,
      first_air_date: match.year ? `${match.year}-01-01` : null,
      poster_path: match.poster_path,
      vote_average: match.vote_average,
      confidence: match.confidence,
      is_active: match.is_active,
      source: 'existing',
    })),
    [row],
  );

  const resetBrowser = () => setBrowserState(createBrowserState());

  const { locale } = useTranslation();
  const tmdbLanguage = locale === 'en' ? 'en-US' : `${locale}-${locale.toUpperCase()}`;

  const { refetch: refetchSearch, isFetching: isSearching } = useSearchMetadataQuery(
    query,
    mode,
    year,
    { enabled: false }
  );

  const seriesId = browserState.seriesCandidate?.tmdb_id || browserState.seriesCandidate?.id;
  const { data: seasonsData, isFetching: isSeasonsFetching } = useTvSeasonsQuery(seriesId, {
    enabled: !!seriesId,
    language: tmdbLanguage,
  });

  const selectedSeasonNum = browserState.selectedSeason?.season_number;
  const { data: episodesData, isFetching: isEpisodesFetching } = useTvEpisodesQuery(seriesId, selectedSeasonNum, {
    enabled: !!seriesId && selectedSeasonNum != null,
    language: tmdbLanguage,
  });

  const resolveMutation = useResolveMetadataMutation();

  const isBrowserLoading = isSeasonsFetching || isEpisodesFetching;

  const performSearch = async (searchMode = mode) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      toast(t('organizer.toasts.matchSearchMissingQuery'), 'danger');
      return false;
    }

    setHasSearched(true);
    resetBrowser();
    try {
      const { data, error } = await refetchSearch();
      if (error) {
        throw error;
      }
      setResults(
        Array.isArray(data)
          ? data.map((candidate) => ({
              ...candidate,
              media_type: candidate.media_type || searchMode,
            }))
          : [],
      );
      return true;
    } catch (error) {
      toast(error.message || t('organizer.toasts.matchSearchFailed'), 'danger');
      return false;
    }
  };

  const handleSearch = async (event) => {
    event?.preventDefault();
    await performSearch();
  };

  const handleModeChange = async (nextMode) => {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    resetBrowser();

    if (hasSearched && !isSearching) {
      await performSearch(nextMode);
    }
  };

  const [confirmState, setConfirmState] = useState(null);

  const requestConfirm = (type, skipKey, onConfirm) => {
    if (localStorage.getItem(skipKey) === 'true') {
      onConfirm();
      return;
    }

    const defaultSeasonVal = getDefaultSeason(row);
    const defaultEpisodeVal = getDefaultEpisode(row);
    let hasExisting = false;
    let existingDetails = '';

    if (type === 'series') {
      if (defaultSeasonVal != null || defaultEpisodeVal != null) {
        hasExisting = true;
        const parts = [];
        if (defaultSeasonVal != null) parts.push(`S${defaultSeasonVal}`);
        if (defaultEpisodeVal != null) parts.push(`E${defaultEpisodeVal}`);
        existingDetails = parts.join(' ');
      }
    } else if (type === 'season') {
      if (defaultEpisodeVal != null) {
        hasExisting = true;
        existingDetails = `E${defaultEpisodeVal}`;
      }
    }

    setConfirmState({
      type,
      skipKey,
      hasExisting,
      existingDetails,
      onConfirm: () => {
        onConfirm();
        setConfirmState(null);
      },
    });
  };

  const handleResolve = async (candidate, overrides = {}) => {
    const candidateId = candidate.tmdb_id || candidate.id;
    const effectiveSeason = overrides.season !== undefined ? overrides.season : season;
    const effectiveEpisode = overrides.episode !== undefined ? overrides.episode : episode;

    const performResolve = async () => {
      setIsResolvingId(candidateId);
      try {
        await resolveMutation.mutateAsync(buildResolvePayload(row, candidate, mode, effectiveSeason, effectiveEpisode));
        await onResolved();
        toast(t('organizer.toasts.matchResolveSuccess'), 'success');
      } catch (error) {
        toast(error.message || t('organizer.toasts.matchResolveFailed'), 'danger');
      } finally {
        setIsResolvingId(null);
      }
    };

    if (mode === 'tv' && effectiveSeason === null && effectiveEpisode === null) {
      requestConfirm('series', 'renda_skip_confirm_series', performResolve);
      return;
    }
    if (mode === 'tv' && effectiveSeason !== null && effectiveEpisode === null) {
      const isBucket = Array.isArray(candidate?.episodes) && candidate.episodes.length > 0;
      if (isBucket) {
        requestConfirm('bucket', 'renda_skip_confirm_bucket', performResolve);
      } else {
        requestConfirm('season', 'renda_skip_confirm_season', performResolve);
      }
      return;
    }

    await performResolve();
  };

  const handleBrowseSeries = async (candidate) => {
    setBrowserState({
      view: 'seasons',
      seriesCandidate: candidate,
      selectedSeason: null,
      bucketEpisodes: [],
    });
  };

  const handleBrowseSeason = async (seasonEntry) => {
    setBrowserState((current) => ({
      ...current,
      view: 'episodes',
      selectedSeason: seasonEntry,
      bucketEpisodes: [],
    }));
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

  const handleBrowserBack = () => {
    setBrowserState((current) => {
      if (current.view === 'episodes') {
        return {
          ...current,
          view: 'seasons',
          selectedSeason: null,
          bucketEpisodes: [],
        };
      }
      return createBrowserState();
    });
  };

  const browserTitle = browserState.view === 'episodes'
    ? browserState.selectedSeason?.name || t('organizer.details.matchModal.seasonNum').replace('{number}', browserState.selectedSeason?.season_number ?? '')
    : browserState.seriesCandidate
      ? getDisplayTitle(browserState.seriesCandidate, 'tv', t)
      : '';

  const seasonsList = seasonsData?.seasons;
  const episodesList = episodesData?.episodes;

  const browserMetaItems = browserState.view === 'episodes'
    ? [
        browserState.selectedSeason?.episode_count ? `${browserState.selectedSeason.episode_count} eps` : null,
      ]
    : [
        seasonsList?.length ? `${seasonsList.length} seasons` : null,
      ];

  const bucketEpisodeNumbers = browserState.bucketEpisodes || [];
  const visibleResultCandidates = hasSearched ? results : existingCandidates;
  const shouldShowPosterResults = browserState.view === 'results' && !hasSearched && visibleResultCandidates.length > 0;
  const shouldShowListResults = browserState.view === 'results' && hasSearched && results.length > 0;

  const toggleBucketEpisode = (episodeNumber) => {
    setBrowserState((current) => {
      const nextBucket = current.bucketEpisodes.includes(episodeNumber)
        ? current.bucketEpisodes.filter((value) => value !== episodeNumber)
        : [...current.bucketEpisodes, episodeNumber].sort((a, b) => a - b);

      return {
        ...current,
        bucketEpisodes: nextBucket,
      };
    });
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

  const returnedBrowserState = useMemo(() => ({
    ...browserState,
    seasons: seasonsList || [],
    episodes: episodesList || [],
  }), [browserState, seasonsList, episodesList]);

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
    browserState: returnedBrowserState,
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
    handleBrowseSeries,
    handleBrowseSeason,
    handleCandidateSelect,
    handleBrowserBack,
    toggleBucketEpisode,
    handleApplyBucket,
    handleSelectEpisode,
    confirmState,
    setConfirmState,
  };
}
