import { useState } from 'react';
import Spinner from '../../ui/Spinner';
import MatchModalSearchForm from './components/MatchModalSearchForm';
import MatchModalBrowserToolbar from './components/MatchModalBrowserToolbar';
import MatchModalBucket from './components/MatchModalBucket';
import MatchModalConfirmDialog from './components/MatchModalConfirmDialog';
import MatchModalResults from './components/MatchModalResults';
import MatchModalBrowser from './components/MatchModalBrowser';
import useMatchModalViewModel from './components/useMatchModalViewModel';
import EmptyState from '../../ui/EmptyState';
import '../../styles/MatchModal.css';

export default function OrganizerMatchModalContent({
  row,
  rows = [],
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
  } = useMatchModalViewModel({ row, rows, t, toast, onResolved });

  const targetRows = rows.length > 0 ? rows : (row ? [row] : []);
  const isBulk = targetRows.length > 1;

  const [dontShowAgain, setDontShowAgain] = useState(false);

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
        isBulk={isBulk}
        t={t}
      />

      <section className="organizer-match-modal__section">
        {isBulk && !hasSearched && browserState.view === 'results' ? (
          <EmptyState
            variant="simple"
            title={t('organizer.details.matchModal.searchRequiredTitle')}
            description={t('organizer.details.matchModal.searchRequiredDesc')}
          />
        ) : (
          <>
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

            {!isBulk ? (
              <MatchModalBucket
                view={browserState.view}
                bucketEpisodeNumbers={bucketEpisodeNumbers}
                onToggle={toggleBucketEpisode}
                t={t}
              />
            ) : null}

            {isBrowserLoading ? (
              <Spinner
                label={t('organizer.details.matchModal.loading')}
              />
            ) : null}

            <MatchModalResults
              results={results}
              visibleResultCandidates={visibleResultCandidates}
              shouldShowPosterResults={shouldShowPosterResults}
              shouldShowListResults={shouldShowListResults}
              mode={mode}
              isResolvingId={isResolvingId}
              isBrowserLoading={isBrowserLoading}
              onCandidateSelect={handleCandidateSelect}
              row={row}
              t={t}
            />

            <MatchModalBrowser
              browserState={browserState}
              isBrowserLoading={isBrowserLoading}
              row={row}
              bucketEpisodeNumbers={bucketEpisodeNumbers}
              isResolvingId={isResolvingId}
              onBrowseSeason={handleBrowseSeason}
              onSelectEpisode={handleSelectEpisode}
              onToggleBucketEpisode={toggleBucketEpisode}
              t={t}
            />
          </>
        )}
      </section>

      <MatchModalConfirmDialog
        confirmState={confirmState}
        dontShowAgain={dontShowAgain}
        setDontShowAgain={setDontShowAgain}
        onCancel={handleCancelConfirm}
        onConfirm={handleConfirmMatch}
        t={t}
      />
    </div>
  );
}
