import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft, Check, Eye, Play, Clapperboard, Calendar, Tv, Star } from 'lucide-react';
import IconButton from '@/ui/IconButton';
import Pill from '@/ui/Pill';
import { countEpisodesInNumber, formatEpisodeNumber } from '../../../utils/detailUtils';
import { useMediaDetailContext } from '../MediaDetailContext';
import './SeasonsPanel.css';

const EPISODES_BATCH_SIZE = 20;

export default function SeasonsPanel() {
  const { state, actions, mutations, t } = useMediaDetailContext();
  const { item, cleanId, nextEpisodeInfo } = state;
  const { updateStatusMutation, playMutation, bulkUpdateWatchedMutation } = mutations;

  const seasonsList = item.seasons || [];
  const seasonsCount = seasonsList.length;
  const initialSeasonNumber = nextEpisodeInfo?.seasonNumber ?? seasonsList[0]?.season_number ?? 1;
  const initialExpandedEpisodes = nextEpisodeInfo?.episode?.id
    ? { [nextEpisodeInfo.episode.id]: true }
    : {};
  const initialTargetSeason = seasonsList.find((season) => season.season_number === initialSeasonNumber);
  const initialTargetEpisodeIndex = nextEpisodeInfo?.episode?.id
    ? initialTargetSeason?.episodes?.findIndex((episode) => episode.id === nextEpisodeInfo.episode.id) ?? -1
    : -1;
  const initialVisibleEpisodesCount = initialTargetEpisodeIndex >= 0
    ? Math.max(EPISODES_BATCH_SIZE, initialTargetEpisodeIndex + 1)
    : EPISODES_BATCH_SIZE;

  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(initialSeasonNumber);
  const [expandedEpisodes, setExpandedEpisodes] = useState(initialExpandedEpisodes);
  const [visibleEpisodesCount, setVisibleEpisodesCount] = useState(initialVisibleEpisodesCount);

  const scrollContainerRef = useRef(null);
  const loadMoreTriggerRef = useRef(null);

  // Automatically scroll the selected season card into view without affecting outer scroll containers
  useEffect(() => {
    const activeBtn = scrollContainerRef.current?.querySelector('.season-poster-card.is-active');
    const container = scrollContainerRef.current;
    if (activeBtn && container) {
      const activeRect = activeBtn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // Center the active card inside the carousel container
      const scrollLeftOffset = activeBtn.offsetLeft - (container.clientWidth / 2) + (activeBtn.clientWidth / 2);
      container.scrollTo({
        left: scrollLeftOffset,
        behavior: 'smooth',
      });
    }
  }, [selectedSeasonNumber]);

  useEffect(() => {
    const targetSeason = seasonsList.find((season) => season.season_number === selectedSeasonNumber);
    const targetEpisodeIndex = selectedSeasonNumber === nextEpisodeInfo?.seasonNumber
      ? targetSeason?.episodes?.findIndex((episode) => episode.id === nextEpisodeInfo?.episode?.id) ?? -1
      : -1;

    setVisibleEpisodesCount(
      targetEpisodeIndex >= 0
        ? Math.max(EPISODES_BATCH_SIZE, targetEpisodeIndex + 1)
        : EPISODES_BATCH_SIZE
    );
  }, [nextEpisodeInfo, seasonsList, selectedSeasonNumber]);

  useEffect(() => {
    if (!nextEpisodeInfo?.episode?.id) return;

    setSelectedSeasonNumber(nextEpisodeInfo.seasonNumber);
    setExpandedEpisodes((prev) => ({
      ...prev,
      [nextEpisodeInfo.episode.id]: true,
    }));
  }, [nextEpisodeInfo, seasonsList]);

  const getPosterUrl = (path) => {
    if (!path) return '';
    if (String(path).startsWith('http://') || String(path).startsWith('https://')) return path;
    return `https://image.tmdb.org/t/p/w154${path}`;
  };

  const getStillUrl = (path) => {
    if (!path) return '';
    if (String(path).startsWith('http://') || String(path).startsWith('https://')) return path;
    return `https://image.tmdb.org/t/p/w300${path}`;
  };

  const selectedSeasonIndex = seasonsList.findIndex((s) => s.season_number === selectedSeasonNumber);

  const handlePrevSeason = () => {
    if (selectedSeasonIndex > 0) {
      setSelectedSeasonNumber(seasonsList[selectedSeasonIndex - 1].season_number);
    }
  };

  const handleNextSeason = () => {
    if (selectedSeasonIndex < seasonsCount - 1) {
      setSelectedSeasonNumber(seasonsList[selectedSeasonIndex + 1].season_number);
    }
  };

  const toggleEpisodeOverview = (episodeId) => {
    setExpandedEpisodes((prev) => ({
      ...prev,
      [episodeId]: !prev[episodeId],
    }));
  };

  // Find active season
  const activeSeason = seasonsList.find((s) => s.season_number === selectedSeasonNumber) || seasonsList[0];

  if (!activeSeason) {
    return (
      <div className="seasons-panel__empty">
        {t('library.details.noSeasonsFound') || 'No seasons found.'}
      </div>
    );
  }

  const totalEpisodesCount = activeSeason.episodes
    ? activeSeason.episodes.reduce((sum, ep) => sum + countEpisodesInNumber(ep.episode_number), 0)
    : 0;

  const localEpisodesCount = activeSeason.episodes
    ? activeSeason.episodes.filter(ep => ep.path && !ep.is_missing).reduce((sum, ep) => sum + countEpisodesInNumber(ep.episode_number), 0)
    : 0;

  const isSeasonWatched = activeSeason.episodes
    ? activeSeason.episodes.length > 0 && activeSeason.episodes.every((ep) => ep.is_watched)
    : false;

  const visibleEpisodes = activeSeason.episodes?.slice(0, visibleEpisodesCount) || [];
  const hasMoreEpisodes = visibleEpisodes.length < (activeSeason.episodes?.length || 0);

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger || !hasMoreEpisodes) return undefined;

    const scrollRoot = trigger.closest('.media-detail-page__side-panel-content');
    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (!firstEntry?.isIntersecting) return;

        setVisibleEpisodesCount((prev) => (
          Math.min(prev + EPISODES_BATCH_SIZE, activeSeason.episodes?.length || prev)
        ));
      },
      {
        root: scrollRoot || null,
        rootMargin: '0px 0px 960px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [activeSeason.episodes?.length, hasMoreEpisodes, visibleEpisodes.length]);

  const handleSeasonWatchedToggle = (e) => {
    e.stopPropagation();
    if (!activeSeason.episodes || activeSeason.episodes.length === 0) return;
    const episodeIds = activeSeason.episodes.map((ep) => ep.id);
    bulkUpdateWatchedMutation.mutate({
      itemIds: episodeIds,
      isWatched: !isSeasonWatched,
      seriesId: cleanId,
    });
  };

  return (
    <div className="seasons-panel">
      {/* Title with navigation arrows */}
      <div className="seasons-panel__header">
        <h4 className="details-panel__section-title">
          {t('library.details.seasons') || 'Seasons'}
        </h4>
        <div className="seasons-panel__nav-arrows">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handlePrevSeason}
            disabled={selectedSeasonIndex <= 0}
            className="seasons-panel__nav-arrow-btn"
            title="Previous Season"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleNextSeason}
            disabled={selectedSeasonIndex >= seasonsCount - 1}
            className="seasons-panel__nav-arrow-btn"
            title="Next Season"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Seasons Posters Carousel (no absolute scroll buttons) */}
      <div className="seasons-carousel-wrapper">
        <div className="seasons-carousel" ref={scrollContainerRef}>
          {seasonsList.map((season) => {
            const isActive = season.season_number === selectedSeasonNumber;
            const posterUrl = getPosterUrl(season.poster_path);
            const title = season.title || `Season ${season.season_number}`;

            return (
              <button
                key={season.season_number}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                className={`season-poster-card ${isActive ? 'is-active' : ''}`}
                onClick={() => setSelectedSeasonNumber(season.season_number)}
              >
                <div className="season-poster-card__image-wrapper">
                  {posterUrl ? (
                    <img src={posterUrl} alt={title} className="season-poster-card__image" />
                  ) : (
                    <div className="season-poster-card__placeholder">
                      <Clapperboard size={32} />
                    </div>
                  )}
                </div>
                <span className="season-poster-card__title" title={title}>
                  {title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Season Header / Details */}
      <div className="active-season-info">
        <div className="active-season-info__header">
          <div>
            <h3 className="active-season-info__title">
              {activeSeason.title || `Season ${activeSeason.season_number}`}
            </h3>
            <div className="active-season-info__meta">
              {activeSeason.air_date && (
                <span className="active-season-info__meta-date">
                  <Calendar size={12} />
                  {String(activeSeason.air_date).slice(0, 10)}
                </span>
              )}
              {activeSeason.air_date && totalEpisodesCount > 0 && <span className="active-season-info__meta-spacer" />}
              {totalEpisodesCount > 0 && (
                <span className="active-season-info__meta-episodes">
                  <Tv size={12} />
                  {localEpisodesCount < totalEpisodesCount
                    ? `Available ${localEpisodesCount}/${totalEpisodesCount}`
                    : `${totalEpisodesCount} ${t('library.details.episodes') || 'Episodes'}`}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            className={`season-watch-btn ${isSeasonWatched ? 'season-watch-btn--watched' : ''}`}
            onClick={handleSeasonWatchedToggle}
          >
            <Check size={16} />
            <span>
              {isSeasonWatched
                ? (t('library.details.watched') || 'Watched')
                : (t('library.details.markWatched') || 'Mark Watched')}
            </span>
          </button>
        </div>

        {activeSeason.overview && (
          <p className="active-season-info__overview">{activeSeason.overview}</p>
        )}
      </div>

      {/* Episode Cards List */}
      <div className="episodes-cards-list">
        {visibleEpisodes.map((episode) => {
          const isExpanded = !!expandedEpisodes[episode.id];
          const stillUrl = getStillUrl(episode.still_path);
          const formattedEpNum = formatEpisodeNumber(episode.episode_number);
          const episodeText = `${formattedEpNum.padStart(2, '0')}. ${episode.title || `Episode ${episode.episode_number}`}`;
          const episodeTmdbRating = episode.vote_average ?? episode.rating_tmdb ?? episode.rating;

          // Format metadata tags
          const durationMins = episode.runtime
            ? `${episode.runtime}m`
            : episode.technical?.duration
            ? `${Math.round(episode.technical.duration / 60)}m`
            : '';

          const metaItems = [
            episode.air_date ? String(episode.air_date).slice(0, 10) : null,
            durationMins || null,
            episode.technical?.resolution || null,
            episode.technical?.video_codec || null,
          ].filter(Boolean);

          return (
            <div
              key={episode.id}
              className={`episode-card ${isExpanded ? 'is-expanded' : ''} ${
                episode.is_watched ? 'is-watched' : ''
              } ${!episode.path || episode.is_missing ? 'is-virtual' : ''}`}
              onClick={() => toggleEpisodeOverview(episode.id)}
            >
              {/* Left Side: Still Image */}
              <div className="episode-card__media-column">
                <div className="episode-card__still-wrapper">
                  {stillUrl ? (
                    <img src={stillUrl} alt="" className="episode-card__still" />
                  ) : (
                    <div className="episode-card__still-placeholder">
                      <Clapperboard size={24} />
                    </div>
                  )}
                  {episode.is_watched && (
                    <div className="episode-card__still-watched-overlay">
                      <Check size={16} />
                    </div>
                  )}
                  {episode.path && !episode.is_missing && (
                    <IconButton
                      variant="play-overlay"
                      onClick={(e) => {
                        e.stopPropagation();
                        playMutation.mutate(episode.id);
                      }}
                      title="Play episode"
                    >
                      <Play size={12} fill="currentColor" />
                    </IconButton>
                  )}
                </div>
                {(episodeTmdbRating !== undefined && episodeTmdbRating !== null && episodeTmdbRating !== '') && (
                  <Pill variant="tmdb" className="episode-card__tmdb-pill">
                    <Star size={10} fill="currentColor" strokeWidth={1.8} />
                    {isNaN(parseFloat(episodeTmdbRating))
                      ? episodeTmdbRating
                      : parseFloat(episodeTmdbRating).toFixed(1)}
                  </Pill>
                )}
              </div>

              {/* Center: Info copy */}
              <div className="episode-card__details">
                <h4 className="episode-card__title">{episodeText}</h4>
                
                {metaItems.length > 0 && (
                  <div className="episode-card__meta">
                    {metaItems.map((meta, idx) => (
                      <span key={idx} className="episode-card__meta-item">
                        {meta}
                      </span>
                    ))}
                  </div>
                )}

                {episode.overview && (
                  <p className={`episode-card__overview ${isExpanded ? '' : 'is-truncated'}`}>
                    {episode.overview}
                  </p>
                )}
              </div>

              {/* Right Side: Actions */}
              <div className="episode-card__actions" onClick={(e) => e.stopPropagation()}>
                {isExpanded && (
                  <>
                    {/* Watch toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        updateStatusMutation.mutate({
                          itemId: episode.id,
                          seriesId: cleanId,
                          payload: {
                            is_watched: !episode.is_watched,
                            media_type: 'episode',
                          },
                        })
                      }
                      className={`episode-card__action-btn episode-card__action-btn--watch ${
                        episode.is_watched ? 'is-watched' : ''
                      }`}
                      title={episode.is_watched ? 'Mark unwatched' : 'Mark watched'}
                    >
                      {episode.is_watched ? <Check size={16} /> : <Eye size={16} />}
                    </button>


                  </>
                )}

                {/* Chevron expand toggle */}
                <button
                  type="button"
                  className={`episode-card__action-btn episode-card__action-btn--chevron ${
                    isExpanded ? 'is-expanded' : ''
                  }`}
                  onClick={() => toggleEpisodeOverview(episode.id)}
                  aria-label="Toggle details"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          );
        })}

        {(!activeSeason.episodes || activeSeason.episodes.length === 0) && (
          <div className="episodes-list__empty">
            {t('library.details.noEpisodesFound') || 'No episodes found.'}
          </div>
        )}

        {hasMoreEpisodes && (
          <div ref={loadMoreTriggerRef} className="episodes-list__load-more-trigger" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
