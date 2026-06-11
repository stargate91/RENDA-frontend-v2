import { useRef, useEffect } from 'react';
import MatchCandidateCard from './MatchCandidateCard';

export default function MatchModalResults({
  results,
  visibleResultCandidates,
  shouldShowPosterResults,
  shouldShowListResults,
  mode,
  isResolvingId,
  isBrowserLoading,
  onCandidateSelect,
  row,
  t,
}) {
  const posterResultsRef = useRef(null);

  useEffect(() => {
    const el = posterResultsRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [shouldShowPosterResults]);

  return (
    <>
      {shouldShowPosterResults ? (
        <div ref={posterResultsRef} className="organizer-match-modal__poster-results">
          {visibleResultCandidates.map((candidate) => (
            <MatchCandidateCard
              key={`existing-${candidate.tmdb_id || candidate.id}`}
              candidate={candidate}
              sourceLabel="existing"
              variant="poster"
              mode={mode}
              isResolvingId={isResolvingId}
              isBrowserLoading={isBrowserLoading}
              onSelect={onCandidateSelect}
              t={t}
              rowStatus={row?.rawStatus}
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
              onSelect={onCandidateSelect}
              t={t}
              rowStatus={row?.rawStatus}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
