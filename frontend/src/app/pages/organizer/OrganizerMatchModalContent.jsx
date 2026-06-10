import { useMemo, useState } from 'react';
import { ArrowLeft, Clapperboard, Search } from 'lucide-react';
import Button from '../../ui/Button';
import IconButton from '../../ui/IconButton';
import MediaCard from '../../ui/MediaCard';
import MetaRow from '../../ui/MetaRow';
import StatusBadge from '../../ui/StatusBadge';
import { fetchJson } from '../../lib/http';

const MATCH_MODES = ['movie', 'tv'];
const TMDB_IMAGE_SIZE_POSTER = 'w154';
const TMDB_IMAGE_SIZE_STILL = 'w300';

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

const getDisplayTitle = (candidate, mediaType) => (
  candidate?.title
  || candidate?.name
  || candidate?.original_title
  || candidate?.original_name
  || (mediaType === 'tv' ? 'Unknown Series' : 'Unknown Movie')
);

const getDisplayYear = (candidate, mediaType) => {
  const rawDate = mediaType === 'tv'
    ? candidate?.first_air_date
    : candidate?.release_date;
  return rawDate ? String(rawDate).slice(0, 4) : null;
};

const getImageUrl = (path, size = TMDB_IMAGE_SIZE_POSTER) => (
  !path ? ''
    : String(path).startsWith('http://') || String(path).startsWith('https://')
      ? path
      : `https://image.tmdb.org/t/p/${size}${path}`
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
  seasons: [],
  selectedSeason: null,
  episodes: [],
  bucketEpisodes: [],
});

