import { useState, useMemo } from 'react';
import { useSearchMetadataQuery } from '@/queries';

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

export function useMatchSearch({ row, t, toast }) {
  const [query, setQuery] = useState(() => getDefaultQuery(row));
  const [mode, setMode] = useState(() => getDefaultType(row));
  const [year, setYear] = useState(() => String(getDefaultYear(row) || ''));
  const [season, setSeason] = useState(() => String(getDefaultSeason(row) || ''));
  const [episode, setEpisode] = useState(() => String(getDefaultEpisode(row) || ''));
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const isSeriesMode = mode === 'tv';

  const { refetch: refetchSearch, isFetching: isSearching } = useSearchMetadataQuery(
    query,
    mode,
    year,
    { enabled: false }
  );

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

  const performSearch = async (resetBrowser, searchMode = mode) => {
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

  return {
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
    setResults,
    hasSearched,
    setHasSearched,
    isSearching,
    isSeriesMode,
    existingCandidates,
    performSearch,
  };
}
