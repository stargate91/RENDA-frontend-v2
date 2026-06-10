import EmptyState from '../../ui/EmptyState';
import Spinner from '../../ui/Spinner';
import MatchCandidateCard from './components/MatchCandidateCard';
import MatchSeasonCard from './components/MatchSeasonCard';
import MatchEpisodeCard from './components/MatchEpisodeCard';
import MatchModalSearchForm from './components/MatchModalSearchForm';
import MatchModalBrowserToolbar from './components/MatchModalBrowserToolbar';
import MatchModalBucket from './components/MatchModalBucket';
import useMatchModalViewModel from './components/useMatchModalViewModel';

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
  } = useMatchModalViewModel({ row, t, toast, onResolved });

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
              {browserState.seasons.map((seasonEntry) => (
                <MatchSeasonCard
                  key={`season-${seasonEntry.season_number}`}
                  seasonEntry={seasonEntry}
                  isBrowserLoading={isBrowserLoading}
                  onSelect={handleBrowseSeason}
                  t={t}
                />
              ))}
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
            <div className="organizer-match-modal__browser-grid organizer-match-modal__browser-grid--episodes">
              {browserState.episodes.map((episodeEntry) => (
                <MatchEpisodeCard
                  key={`episode-${episodeEntry.id || episodeEntry.episode_number}`}
                  episodeEntry={episodeEntry}
                  isBucketed={bucketEpisodeNumbers.includes(episodeEntry.episode_number)}
                  isDisabled={isResolvingId === (browserState.seriesCandidate?.tmdb_id || browserState.seriesCandidate?.id)}
                  onToggle={toggleBucketEpisode}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              variant="simple"
              title={t('organizer.details.matchModal.noEpisodes')}
            />
          )
        ) : null}
      </section>
    </div>
  );
}