export default function OrganizerMatchModalContent({
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
  const [isSearching, setIsSearching] = useState(false);
  const [isResolvingId, setIsResolvingId] = useState(null);
  const [browserState, setBrowserState] = useState(createBrowserState);
  const [isBrowserLoading, setIsBrowserLoading] = useState(false);
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

  const performSearch = async (searchMode = mode) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      toast(t('organizer.toasts.matchSearchMissingQuery'), 'danger');
      return false;
    }

    setIsSearching(true);
    setHasSearched(true);
    resetBrowser();
    try {
      const params = new URLSearchParams({
        query: trimmedQuery,
        item_type: searchMode,
        language: 'en-US',
      });
      if (year.trim()) {
        params.set('year', year.trim());
      }

      const data = await fetchJson(`/api/metadata/search?${params.toString()}`);
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
    } finally {
      setIsSearching(false);
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

  const handleResolve = async (candidate, overrides = {}) => {
    const candidateId = candidate.tmdb_id || candidate.id;
    const effectiveSeason = overrides.season ?? season;
    const effectiveEpisode = overrides.episode ?? episode;

    setIsResolvingId(candidateId);
    try {
      await fetchJson('/api/metadata/resolve', {
        method: 'POST',
        body: JSON.stringify(buildResolvePayload(row, candidate, mode, effectiveSeason, effectiveEpisode)),
      });
      await onResolved();
      toast(t('organizer.toasts.matchResolveSuccess'), 'success');
    } catch (error) {
      toast(error.message || t('organizer.toasts.matchResolveFailed'), 'danger');
    } finally {
      setIsResolvingId(null);
    }
  };

  const handleBrowseSeries = async (candidate) => {
    const candidateId = candidate.tmdb_id || candidate.id;
    setIsBrowserLoading(true);
    try {
      const data = await fetchJson(`/api/metadata/tv/${candidateId}/seasons?language=en-US`);
      setBrowserState({
        view: 'seasons',
        seriesCandidate: candidate,
        seasons: Array.isArray(data?.seasons) ? data.seasons : [],
        selectedSeason: null,
        episodes: [],
        bucketEpisodes: [],
      });
    } catch (error) {
      toast(error.message || t('organizer.toasts.matchSearchFailed'), 'danger');
    } finally {
      setIsBrowserLoading(false);
    }
  };

  const handleBrowseSeason = async (seasonEntry) => {
    const seriesId = browserState.seriesCandidate?.tmdb_id || browserState.seriesCandidate?.id;
    if (!seriesId) {
      return;
    }

    setIsBrowserLoading(true);
    try {
      const data = await fetchJson(
        `/api/metadata/tv/${seriesId}/season/${seasonEntry.season_number}/episodes?language=en-US`,
      );
      setBrowserState((current) => ({
        ...current,
        view: 'episodes',
        selectedSeason: seasonEntry,
        episodes: Array.isArray(data?.episodes) ? data.episodes : [],
        bucketEpisodes: [],
      }));
    } catch (error) {
      toast(error.message || t('organizer.toasts.matchSearchFailed'), 'danger');
    } finally {
      setIsBrowserLoading(false);
    }
  };

  const handleCandidateSelect = async (candidate) => {
    const mediaType = normalizeCandidateType(candidate.type || candidate.media_type || mode);
    if (mediaType === 'tv') {
      await handleBrowseSeries(candidate);
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
          episodes: [],
          bucketEpisodes: [],
        };
      }
      return createBrowserState();
    });
  };

  const browserTitle = browserState.view === 'episodes'
    ? browserState.selectedSeason?.name || `Season ${browserState.selectedSeason?.season_number ?? ''}`.trim()
    : browserState.seriesCandidate
      ? getDisplayTitle(browserState.seriesCandidate, 'tv')
      : '';

  const browserMetaItems = browserState.view === 'episodes'
    ? [
        browserState.selectedSeason?.season_number != null ? `S${browserState.selectedSeason.season_number}` : null,
        browserState.selectedSeason?.episode_count ? `${browserState.selectedSeason.episode_count} eps` : null,
      ]
    : [
        browserState.seasons.length ? `${browserState.seasons.length} seasons` : null,
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

  const renderCandidateCard = (candidate, sourceLabel, variant = 'list') => {
    const mediaType = normalizeCandidateType(candidate.type || candidate.media_type || mode);
    const displayTitle = getDisplayTitle(candidate, mediaType);
    const displayYear = getDisplayYear(candidate, mediaType);
    const candidateId = candidate.tmdb_id || candidate.id;
    const posterUrl = getImageUrl(candidate.poster_path, TMDB_IMAGE_SIZE_POSTER);

    if (variant === 'poster') {
      return (
        <button
          key={`${sourceLabel}-${candidateId}`}
          type="button"
          className={`organizer-match-modal__poster-card${candidate.is_active ? ' is-active' : ''}`.trim()}
          onClick={() => handleCandidateSelect(candidate)}
          disabled={isResolvingId === candidateId || isBrowserLoading}
        >
          <MediaCard className="organizer-match-modal__poster-card-image">
            {posterUrl ? (
              <img src={posterUrl} alt="" className="organizer-match-modal__poster-image" />
            ) : (
              <div className="organizer-match-modal__poster-placeholder">
                <Clapperboard size={18} />
              </div>
            )}
            {candidate.is_active ? (
              <StatusBadge variant="overlay">
                {t('organizer.details.matchModal.current')}
              </StatusBadge>
            ) : null}
          </MediaCard>
          <div className="organizer-match-modal__poster-card-copy">
            <strong className="organizer-match-modal__poster-card-title">{displayTitle}</strong>
            <MetaRow
              className="organizer-match-modal__poster-card-meta"
              items={[
                displayYear,
                mediaType === 'tv' ? t('organizer.details.matchModal.series') : t('organizer.details.matchModal.movie'),
              ]}
            />
          </div>
        </button>
      );
    }

    return (
      <button
        key={`${sourceLabel}-${candidateId}`}
        type="button"
        className={`organizer-match-modal__result-card${candidate.is_active ? ' is-active' : ''}`.trim()}
        onClick={() => handleCandidateSelect(candidate)}
        disabled={isResolvingId === candidateId || isBrowserLoading}
      >
        <div className="organizer-match-modal__poster">
          {posterUrl ? (
            <img src={posterUrl} alt="" className="organizer-match-modal__poster-image" />
          ) : (
            <div className="organizer-match-modal__poster-placeholder">
              <Clapperboard size={18} />
            </div>
          )}
        </div>
        <div className="organizer-match-modal__result-copy">
          <div className="organizer-match-modal__result-topline">
            <strong className="organizer-match-modal__result-title">{displayTitle}</strong>
            {candidate.is_active ? (
              <StatusBadge>
                {t('organizer.details.matchModal.current')}
              </StatusBadge>
            ) : null}
          </div>
          <MetaRow
            className="organizer-match-modal__result-meta"
            items={[
              mediaType === 'tv' ? t('organizer.details.matchModal.series') : t('organizer.details.matchModal.movie'),
              displayYear,
            ]}
          />
          {candidate.overview ? (
            <p className="organizer-match-modal__result-overview">{candidate.overview}</p>
          ) : null}
          <span className="organizer-match-modal__result-action">
            {mediaType === 'tv'
              ? t('organizer.details.matchModal.browseSeasons')
              : isResolvingId === candidateId
                ? t('organizer.details.matchModal.applying')
                : t('organizer.details.matchModal.useMatch')}
          </span>
        </div>
      </button>
    );
  };

  const renderSeasonCard = (seasonEntry) => {
    const posterUrl = getImageUrl(seasonEntry.poster_path, TMDB_IMAGE_SIZE_POSTER);
    return (
      <button
        key={`season-${seasonEntry.season_number}`}
        type="button"
        className="organizer-match-modal__browser-card"
        onClick={() => handleBrowseSeason(seasonEntry)}
        disabled={isBrowserLoading}
      >
        <MediaCard className="organizer-match-modal__browser-card-image organizer-match-modal__browser-card-image--poster">
          {posterUrl ? (
            <img src={posterUrl} alt="" className="organizer-match-modal__poster-image" />
          ) : (
            <div className="organizer-match-modal__poster-placeholder">
              <Clapperboard size={18} />
            </div>
          )}
        </MediaCard>
        <div className="organizer-match-modal__browser-card-copy">
          <strong className="organizer-match-modal__browser-card-title">
            {seasonEntry.name || `Season ${seasonEntry.season_number}`}
          </strong>
          <MetaRow
            className="organizer-match-modal__browser-card-meta"
            items={[
              `S${seasonEntry.season_number}`,
              seasonEntry.episode_count ? `${seasonEntry.episode_count} eps` : null,
            ]}
          />
        </div>
      </button>
    );
  };

  const renderEpisodeCard = (episodeEntry) => {
    const stillUrl = getImageUrl(episodeEntry.still_path, TMDB_IMAGE_SIZE_STILL);
    const isBucketed = bucketEpisodeNumbers.includes(episodeEntry.episode_number);
    return (
      <button
        key={`episode-${episodeEntry.id || episodeEntry.episode_number}`}
        type="button"
        className={`organizer-match-modal__browser-card organizer-match-modal__browser-card--episode${isBucketed ? ' is-selected' : ''}`.trim()}
        onClick={() => toggleBucketEpisode(episodeEntry.episode_number)}
        disabled={isResolvingId === (browserState.seriesCandidate?.tmdb_id || browserState.seriesCandidate?.id)}
      >
        <MediaCard className="organizer-match-modal__browser-card-image organizer-match-modal__browser-card-image--still">
          {stillUrl ? (
            <img src={stillUrl} alt="" className="organizer-match-modal__poster-image" />
          ) : (
            <div className="organizer-match-modal__poster-placeholder">
              <Clapperboard size={18} />
            </div>
          )}
        </MediaCard>
        <div className="organizer-match-modal__browser-card-copy">
          <strong className="organizer-match-modal__browser-card-title">
            {episodeEntry.name || `Episode ${episodeEntry.episode_number}`}
          </strong>
          <MetaRow
            className="organizer-match-modal__browser-card-meta"
            items={[
              `E${episodeEntry.episode_number}`,
              episodeEntry.air_date ? String(episodeEntry.air_date).slice(0, 10) : null,
            ]}
          />
          <span className="organizer-match-modal__result-action">
            {isBucketed
              ? t('organizer.details.matchModal.removeFromBucket')
              : t('organizer.details.matchModal.addToBucket')}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="organizer-match-modal">
      <form className="organizer-match-modal__search" onSubmit={handleSearch}>
        <div className="organizer-match-modal__search-layout">
          <div
            className={`organizer-match-modal__search-grid${isSeriesMode ? ' is-series' : ' is-movie'}`}
          >
            <label
              className="ui-field organizer-match-modal__field organizer-match-modal__field--query"
            >
              <input
                className="ui-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('organizer.details.matchModal.queryPlaceholder')}
                aria-label={t('organizer.details.matchModal.query')}
              />
            </label>
            <label className="ui-field organizer-match-modal__field organizer-match-modal__field--year">
              <input
                className="ui-input"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                placeholder={t('organizer.details.matchModal.year')}
                aria-label={t('organizer.details.matchModal.year')}
                inputMode="numeric"
              />
            </label>
            {isSeriesMode ? (
              <label className="ui-field organizer-match-modal__field organizer-match-modal__field--compact">
                <input
                  className="ui-input"
                  value={season}
                  onChange={(event) => setSeason(event.target.value)}
                  placeholder={t('organizer.details.matchModal.seasonShort')}
                  aria-label={t('organizer.details.matchModal.seasonShort')}
                  inputMode="numeric"
                />
              </label>
            ) : null}
            {isSeriesMode ? (
              <label className="ui-field organizer-match-modal__field organizer-match-modal__field--compact">
                <input
                  className="ui-input"
                  value={episode}
                  onChange={(event) => setEpisode(event.target.value)}
                  placeholder={t('organizer.details.matchModal.episodeShort')}
                  aria-label={t('organizer.details.matchModal.episodeShort')}
                  inputMode="numeric"
                />
              </label>
            ) : null}
          </div>
          <div className="organizer-match-modal__search-actions">
            <IconButton
              type="submit"
              variant="secondary"
              className="organizer-match-modal__search-button"
              disabled={isSearching}
              label={isSearching ? t('organizer.details.matchModal.searching') : t('organizer.details.matchModal.search')}
            >
              <Search size={15} />
            </IconButton>
          </div>
          <div className="organizer-match-modal__mode-toggle" role="tablist" aria-label={t('organizer.details.matchModal.type')}>
            {MATCH_MODES.map((matchMode) => {
              const isActive = mode === matchMode;
              return (
                <button
                  key={matchMode}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`organizer-match-modal__mode-option${isActive ? ' is-active' : ''}`.trim()}
                  onClick={() => handleModeChange(matchMode)}
                >
                  {matchMode === 'tv' ? t('organizer.details.matchModal.series') : t('organizer.details.matchModal.movie')}
                </button>
              );
            })}
          </div>
        </div>
      </form>

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

        {browserState.view !== 'results' ? (
          <div className="organizer-match-modal__browser-toolbar">
            <button
              type="button"
              className="organizer-match-modal__browser-back"
              onClick={handleBrowserBack}
            >
              <ArrowLeft size={14} />
              {t('organizer.details.matchModal.back')}
            </button>
            <div className="organizer-match-modal__browser-copy">
              <strong className="organizer-match-modal__browser-title">{browserTitle}</strong>
              <MetaRow className="organizer-match-modal__browser-meta" items={browserMetaItems} />
            </div>
            {browserState.view === 'seasons' ? (
              <Button
                type="button"
                variant="secondary-neutral"
                size="sm"
                onClick={() => handleResolve(browserState.seriesCandidate)}
              >
                {t('organizer.details.matchModal.useSeries')}
              </Button>
            ) : null}
            {browserState.view === 'episodes' ? (
              <div className="organizer-match-modal__browser-actions">
                <Button
                  type="button"
                  variant="secondary-neutral"
                  size="sm"
                  onClick={() => handleResolve(browserState.seriesCandidate, {
                    season: browserState.selectedSeason?.season_number,
                    episode: null,
                  })}
                >
                  {t('organizer.details.matchModal.useSeason')}
                </Button>
                <Button
                  type="button"
                  variant="secondary-neutral"
                  size="sm"
                  disabled={bucketEpisodeNumbers.length === 0}
                  onClick={handleApplyBucket}
                >
                  {t('organizer.details.matchModal.useBucket')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {browserState.view === 'episodes' && bucketEpisodeNumbers.length > 0 ? (
          <div className="organizer-match-modal__bucket">
            <strong className="organizer-match-modal__bucket-title">
              {t('organizer.details.matchModal.bucketTitle')}
            </strong>
            <div className="organizer-match-modal__bucket-items">
              {bucketEpisodeNumbers.map((episodeNumber) => (
                <button
                  key={`bucket-${episodeNumber}`}
                  type="button"
                  className="organizer-match-modal__bucket-chip"
                  onClick={() => toggleBucketEpisode(episodeNumber)}
                >
                  {`E${episodeNumber}`}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isBrowserLoading ? (
          <div className="organizer-match-modal__empty">
            {t('organizer.details.matchModal.loading')}
          </div>
        ) : null}

        {browserState.view === 'results' && hasSearched && results.length === 0 && !isSearching ? (
          <div className="organizer-match-modal__empty">
            {t('organizer.details.matchModal.noResults')}
          </div>
        ) : null}

        {shouldShowPosterResults ? (
          <div className="organizer-match-modal__poster-results">
            {visibleResultCandidates.map((candidate) => renderCandidateCard(candidate, 'existing', 'poster'))}
          </div>
        ) : null}

        {shouldShowListResults ? (
          <div className="organizer-match-modal__results">
            {results.map((candidate) => renderCandidateCard(candidate, 'search'))}
          </div>
        ) : null}

        {browserState.view === 'seasons' && !isBrowserLoading ? (
          browserState.seasons.length > 0 ? (
            <div className="organizer-match-modal__browser-grid organizer-match-modal__browser-grid--seasons">
              {browserState.seasons.map(renderSeasonCard)}
            </div>
          ) : (
            <div className="organizer-match-modal__empty">
              {t('organizer.details.matchModal.noSeasons')}
            </div>
          )
        ) : null}

        {browserState.view === 'episodes' && !isBrowserLoading ? (
          browserState.episodes.length > 0 ? (
            <div className="organizer-match-modal__browser-grid organizer-match-modal__browser-grid--episodes">
              {browserState.episodes.map(renderEpisodeCard)}
            </div>
          ) : (
            <div className="organizer-match-modal__empty">
              {t('organizer.details.matchModal.noEpisodes')}
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}
