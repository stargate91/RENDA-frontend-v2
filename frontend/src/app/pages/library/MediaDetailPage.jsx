import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Page from '@/ui/Page';
import NavButton from '@/ui/NavButton';
import Pill from '@/ui/Pill';
import Button from '@/ui/Button';
import {
  Calendar, Clock, Star, Play, Check, Video, Eye, EyeOff, FolderOpen,
  Users, Info, Tv, Film, ChevronRight, ChevronDown, PenLine, History, Tag, Cpu, Link2,
  Image as ImageIcon
} from 'lucide-react';
import { useTranslation } from '@/providers/LanguageContext';
import { useUi } from '@/providers/UiProvider';
import { useLibraryItemDetailQuery, useLibrarySeriesDetailQuery, useFullMetadataQuery } from '@/queries/metadataQueries';
import {
  useUpdateMediaStatusMutation, usePlayMediaMutation,
  useBulkUpdateWatchedMutation, useOverrideBackdropMutation
} from '@/queries/mediaQueries';
import { useAllTagsQuery, useCreateTagMutation } from '@/queries/libraryQueries';
import { useSettingsQuery } from '@/queries/settingsQueries';
import { API_BASE } from '@/lib/backend';
import { showItemInFolder } from '@/lib/ipc';
import UtilityBarPortal from '../../../components/UtilityBarPortal';
import './MediaDetailPage.css';

const SOURCE_LABELS = {
  bluray: 'Blu-Ray',
  web: 'WEB-DL',
  dvd: 'DVD',
  tv: 'TV HDTV',
  cam: 'CAM'
};

const EDITION_LABELS = {
  theatrical: 'Theatrical Edition',
  directors_cut: "Director's Cut",
  extended: 'Extended Edition',
  unrated: 'Unrated',
  remastered: 'Remastered',
  special: 'Special Edition',
  ultimate: 'Ultimate',
  collectors_edition: "Collector's Edition",
  fan_edit: 'Fan Edit'
};

const AUDIO_TYPE_LABELS = {
  mono: 'Mono',
  stereo: 'Stereo',
  surround: 'Surround Sound',
  dual_audio: 'Dual Audio',
  multi_audio: 'Multi Audio'
};

const getDurationText = (seconds, t) => {
  if (!seconds) return '';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    if (minutes > 0) {
      return t('library.details.durationHoursMinutes', { hours, minutes, defaultValue: '{{hours}}h {{minutes}}m' });
    }
    return t('library.details.durationHours', { hours, count: hours, defaultValue: '{{hours}}h' });
  }
  return t('library.details.durationMinutes', { minutes, count: minutes, defaultValue: '{{minutes}}m' });
};

const formatEpisodeNumber = (epNum) => {
  if (epNum === undefined || epNum === null) return '';
  const str = String(epNum).trim();

  if (str.includes(',')) {
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      return `${parts[0]}-${parts[parts.length - 1]}`;
    }
  }

  if (str.includes('-')) {
    return str.split('-').map(s => s.trim()).filter(Boolean).join('-');
  }

  return str;
};

const formatTime = (secs) => {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  return [h > 0 ? h : null, m, s]
    .filter(x => x !== null)
    .map(x => String(x).padStart(2, '0'))
    .join(':');
};

const countEpisodesInNumber = (epNum) => {
  if (epNum === undefined || epNum === null) return 1;
  const str = String(epNum).trim();
  if (!str) return 1;

  if (str.includes(',')) {
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts.length : 1;
  }

  if (str.includes('-')) {
    const parts = str.split('-').map(s => s.trim()).filter(Boolean);
    if (parts.length === 2) {
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        return end - start + 1;
      }
    }
  }

  return 1;
};

export default function MediaDetailPage({ type = 'movie' }) {
  const { id } = useParams();
  const cleanId = id?.startsWith('series_') ? id.replace('series_', '') : id;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { openModal, closeModal, toast } = useUi();

  const [hoveredRating, setHoveredRating] = useState(null);
  const updateStatusMutation = useUpdateMediaStatusMutation();
  const overrideBackdropMutation = useOverrideBackdropMutation();

  const [isTruncated, setIsTruncated] = useState(false);
  const overviewRef = useRef(null);

  const isMovie = type === 'movie';
  const { data: movieDetail, isLoading: isMovieLoading } = useLibraryItemDetailQuery(cleanId, { enabled: isMovie });
  const { data: seriesDetail, isLoading: isSeriesLoading } = useLibrarySeriesDetailQuery(cleanId, { enabled: !isMovie });
  const item = isMovie ? movieDetail : seriesDetail;
  const isLoading = isMovie ? isMovieLoading : isSeriesLoading;
  const { data: settings } = useSettingsQuery();

  const playMutation = usePlayMediaMutation();
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [newTagError, setNewTagError] = useState('');
  const { data: allTags = [] } = useAllTagsQuery(item?.is_adult);
  const createTagMutation = useCreateTagMutation();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [activePanel, setActivePanel] = useState(null);
  const { data: fullMetadata } = useFullMetadataQuery(id, { enabled: activePanel === 'backdrops' });
  const [expandedSeasons, setExpandedSeasons] = useState({ 1: true });
  const [isSideNavVisible, setIsSideNavVisible] = useState(true);
  const [isWatchLogsExpanded, setIsWatchLogsExpanded] = useState(false);

  const togglePanel = (panelName) => {
    setActivePanel(prev => prev === panelName ? null : panelName);
  };

  const handleToggleSideNav = () => {
    setIsSideNavVisible(prev => {
      const next = !prev;
      if (!next) {
        setActivePanel(null);
      }
      return next;
    });
  };

  const toggleSeason = (seasonNum) => {
    setExpandedSeasons(prev => ({
      ...prev,
      [seasonNum]: !prev[seasonNum]
    }));
  };

  const renderPanelContent = () => {
    if (!item) return null;

    if (activePanel === 'seasons') {
      return (
        <div className="seasons-panel">
          <div className="seasons-panel__list">
            {item.seasons?.map(season => {
              const isExpanded = expandedSeasons[season.season_number];
              return (
                <div
                  key={season.season_number}
                  className="season-section season-section--custom"
                >
                  {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                  <div
                    className="season-header season-header--custom"
                    onClick={() => toggleSeason(season.season_number)}
                  >
                    <span className="season-header__title">
                      {season.title || `Season ${season.season_number}`}
                    </span>
                    <div className="season-header__meta">
                      <span className="season-header__episode-count">
                        {season.episodes ? season.episodes.reduce((sum, ep) => sum + countEpisodesInNumber(ep.episode_number), 0) : 0} {t('library.details.episodes') || 'Episodes'}
                      </span>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="episodes-list episodes-list--custom">
                      {season.episodes?.map(episode => {
                        const episodeText = `${formatEpisodeNumber(episode.episode_number)}. ${episode.title}`;
                        const techSpecsText = episode.technical?.resolution
                          ? `${episode.technical.resolution} • ${episode.technical.video_codec} • ${episode.technical.audio_codec}`
                          : '';

                        return (
                          <div
                            key={episode.id}
                            className="episode-item episode-item--custom"
                          >
                            <div className="episode-item__header">
                              <span className="episode-item__title">
                                {episodeText}
                              </span>
                              <div className="episode-item__actions">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateStatusMutation.mutate({
                                      itemId: episode.id,
                                      payload: {
                                        is_watched: !episode.is_watched,
                                        media_type: 'episode'
                                      }
                                    });
                                  }}
                                  className={`episode-item__watch-btn${episode.is_watched ? ' episode-item__watch-btn--watched' : ''}`}
                                >
                                  {episode.is_watched ? <Check size={16} /> : <Eye size={16} />}
                                </button>

                                {episode.path && !episode.is_missing ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      playMutation.mutate(episode.id);
                                    }}
                                    className="episode-item__play-btn"
                                  >
                                    <Play size={10} fill="currentColor" />
                                  </button>
                                ) : (
                                  <span
                                    title={t('library.details.virtualMissing') || 'Virtual / Missing'}
                                    className="episode-item__virtual-badge"
                                  >
                                    {t('library.details.virtual') || 'Virtual'}
                                  </span>
                                )}
                              </div>
                            </div>
                            {episode.overview && (
                              <p className="episode-item__overview">
                                {episode.overview}
                              </p>
                            )}
                            {episode.technical?.resolution && (
                              <span className="episode-item__tech-meta">
                                {techSpecsText}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {(!season.episodes || season.episodes.length === 0) && (
                        <div className="episodes-list__empty">
                          {t('library.details.noEpisodesFound') || 'No episodes found.'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (activePanel === 'cast') {
      const isAdult = item.is_adult;
      const genderPref = settings?.adult_gender_preference; // 'all', 'female', 'male'

      const filterPeople = (list) => {
        if (!list) return [];
        if (!isAdult || !genderPref || genderPref === 'all') return list;
        return list.filter(person => {
          if (genderPref === 'female') return person.gender === 1;
          if (genderPref === 'male') return person.gender === 2;
          return true;
        });
      };

      const filteredDirectors = filterPeople(item.directors);
      const filteredWriters = filterPeople(item.writers);
      const filteredCast = filterPeople(item.cast);

      return (
        <div className="cast-panel">
          {filteredDirectors && filteredDirectors.length > 0 && (
            <div>
              <h4 className="cast-panel__title">
                {t('library.details.directors') || 'Directors / Creators'}
              </h4>
              <div className="cast-panel__list">
                {filteredDirectors.map(director => {
                  return (
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                    <div
                      key={director.id}
                      className="person-card"
                      onClick={() => navigate(`/people/${director.id}`)}
                    >
                      {director.profile_path ? (
                        <img
                          src={`${API_BASE}/media/images/persons/${director.profile_path}`}
                          alt={director.name}
                          className="person-card__avatar"
                        />
                      ) : (
                        <div className="person-card__avatar-fallback">
                          <Users size={16} />
                        </div>
                      )}
                      <div className="person-card__info">
                        <span className="person-card__name">{director.name}</span>
                        <span className="person-card__role">
                          {t(`library.people.roles.${String(director.job || 'director').toLowerCase()}`, director.job || 'Director')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {filteredWriters && filteredWriters.length > 0 && (
            <div>
              <h4 className="cast-panel__title">
                {t('library.details.writers') || 'Writers / Creators'}
              </h4>
              <div className="cast-panel__list">
                {filteredWriters.map(writer => {
                  return (
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                    <div
                      key={writer.id}
                      className="person-card"
                      onClick={() => navigate(`/people/${writer.id}`)}
                    >
                      {writer.profile_path ? (
                        <img
                          src={`${API_BASE}/media/images/persons/${writer.profile_path}`}
                          alt={writer.name}
                          className="person-card__avatar"
                        />
                      ) : (
                        <div className="person-card__avatar-fallback">
                          <Users size={16} />
                        </div>
                      )}
                      <div className="person-card__info">
                        <span className="person-card__name">{writer.name}</span>
                        <span className="person-card__role">
                          {t(`library.people.roles.${String(writer.job || 'writer').toLowerCase()}`, writer.job || 'Writer')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {filteredCast && filteredCast.length > 0 && (
            <div>
              <h4 className="cast-panel__title">
                {t('library.details.actors') || 'Actors'}
              </h4>
              <div className="cast-panel__list cast-panel__list--actors">
                {filteredCast.map(actor => {
                  return (
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                    <div
                      key={actor.id}
                      className="person-card"
                      onClick={() => navigate(`/people/${actor.id}`)}
                    >
                      {actor.profile_path ? (
                        <img
                          src={`${API_BASE}/media/images/persons/${actor.profile_path}`}
                          alt={actor.name}
                          className="person-card__avatar person-card__avatar--actor"
                        />
                      ) : (
                        <div className="person-card__avatar-fallback person-card__avatar-fallback--actor">
                          <Users size={18} />
                        </div>
                      )}
                      <div className="person-card__info">
                        <span className="person-card__name">{actor.name}</span>
                        <span className="person-card__role">
                          {actor.character || t('library.people.roles.actor') || 'Actor'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activePanel === 'details') {
      const tmdbId = item?.tmdb_id || item?.series_tmdb_id;
      const imdbId = item?.imdb_id;
      const hasImdb = item?.rating_imdb != null;
      const hasTmdb = item?.rating_tmdb != null;
      const hasRotten = item?.rating_rotten != null && item?.rating_rotten !== '';
      const hasMeta = item?.rating_meta != null;

      const audioCodecText = item?.technical?.audio_codec
        ? `${item.technical.audio_codec.toUpperCase()} (${item.technical.audio_channels}ch)`
        : '';
      const bitDepthText = item?.technical?.bit_depth
        ? `${item.technical.bit_depth}-bit`
        : '';
      const framerateText = item?.technical?.framerate
        ? `${parseFloat(item.technical.framerate).toFixed(3)} fps`
        : '';

      const ratings = [];
      if (hasImdb) {
        ratings.push({
          id: 'imdb',
          logo: '/rating/imdb.png',
          alt: 'IMDb',
          value: `${item.rating_imdb.toFixed(1)}/10`
        });
      }
      if (hasTmdb) {
        ratings.push({
          id: 'tmdb',
          logo: '/rating/tmdb.png',
          alt: 'TMDb',
          value: `${item.rating_tmdb.toFixed(1)}/10`
        });
      }
      if (hasRotten) {
        ratings.push({
          id: 'rotten',
          logo: '/rating/rottan_tomatoes.png',
          alt: 'Rotten Tomatoes',
          value: item.rating_rotten
        });
      }
      if (hasMeta) {
        ratings.push({
          id: 'meta',
          logo: '/rating/metacritic.png',
          alt: 'Metacritic',
          value: `${item.rating_meta}/100`
        });
      }

      const bytesToSize = (bytes) => {
        if (!bytes) return '';
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
        if (i === 0) return `${bytes} ${sizes[i]}`;
        return `${(bytes / (1024 ** i)).toFixed(2)} ${sizes[i]}`;
      };

      const formatCurrency = (num) => {
        if (num === undefined || num === null || num === 0) return '-';
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0
        }).format(num);
      };

      const hasBoxOffice = !!((item.budget && item.budget > 0) || (item.revenue && item.revenue > 0));

      const companies = item.companies || [];
      const networks = item.networks || [];
      const itemsToShow = networks.length > 0 ? networks : companies;
      const blockTitle = networks.length > 0 ? 'Platforms & Networks' : 'Production Companies';

      const nonSpecialSeasons = !isMovie && Array.isArray(item?.seasons)
        ? item.seasons.filter(s => s.season_number !== 0)
        : [];
      const seasonCount = nonSpecialSeasons.length;
      const episodeCount = nonSpecialSeasons.reduce((acc, s) => {
        if (s.episodes && s.episodes.length > 0) {
          return acc + s.episodes.reduce((sum, ep) => sum + countEpisodesInNumber(ep.episode_number), 0);
        }
        return acc + 0;
      }, 0);
      const seriesStatus = item?.release_status;

      return (
        <div className="details-panel details-panel--custom">
          {ratings.length > 0 ? (
            <div>
              <h4 className="details-panel__ratings-title">
                {t('library.details.ratingsSection') || 'Ratings'}
              </h4>
              <div className="ratings-container">
                {ratings.map((rating, idx) => {
                  const isLast = idx === ratings.length - 1;
                  const isOddTotal = ratings.length % 2 !== 0;
                  const isSpan2 = (isLast && isOddTotal);

                  return (
                    <div
                      key={rating.id}
                      className={`rating-card${isSpan2 ? ' rating-card--span-2' : ''}`}
                    >
                      <img src={rating.logo} alt={rating.alt} className="rating-card__logo" />
                      <span className="rating-card__value">
                        {rating.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="details-panel__no-ratings">
              {t('library.details.noRatingsAvailable') || 'No ratings available.'}
            </div>
          )}

          {!isMovie && (
            <div className="details-panel__section">
              <h4 className="details-panel__section-title">
                {t('library.details.seriesInfo') || 'Series Info'}
              </h4>
              <div className="specs-grid">
                <div className="specs-card specs-card--tall">
                  <span className="specs-card__label">{t('library.details.seasons') || 'Seasons'}</span>
                  <span className="specs-card__value" title={seasonCount}>{seasonCount}</span>
                </div>
                <div className="specs-card specs-card--tall">
                  <span className="specs-card__label">{t('library.details.episodes') || 'Episodes'}</span>
                  <span className="specs-card__value" title={episodeCount}>{episodeCount}</span>
                </div>
                {seriesStatus && (
                  <div className="specs-card specs-card--tall specs-card--span-2">
                    <span className="specs-card__label">{t('library.details.status') || 'Status'}</span>
                    <span className="specs-card__value" title={seriesStatus}>{seriesStatus}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {hasBoxOffice && (
            <div className="details-panel__section">
              <h4 className="details-panel__section-title">
                {t('library.details.boxOffice') || 'Box Office'}
              </h4>
              <div className="specs-grid">
                {item.budget > 0 && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.budget') || 'Budget'}</span>
                    <span className="specs-card__value" title={formatCurrency(item.budget)}>
                      {formatCurrency(item.budget)}
                    </span>
                  </div>
                )}
                {item.revenue > 0 && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.revenue') || 'Revenue'}</span>
                    <span className="specs-card__value" title={formatCurrency(item.revenue)}>
                      {formatCurrency(item.revenue)}
                    </span>
                  </div>
                )}
                {item.budget > 0 && item.revenue > 0 && (
                  <div className="specs-card specs-card--span-2">
                    <span className="specs-card__label">{t('library.details.profit') || 'Profit'}</span>
                    <span
                      className={`specs-card__value ${(item.revenue - item.budget) >= 0 ? 'specs-card__value--success' : 'specs-card__value--danger'}`}
                      title={formatCurrency(item.revenue - item.budget)}
                    >
                      {formatCurrency(item.revenue - item.budget)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {itemsToShow.length > 0 && (
            <div>
              <h4 className="details-panel__section-title">
                {blockTitle}
              </h4>
              <div className="companies-networks-container">
                {itemsToShow.map((it, idx) => {
                  const logoUrl = it.logo_path
                    ? (it.logo_path.startsWith('http') || it.logo_path.startsWith('/media/') || it.logo_path.startsWith('data/'))
                      ? it.logo_path
                      : `https://image.tmdb.org/t/p/w154${it.logo_path}`
                    : null;
                  return (
                    <div
                      key={idx}
                      className="specs-card specs-card--company"
                      title={it.name}
                    >
                      {logoUrl && (
                        <img
                          src={logoUrl}
                          alt={it.name}
                          className="specs-card__company-logo"
                        />
                      )}
                      {!logoUrl && (
                        <span className="specs-card__company-text">
                          {it.name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(imdbId || tmdbId) && (
            <div className="details-panel__section">
              <h4 className="details-panel__section-title">
                {t('library.details.externalLinks') || 'External Links'}
              </h4>
              <div className="external-links-container" style={{ display: 'flex', gap: '12px' }}>
                {imdbId && (
                  <a
                    href={`https://www.imdb.com/title/${imdbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="external-link-btn external-link-btn--imdb"
                  >
                    {t('library.details.imdb') || 'IMDb'}
                  </a>
                )}
                {tmdbId && (
                  <a
                    href={`https://www.themoviedb.org/${isMovie ? 'movie' : 'tv'}/${tmdbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="external-link-btn external-link-btn--tmdb"
                  >
                    {t('library.details.tmdb') || 'TMDb'}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activePanel === 'technical') {
      const audioCodecText = item?.technical?.audio_codec
        ? `${item.technical.audio_codec.toUpperCase()} (${item.technical.audio_channels}ch)`
        : '';
      const bitDepthText = item?.technical?.bit_depth
        ? `${item.technical.bit_depth}-bit`
        : '';
      const framerateText = item?.technical?.framerate
        ? `${parseFloat(item.technical.framerate).toFixed(3)} fps`
        : '';
      const bytesToSize = (bytes) => {
        if (!bytes) return '';
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
        if (i === 0) return `${bytes} ${sizes[i]}`;
        return `${(bytes / (1024 ** i)).toFixed(2)} ${sizes[i]}`;
      };
      const hasEditionSource = isMovie && (
        (item.technical?.edition && item.technical.edition !== 'none')
        || (item.technical?.source && item.technical.source !== 'none')
        || (item.technical?.audio_type && item.technical.audio_type !== 'none')
      );
      const hasSpecs = !!item?.technical;

      return (
        <div className="details-panel details-panel--custom">
          {hasEditionSource && (
            <div className="details-panel__section">
              <h4 className="details-panel__section-title">
                {t('library.details.editionAndSource') || 'Edition & Source'}
              </h4>
              <div className="specs-grid">
                {item.technical?.edition && item.technical.edition !== 'none' && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.edition') || 'Edition'}</span>
                    <span className="specs-card__value" title={EDITION_LABELS[item.technical.edition] || item.technical.edition}>
                      {EDITION_LABELS[item.technical.edition] || item.technical.edition}
                    </span>
                  </div>
                )}
                {item.technical?.source && item.technical.source !== 'none' && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.source') || 'Source'}</span>
                    <span className="specs-card__value" title={SOURCE_LABELS[item.technical.source] || item.technical.source}>
                      {SOURCE_LABELS[item.technical.source] || item.technical.source}
                    </span>
                  </div>
                )}
                {item.technical?.audio_type && item.technical.audio_type !== 'none' && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.audioStyle') || 'Audio Style'}</span>
                    <span className="specs-card__value" title={AUDIO_TYPE_LABELS[item.technical.audio_type] || item.technical.audio_type}>
                      {AUDIO_TYPE_LABELS[item.technical.audio_type] || item.technical.audio_type}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {hasSpecs ? (
            <div className="details-panel__section">
              <h4 className="details-panel__section-title">
                {t('library.details.technicalInfo') || 'Technical Info'}
              </h4>
              <div className="specs-grid">
                {item.technical.resolution && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.resolution') || 'Resolution'}</span>
                    <span className="specs-card__value" title={item.technical.resolution}>{item.technical.resolution}</span>
                  </div>
                )}
                {item.technical.video_codec && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.videoCodec') || 'Video Codec'}</span>
                    <span className="specs-card__value" title={item.technical.video_codec.toUpperCase()}>{item.technical.video_codec.toUpperCase()}</span>
                  </div>
                )}
                {item.technical.audio_codec && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.audioCodec') || 'Audio Codec'}</span>
                    <span className="specs-card__value" title={audioCodecText}>{audioCodecText}</span>
                  </div>
                )}
                {item.technical.duration && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.duration') || 'Duration'}</span>
                    <span className="specs-card__value" title={formatTime(item.technical.duration)}>{formatTime(item.technical.duration)}</span>
                  </div>
                )}
                {item.technical.size_bytes && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.fileSize') || 'File Size'}</span>
                    <span className="specs-card__value" title={bytesToSize(item.technical.size_bytes)}>{bytesToSize(item.technical.size_bytes)}</span>
                  </div>
                )}
                {item.technical.hdr_type && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.hdr') || 'HDR'}</span>
                    <span className="specs-card__value" title={item.technical.hdr_type}>{item.technical.hdr_type}</span>
                  </div>
                )}
                {item.technical.bit_depth && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.bitDepth') || 'Bit Depth'}</span>
                    <span className="specs-card__value" title={bitDepthText}>{bitDepthText}</span>
                  </div>
                )}
                {item.technical.framerate && (
                  <div className="specs-card">
                    <span className="specs-card__label">{t('library.details.framerate') || 'Framerate'}</span>
                    <span className="specs-card__value" title={framerateText}>{framerateText}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="details-panel__no-ratings">
              {t('library.details.noTechnicalInfo') || 'No technical info available.'}
            </div>
          )}
        </div>
      );
    }

    if (activePanel === 'extras') {
      const formatExtraValue = (value) => String(value || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
      const extras = item.extras || [];
      const extraGroups = isMovie
        ? [{ label: null, items: extras }]
        : extras.reduce((groups, extra) => {
          const label = extra.parent_label || t('library.details.extras') || 'Extras';
          const existingGroup = groups.find((group) => group.label === label);

          if (existingGroup) {
            existingGroup.items.push(extra);
          } else {
            groups.push({ label, items: [extra] });
          }

          return groups;
        }, []);
      const getExtraMeta = (extra) => {
        const meta = [];

        if (extra.category) {
          meta.push(formatExtraValue(extra.category));
        }

        if (extra.subtype && extra.category !== 'metadata') {
          meta.push(formatExtraValue(extra.subtype));
        }

        if (extra.language) {
          meta.push(String(extra.language).toUpperCase());
        }

        return meta.join(' · ');
      };

      return (
        <div className="details-panel details-panel--custom extras-panel">
          <h4 className="details-panel__section-title">
            {t('library.details.extras') || 'Film Extras'}
          </h4>
          <div className="extras-panel__list">
            {extraGroups.map((group, groupIndex) => (
              <div
                key={group.label || `extras-group-${groupIndex}`}
                className="extras-panel__group"
              >
                {group.label ? (
                  <span className="tags-panel__section-subtitle extras-panel__group-title">
                    {group.label}
                  </span>
                ) : null}
                {group.items.map((extra) => (
                  <div key={extra.id} className="details-panel__section extras-panel__section">
                    <div className="extras-panel__header">
                      <div className="extras-panel__header-copy">
                        <div className="extras-panel__title-row">
                          <div className="extras-panel__filename" title={extra.name}>
                            {extra.name}
                          </div>
                        </div>
                        {extra.path ? (
                          <div className="extras-panel__path" title={extra.path}>
                            {extra.path}
                          </div>
                        ) : null}
                        {getExtraMeta(extra) ? (
                          <span className="extras-panel__inline-meta" title={getExtraMeta(extra)}>
                            {getExtraMeta(extra)}
                          </span>
                        ) : null}
                      </div>
                      {extra.path ? (
                        <Button
                          variant="secondary-neutral"
                          size="sm"
                          className="extras-panel__browse-btn"
                          onClick={async () => {
                            const result = await showItemInFolder(extra.path);
                            if (!result?.success) {
                              toast(result?.error || t('organizer.toasts.showInFolderFailed'), 'danger');
                            }
                          }}
                          title={t('library.details.showInFolder') || 'Show in Folder'}
                        >
                          <FolderOpen size={14} />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {extras.length === 0 && (
              <div className="details-panel__no-ratings">
                {t('library.details.noExtraFilesFound') || 'No extra files found.'}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activePanel === 'watched') {
      const formatLogDate = (dateStr) => {
        if (!dateStr) return '';
        try {
          return new Date(dateStr).toLocaleString();
        } catch {
          return dateStr;
        }
      };

      if (isMovie) {
        const movieDuration = item.technical?.duration || (item.runtime ? item.runtime * 60 : 0);
        const progressPercent = movieDuration > 0 && item.resume_position
          ? Math.round((item.resume_position / movieDuration) * 100)
          : 0;

        const movieStatus = item.is_watched
          ? (t('library.details.statusWatched') || 'Watched')
          : (item.resume_position > 0
            ? (t('library.details.statusInProgress') || 'In Progress')
            : (t('library.details.statusUnwatched') || 'Unwatched'));

        const movieProgressText = item.is_watched
          ? (t('library.details.statusWatched') || 'Watched')
          : (item.resume_position > 0
            ? `${formatTime(item.resume_position)} / ${formatTime(movieDuration)}`
            : '0:00');
        const progressPercentText = item.is_watched ? '100%' : `${progressPercent}%`;
        const watchActivityTitle = `${t('library.details.watchActivity') || 'Watch Activity'} (${item.playback_logs?.length || 0})`;

        return (
          <div className="watched-panel">
            <div>
              <h4 className="details-panel__ratings-title">
                {t('library.details.watchStats') || 'Watch Stats'}
              </h4>
              <div className="specs-grid">
                <div className="specs-card">
                  <span className="specs-card__label">{t('library.details.watchCount') || 'Watch Count'}</span>
                  <span className="specs-card__value" title={item.watch_count || 0}>{item.watch_count || 0}</span>
                </div>
                <div className="specs-card">
                  <span className="specs-card__label">{t('library.details.watchStatus') || 'Status'}</span>
                  <span className={`specs-card__value status-${item.is_watched ? 'watched' : (item.resume_position > 0 ? 'progress' : 'unwatched')}`} title={movieStatus}>
                    {movieStatus}
                  </span>
                </div>
                <div className="specs-card specs-card--progress">
                  <span className="specs-card__label">{t('library.details.movieProgress') || 'Progress'}</span>
                  <div className="specs-card__progress-header">
                    <span>{movieProgressText}</span>
                    <span>{progressPercentText}</span>
                  </div>
                  <progress
                    className="specs-card__progress"
                    value={item.is_watched ? 100 : progressPercent}
                    max={100}
                  />
                </div>
                <div className="specs-card specs-card--span-2">
                  <span className="specs-card__label">{t('library.details.lastWatched') || 'Last Watched'}</span>
                  <span className="specs-card__value" title={item.last_watched_at ? formatLogDate(item.last_watched_at) : 'Never'}>
                    {item.last_watched_at ? formatLogDate(item.last_watched_at) : (t('library.details.never') || 'Never')}
                  </span>
                </div>
              </div>
            </div>

            {/* Collapsible Watch Activity */}
            <div>
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div
                className="activity-header watched-panel__activity-header"
                onClick={() => setIsWatchLogsExpanded(prev => !prev)}
              >
                <h4 className="watched-panel__activity-title">
                  {watchActivityTitle}
                </h4>
                {isWatchLogsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>

              {isWatchLogsExpanded && (
                <div className="activity-list">
                  {item.playback_logs && item.playback_logs.length > 0 ? (
                    item.playback_logs.map((log, index) => (
                      <div
                        key={log.id || index}
                        className="activity-item"
                      >
                        <span className="activity-item__token activity-item__token--movie">
                          {t('library.details.watched') || 'Watched'}
                        </span>
                        <span className="activity-item__date">
                          {formatLogDate(log.watched_at)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="activity-list__empty">
                      {t('library.details.noActivity') || 'No recorded watch logs.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      } else {
        // Series watch detail calculations
        const regularSeasons = (item.seasons || []).filter(s => s.season_number > 0);
        const allEpisodes = regularSeasons.flatMap(s => s.episodes || []);
        const totalEpisodesCount = allEpisodes.reduce((sum, ep) => sum + countEpisodesInNumber(ep.episode_number), 0);
        const watchedEpisodesCount = allEpisodes.reduce((sum, ep) => sum + (ep.is_watched ? countEpisodesInNumber(ep.episode_number) : 0), 0);
        const completionPercentage = totalEpisodesCount > 0
          ? Math.round((watchedEpisodesCount / totalEpisodesCount) * 100)
          : 0;

        const inProgressEpisodes = allEpisodes.filter(e => e.resume_position > 0);
        const isInProgress = inProgressEpisodes.length > 0;

        // Collect and sort all logs across all episodes
        const allPlaybackLogs = [];
        regularSeasons.forEach(season => {
          (season.episodes || []).forEach(episode => {
            if (episode.playback_logs && episode.playback_logs.length > 0) {
              episode.playback_logs.forEach(log => {
                allPlaybackLogs.push({
                  ...log,
                  seasonNumber: season.season_number,
                  episodeNumber: episode.episode_number,
                  episodeTitle: episode.title,
                  episodeId: episode.id
                });
              });
            }
          });
        });
        allPlaybackLogs.sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at));

        const seriesLastWatched = allPlaybackLogs.length > 0 ? allPlaybackLogs[0].watched_at : null;

        const seriesStatus = watchedEpisodesCount === totalEpisodesCount && totalEpisodesCount > 0
          ? (t('library.details.statusWatched') || 'Watched')
          : (isInProgress || watchedEpisodesCount > 0
            ? (t('library.details.statusInProgress') || 'In Progress')
            : (t('library.details.statusUnwatched') || 'Unwatched'));

        const episodesCompletedText = `${watchedEpisodesCount} / ${totalEpisodesCount}`;
        const completionRateText = `${completionPercentage}%`;
        const watchActivityTitleText = `${t('library.details.watchActivity') || 'Watch Activity'} (${allPlaybackLogs.length})`;

        return (
          <div className="watched-panel">
            <div>
              <h4 className="details-panel__ratings-title">
                {t('library.details.watchStats') || 'Watch Stats'}
              </h4>
              <div className="specs-grid">
                <div className="specs-card">
                  <span className="specs-card__label">{t('library.details.episodesCompleted') || 'Completed'}</span>
                  <span className="specs-card__value" title={episodesCompletedText}>
                    {episodesCompletedText}
                  </span>
                </div>
                <div className="specs-card">
                  <span className="specs-card__label">{t('library.details.completionRate') || 'Completion'}</span>
                  <span className="specs-card__value" title={completionRateText}>
                    {completionRateText}
                  </span>
                </div>
                <div className="specs-card specs-card--span-2">
                  <span className="specs-card__label">{t('library.details.watchStatus') || 'Status'}</span>
                  <span className={`specs-card__value status-${watchedEpisodesCount === totalEpisodesCount && totalEpisodesCount > 0 ? 'watched' : (isInProgress || watchedEpisodesCount > 0 ? 'progress' : 'unwatched')}`} title={seriesStatus}>
                    {seriesStatus}
                  </span>
                </div>
                <div className="specs-card specs-card--span-2">
                  <span className="specs-card__label">{t('library.details.lastWatched') || 'Last Watched'}</span>
                  <span className="specs-card__value" title={seriesLastWatched ? formatLogDate(seriesLastWatched) : 'Never'}>
                    {seriesLastWatched ? formatLogDate(seriesLastWatched) : (t('library.details.never') || 'Never')}
                  </span>
                </div>
                {isInProgress && (
                  <div className="specs-card specs-card--span-2">
                    <span className="specs-card__label">{t('library.details.inProgressEpisodes') || 'In Progress'}</span>
                    <span className="specs-card__value specs-card__value--in-progress">
                      {inProgressEpisodes.map((ep, idx) => {
                        const epNumStr = ep.episode_number
                          ? (ep.episode_number.toString().includes('.') ? ep.episode_number : String(ep.episode_number).padStart(2, '0'))
                          : '';
                        const epProgressText = `S${epNumStr} • ${ep.title} (${formatTime(ep.resume_position)})`;
                        return (
                          <div key={ep.id || idx}>
                            {epProgressText}
                          </div>
                        );
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Season Progress List */}
            <div>
              <h4 className="details-panel__ratings-title">
                {t('library.details.seasonProgress') || 'Season Progress'}
              </h4>
              <div className="watched-panel__seasons-list">
                {regularSeasons.map(season => {
                  const sEp = season.episodes || [];
                  const totalEp = sEp.length;
                  const watchedEp = sEp.filter(e => e.is_watched).length;
                  const seasonProgPercent = totalEp > 0 ? Math.round((watchedEp / totalEp) * 100) : 0;
                  const seasonTitleText = season.title || `Season ${season.season_number}`;
                  const seasonMetaText = `${watchedEp} / ${totalEp} (${seasonProgPercent}%)`;

                  return (
                    <div
                      key={season.season_number}
                      className="season-progress-card"
                    >
                      <div className="season-progress-card__header">
                        <span className="season-progress-card__title">
                          {seasonTitleText}
                        </span>
                        <span className="season-progress-card__meta">
                          {seasonMetaText}
                        </span>
                      </div>
                      <progress
                        className="season-progress-card__progress"
                        value={seasonProgPercent}
                        max={100}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Collapsible Watch Activity */}
            <div>
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div
                className="activity-header watched-panel__activity-header"
                onClick={() => setIsWatchLogsExpanded(prev => !prev)}
              >
                <h4 className="watched-panel__activity-title">
                  {watchActivityTitleText}
                </h4>
                {isWatchLogsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>

              {isWatchLogsExpanded && (
                <div className="activity-list">
                  {allPlaybackLogs.length > 0 ? (
                    allPlaybackLogs.map((log, index) => {
                      const logCodeText = `S${log.seasonNumber}E${formatEpisodeNumber(log.episodeNumber)}`;
                      return (
                        <div
                          key={log.id || index}
                          className="activity-item activity-item--series"
                        >
                          <div className="activity-item__series-top">
                            <span className="activity-item__token">
                              {logCodeText}
                            </span>
                            <span className="activity-item__title" title={log.episodeTitle}>
                              {log.episodeTitle}
                            </span>
                          </div>
                          <span className="activity-item__date">
                            {formatLogDate(log.watched_at)}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="activity-list__empty">
                      {t('library.details.noActivity') || 'No recorded watch logs.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }
    }

    if (activePanel === 'tags') {
      const currentTags = item?.custom_tags || [];
      const keywords = Array.isArray(item?.keywords) ? item.keywords.filter(Boolean) : [];
      const suggestedKeywords = keywords.filter((keyword) => !currentTags.some((tagName) => tagName.toLowerCase() === String(keyword).toLowerCase()));
      const PREDEFINED_COLORS = [
        '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
        '#ec4899', '#f59e0b', '#6366f1', '#14b8a6'
      ];

      const handleToggleTag = (tagName) => {
        const isAssigned = currentTags.includes(tagName);
        const nextTags = isAssigned
          ? currentTags.filter(name => name !== tagName)
          : [...currentTags, tagName];

        updateStatusMutation.mutate({
          itemId: cleanId,
          payload: {
            custom_tags: nextTags,
            media_type: type
          }
        });
      };

      const handleKeywordTag = async (keyword) => {
        const trimmedKeyword = String(keyword || '').trim();
        if (!trimmedKeyword) return;

        const existingTag = allTags.find((tag) => tag.name.toLowerCase() === trimmedKeyword.toLowerCase());
        try {
          if (!existingTag) {
            await createTagMutation.mutateAsync({
              name: trimmedKeyword,
              color: newTagColor,
              is_adult: item?.is_adult || false
            });
          }

          const nextTags = currentTags.some((tagName) => tagName.toLowerCase() === trimmedKeyword.toLowerCase())
            ? currentTags
            : [...currentTags, trimmedKeyword];

          await updateStatusMutation.mutateAsync({
            itemId: cleanId,
            payload: {
              custom_tags: nextTags,
              media_type: type
            }
          });
        } catch (err) {
          setNewTagError(err.message || 'Failed to add keyword as tag');
        }
      };

      return (
        <div className="tags-panel">
          <h4 className="details-panel__section-title">
            {t('library.details.tagger') || 'Tagger'}
          </h4>

          {/* Currently Assigned Tags */}
          <div className="tags-panel__assigned-section">
            <span className="tags-panel__section-subtitle">
              {t('library.tags.assignedTitle') || 'Assigned'}
            </span>
            <div className="tags-panel__assigned-list">
              {currentTags.map(tagName => {
                const tagObj = allTags.find(t => t.name === tagName);
                const color = tagObj?.color || '#3b82f6';
                return (
                  <Pill
                    key={tagName}
                    variant="tag"
                    className="tags-panel__assigned-pill"
                    customStyle={{ '--pill-tag-color': color }}
                  >
                    <span>{tagName}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleTag(tagName)}
                      className="tags-panel__assigned-pill-remove"
                      title={t('common.remove') || 'Remove'}
                    >
                      ✕
                    </button>
                  </Pill>
                );
              })}
              {currentTags.length === 0 && (
                <div className="tags-panel__no-tags">
                  {t('library.tags.noTagsAssigned') || 'No tags assigned.'}
                </div>
              )}
            </div>
          </div>

          <div className="tags-panel__divider" />

          <div className="tags-panel__assigned-section">
            <span className="tags-panel__section-subtitle">
              {t('library.details.suggestedTags') || 'Suggested Tags'}
            </span>
            <div className="tags-panel__assigned-list tags-panel__assigned-list--suggested">
              {suggestedKeywords.map((keyword) => (
                <Pill
                  key={keyword}
                  variant="tag"
                  className="tags-panel__assigned-pill tags-panel__assigned-pill--suggested ui-pill--tag-suggested"
                  onClick={() => handleKeywordTag(keyword)}
                  customStyle={{ '--pill-tag-color': newTagColor }}
                  title={t('library.details.createTagFromKeyword') || 'Create tag from keyword'}
                >
                  <span>{keyword}</span>
                </Pill>
              ))}
              {suggestedKeywords.length === 0 && (
                <div className="tags-panel__no-tags">
                  {keywords.length > 0
                    ? (t('library.details.allKeywordsTagged') || 'All keywords already exist as tags.')
                    : (t('library.details.noKeywordsAvailable') || 'No keywords available.')}
                </div>
              )}
            </div>
          </div>

          {/* Add Tag Dropdown */}
          <div className="tags-panel__select-section" ref={dropdownRef}>
            <span className="tags-panel__section-subtitle">
              {t('library.tags.addTagLabel') || 'Add Tag'}
            </span>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="tags-panel__select-trigger"
              style={{ marginTop: '8px' }}
            >
              <span>{t('library.tags.addTagPlaceholder') || 'Add Tag...'}</span>
              <ChevronDown size={16} />
            </button>

            {isDropdownOpen && (
              <div className="tags-panel__select-dropdown">
                {allTags
                  .filter(tag => !currentTags.includes(tag.name))
                  .map(tag => {
                    return (
                      <div
                        key={tag.id}
                        onClick={() => handleToggleTag(tag.name)}
                        className="tags-panel__dropdown-item"
                      >
                        <div className="tags-panel__dropdown-item-color" style={{ backgroundColor: tag.color }} />
                        <span className="tags-panel__dropdown-item-name">{tag.name}</span>
                      </div>
                    );
                  })}
                {allTags.length === 0 && (
                  <div className="tags-panel__dropdown-empty">
                    {t('library.emptyStates.tags.description') || 'No tags created yet.'}
                  </div>
                )}
                {allTags.length > 0 && allTags.filter(tag => !currentTags.includes(tag.name)).length === 0 && (
                  <div className="tags-panel__dropdown-empty">
                    {t('library.tags.allTagsAssigned') || 'All tags assigned.'}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="tags-panel__divider" />

          <form onSubmit={handleCreateTag} className="tags-panel__create-form">
            <h5 className="tags-panel__create-title">
              {t('library.tags.modalTitle') || 'Create Tag'}
            </h5>

            <div className="tags-panel__input-row">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => {
                  setNewTagName(e.target.value);
                  setNewTagError('');
                }}
                placeholder={t('library.tags.namePlaceholder') || 'Enter tag name...'}
                className="tags-panel__input"
              />
              <button
                type="submit"
                disabled={!newTagName.trim() || createTagMutation.isPending}
                className="tags-panel__submit-btn"
              >
                +
              </button>
            </div>

            {newTagError && (
              <span className="tags-panel__error">
                {newTagError}
              </span>
            )}

            <div className="tags-panel__color-row">
              {PREDEFINED_COLORS.map(c => {
                const isSelected = newTagColor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewTagColor(c)}
                    className={`tags-panel__color-btn ${isSelected ? 'tags-panel__color-btn--selected' : ''}`}
                    style={{
                      backgroundColor: c,
                      outlineColor: c
                    }}
                  />
                );
              })}
            </div>
          </form>
        </div>
      );
    }

    if (activePanel === 'backdrops') {
      const activeMatch = fullMetadata?.matches?.find(m => m.is_active);
      const apiResponse = activeMatch
        ? (Object.values(activeMatch.api_responses || {})[0] || Object.values(activeMatch.series_api_responses || {})[0])
        : null;
      const allBackdrops = apiResponse?.images?.backdrops || [];
      const neutralBackdrops = allBackdrops.filter(
        bd => (!bd.iso_639_1 || bd.iso_639_1 === '') && bd.width >= 1920
      );

      const handleSelectBackdrop = async (backdropPath) => {
        try {
          await overrideBackdropMutation.mutateAsync({
            itemId: id,
            backdropPath: backdropPath
          });
          toast(t('library.details.backdropUpdated') || 'Backdrop updated successfully!', 'success');
        } catch (err) {
          toast(err.message || t('library.details.backdropUpdateFailed') || 'Failed to update backdrop', 'danger');
        }
      };

      return (
        <div className="backdrops-panel">
          <h4 className="details-panel__section-title">
            {t('library.details.chooseBackdrop') || 'Choose Backdrop'}
          </h4>

          <div className="backdrops-grid">
            {neutralBackdrops.map((bd, idx) => {
              const tmdbThumbUrl = `https://image.tmdb.org/t/p/w300${bd.file_path}`;
              const isSelected = item?.backdrop_path === bd.file_path || (item?.backdrop_path && item.backdrop_path.endsWith(bd.file_path));
              const isPending = overrideBackdropMutation.isPending && overrideBackdropMutation.variables?.backdropPath === bd.file_path;

              return (
                <div
                  key={idx}
                  onClick={() => !overrideBackdropMutation.isPending && handleSelectBackdrop(bd.file_path)}
                  className={`backdrop-card ${isSelected ? 'backdrop-card--selected' : ''} ${overrideBackdropMutation.isPending ? 'backdrop-card--disabled' : ''}`}
                >
                  <img
                    src={tmdbThumbUrl}
                    alt={`Backdrop ${idx + 1}`}
                    className="backdrop-card__img"
                  />
                  {isPending && (
                    <div className="backdrop-card__spinner-overlay">
                      <div className="backdrop-card__spinner" />
                    </div>
                  )}
                  {isSelected && !isPending && (
                    <div className="backdrop-card__selected-overlay">
                      <Check size={18} />
                    </div>
                  )}
                  <div className="backdrop-card__info-overlay">
                    <span>{bd.width}×{bd.height}</span>
                    <span>★ {bd.vote_average?.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}

            {neutralBackdrops.length === 0 && (
              <div className="backdrops-panel__empty">
                {t('library.details.noBackdropsAvailable') || 'No neutral Full HD backdrops available.'}
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  console.log("ITEM DEBUG:", { id, cleanId, type, item, isLoading });

  const currentRating = item?.user_rating !== undefined ? item.user_rating : item?.overrides?.user_rating;
  const displayRating = hoveredRating !== null ? hoveredRating : currentRating;
  const starsFillPercent = displayRating ? (displayRating / 10) * 100 : 0;
  const starsStyleSheetText = `.rating-stars-overlay-dynamic { width: ${starsFillPercent}% !important; }`;
  const verticalBarText = '|';

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    let val = Math.ceil(percent * 20) / 2; // maps [0, 1] to [0.5, 10] in 0.5 steps
    val = Math.max(0.5, Math.min(10.0, val));
    setHoveredRating(val);
  };

  const handleMouseLeave = () => {
    setHoveredRating(null);
  };

  const handleClick = () => {
    if (hoveredRating !== null) {
      const isSame = currentRating !== null && currentRating !== undefined && Number(currentRating) === Number(hoveredRating);
      const targetRating = isSame ? null : hoveredRating;
      updateStatusMutation.mutate({
        itemId: cleanId,
        payload: { user_rating: targetRating }
      });
    }
  };

  const handleOpenReviewModal = () => {
    const currentComment = item?.user_comment !== undefined ? item.user_comment : item?.overrides?.user_comment;

    openModal({
      title: t('library.details.writeReview') || 'Write Review',
      icon: PenLine,
      content: (
        <ReviewModalContent
          initialComment={currentComment}
          onSave={(newComment) => {
            updateStatusMutation.mutate({
              itemId: cleanId,
              payload: {
                user_comment: newComment || null,
                media_type: type
              }
            });
            closeModal();
          }}
          t={t}
        />
      ),
      footer: (
        <div className="modal-footer-row">
          <Button variant="ghost" onClick={closeModal}>
            {t('common.close') || 'Close'}
          </Button>
          <Button variant="primary" type="submit" form="review-modal-form">
            {t('common.save') || 'Save'}
          </Button>
        </div>
      )
    });
  };

  const handleBack = () => {
    navigate(-1);
  };

  const title = item?.title || item?.filename || (isMovie ? 'Movie Title Placeholder' : 'Series Title Placeholder');
  const originalTitle = item?.original_title;
  const showOriginalTitle = originalTitle && title && originalTitle.toLowerCase() !== title.toLowerCase();
  const tagline = item?.tagline || '';
  const taglineText = tagline ? `"${tagline}"` : '';

  const getMetaDate = () => {
    if (!item) return '';
    if (isMovie) {
      return item.release_date ? item.release_date.substring(0, 10) : '';
    } else {
      const firstYear = item.year || (item.first_air_date ? item.first_air_date.substring(0, 4) : '');
      const lastYear = item.last_air_date ? item.last_air_date.substring(0, 4) : '';
      const isEnded = item.release_status?.toLowerCase() === 'ended' || item.release_status?.toLowerCase() === 'canceled';
      if (firstYear && lastYear && isEnded && firstYear !== lastYear) {
        return `${firstYear}–${lastYear}`;
      }
      return firstYear;
    }
  };
  const metaDate = getMetaDate();

  const formattedDuration = isMovie && item?.runtime ? getDurationText(item.runtime * 60, t) : '';

  let seasonsCount = 0;
  let episodesCount = 0;
  if (!isMovie && item?.seasons) {
    const regularSeasons = item.seasons.filter(s => s.season_number > 0);
    seasonsCount = regularSeasons.length;
    episodesCount = regularSeasons.reduce((acc, s) => {
      if (s.episodes && s.episodes.length > 0) {
        return acc + s.episodes.reduce((sum, ep) => sum + countEpisodesInNumber(ep.episode_number), 0);
      }
      return acc + (s.episode_count || 0);
    }, 0);
  }

  const seasonsText = !isMovie && seasonsCount > 0
    ? (seasonsCount === 1
      ? t('library.details.seasonSingular', { defaultValue: '1 Season' })
      : t('library.details.seasonPlural', { count: seasonsCount, defaultValue: '{{count}} Seasons' }))
    : '';

  const episodesText = !isMovie && episodesCount > 0
    ? (episodesCount === 1
      ? t('library.details.episodeSingular', { defaultValue: '1 Episode' })
      : t('library.details.episodePlural', { count: episodesCount, defaultValue: '{{count}} Episodes' }))
    : '';

  const langText = item?.original_language ? String(item.original_language).toUpperCase() : '';

  const ratingImdb = item?.rating_imdb;
  const ratingTmdb = item?.rating_tmdb;
  const showImdb = !!ratingImdb;
  const showTmdb = !ratingImdb && !!ratingTmdb;

  const normalizedGenres = item?.genres || [];
  const overview = item?.overview || '';
  const hasTechnicalPanel = Boolean(item?.technical && (
    item.technical.resolution
    || item.technical.video_codec
    || item.technical.audio_codec
    || item.technical.duration
    || item.technical.size_bytes
    || item.technical.hdr_type
    || item.technical.bit_depth
    || item.technical.framerate
    || (isMovie && item.technical.edition && item.technical.edition !== 'none')
    || (isMovie && item.technical.source && item.technical.source !== 'none')
    || (isMovie && item.technical.audio_type && item.technical.audio_type !== 'none')
  ));
  const hasLinksPanel = Boolean(item?.imdb_id || item?.tmdb_id || item?.series_tmdb_id);

  const isOwned = item && item.in_library !== false;

  const getIsSeriesWatched = () => {
    if (!item?.seasons) return false;
    const regularSeasons = item.seasons.filter(s => s.season_number > 0);
    const episodes = regularSeasons.flatMap(s => s.episodes || []);
    if (episodes.length === 0) return false;
    return episodes.every(e => e.is_watched);
  };
  const isWatched = isMovie ? item?.is_watched : getIsSeriesWatched();

  const bulkUpdateWatchedMutation = useBulkUpdateWatchedMutation();

  const getNextEpisodeInfo = () => {
    if (!item?.seasons) return null;
    for (const season of item.seasons) {
      const sNum = season.season_number;
      const ownedEpisodes = (season.episodes || []).filter(e => e.path && !e.is_missing);
      const inProgress = ownedEpisodes.find(e => e.resume_position > 0);
      if (inProgress) {
        return { episode: inProgress, seasonNumber: sNum };
      }
    }
    for (const season of item.seasons) {
      const sNum = season.season_number;
      const ownedEpisodes = (season.episodes || []).filter(e => e.path && !e.is_missing);
      const unwatched = ownedEpisodes.find(e => !e.is_watched);
      if (unwatched) {
        return { episode: unwatched, seasonNumber: sNum };
      }
    }
    for (const season of item.seasons) {
      const sNum = season.season_number;
      const ownedEpisodes = (season.episodes || []).filter(e => e.path && !e.is_missing);
      if (ownedEpisodes.length > 0) {
        return { episode: ownedEpisodes[0], seasonNumber: sNum };
      }
    }
    return null;
  };
  const nextEpisodeInfo = !isMovie ? getNextEpisodeInfo() : null;

  const handleTrailerClick = () => {
    if (!item?.trailer_key) return;
    openModal({
      title: `${title} - Trailer`,
      variant: 'extra-wide',
      className: 'theater-modal',
      content: (
        <iframe
          width="100%"
          src={`https://www.youtube.com/embed/${item.trailer_key}?autoplay=1`}
          title="Trailer"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="trailer-iframe"
        />
      )
    });
  };

  const handlePlayClick = () => {
    if (isMovie) {
      playMutation.mutate(item.id);
    } else if (nextEpisodeInfo) {
      playMutation.mutate(nextEpisodeInfo.episode.id);
    }
  };

  const handleToggleWatched = () => {
    if (isMovie) {
      updateStatusMutation.mutate({
        itemId: cleanId,
        payload: {
          is_watched: !item?.is_watched,
          media_type: type
        }
      });
    } else {
      if (!item?.seasons) return;
      const regularSeasons = item.seasons.filter(s => s.season_number > 0);
      const episodes = regularSeasons.flatMap(s => s.episodes || []);
      const episodeIds = episodes.map(e => e.id);
      if (episodeIds.length === 0) return;
      bulkUpdateWatchedMutation.mutate({
        itemIds: episodeIds,
        isWatched: !isWatched,
        seriesId: cleanId
      });
    }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    const trimmedName = newTagName.trim();
    if (!trimmedName) return;

    const exists = allTags.some(t => t.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
      setNewTagError(t('library.tags.errorExists') || 'A tag with this name already exists');
      return;
    }

    try {
      await createTagMutation.mutateAsync({
        name: trimmedName,
        color: newTagColor,
        is_adult: item?.is_adult || false
      });

      const currentTags = item?.custom_tags || [];
      await updateStatusMutation.mutateAsync({
        itemId: cleanId,
        payload: {
          custom_tags: [...currentTags, trimmedName],
          media_type: type
        }
      });

      setNewTagName('');
      setNewTagColor('#3b82f6');
      setNewTagError('');
    } catch (err) {
      setNewTagError(err.message || 'Failed to create tag');
    }
  };

  useEffect(() => {
    if (overviewRef.current) {
      const el = overviewRef.current;
      setIsTruncated(el.scrollHeight > el.clientHeight);
    }
  }, [overview, isLoading]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleReadMore = () => {
    openModal({
      title: title,
      icon: Info,
      variant: 'wide',
      description: t('library.details.overview') || 'Overview',
      content: (
        <div className="read-more-overview">
          {overview.split('\n\n').map((paragraph, index) => (
            <p key={index} className="read-more-paragraph">{paragraph}</p>
          ))}
        </div>
      )
    });
  };

  if (isLoading) {
    return (
      <Page className="media-detail-page">
        <div className="library-loading">
          <div className="library-spinner" />
        </div>
      </Page>
    );
  }

  const resolveDetailsImageUrl = (path, imageType = 'backdrop') => {
    if (!path) return '';
    if (String(path).startsWith('http://') || String(path).startsWith('https://')) {
      return path;
    }
    if (String(path).startsWith('/media/')) {
      return `${API_BASE}${path}`;
    }
    if (String(path).startsWith('/')) {
      const size = imageType === 'backdrop' ? 'w1280' : (imageType === 'logo' ? 'original' : 'w500');
      return `https://image.tmdb.org/t/p/${size}${path}`;
    }
    let folder = 'posters';
    if (imageType === 'backdrop') folder = 'backdrops';
    else if (imageType === 'logo') folder = 'logos';
    return `${API_BASE}/media/images/${folder}/${path}`;
  };

  const backdropPath = item?.backdrop_path || '';
  const backdropUrl = resolveDetailsImageUrl(backdropPath, 'backdrop');

  const logoPath = item?.logo_path || '';
  const logoUrl = resolveDetailsImageUrl(logoPath, 'logo'); return (
    <Page className="media-detail-page">
      <UtilityBarPortal>
        <NavButton onClick={handleBack}>
          {t('common.back') || 'Back'}
        </NavButton>
      </UtilityBarPortal>

      <div className="media-detail-page__hero">
        {backdropUrl && (
          <img
            src={backdropUrl}
            alt="Backdrop"
            className="media-detail-page__hero-backdrop"
          />
        )}
        <div className="media-detail-page__hero-overlay" />
      </div>

      <div className="media-detail-page__layout-wrapper">
        <button
          onClick={handleToggleSideNav}
          className={`media-detail-page__side-nav-toggle ${!isSideNavVisible ? 'hidden-state' : ''}`}
          title={isSideNavVisible ? 'Hide Info Panels' : 'Show Info Panels'}
        >
          {isSideNavVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>

        <div
          className={`media-detail-page__container${activePanel ? ' media-detail-page__container--panel-open' : ''}`}
        >
          <div className="media-detail-page__logo-container">
            {logoUrl ? (
              <img src={logoUrl} alt={title} className="media-detail-page__logo" />
            ) : (
              <h1 className="media-detail-page__fallback-title">{title}</h1>
            )}
          </div>

          <div className="media-detail-page__details-group">
            {showOriginalTitle && (
              <div className="media-detail-page__original-title">
                {originalTitle}
              </div>
            )}

            {tagline && (
              <div className="media-detail-page__tagline">
                {taglineText}
              </div>
            )}

            {(metaDate || formattedDuration || seasonsText || episodesText || langText || ratingImdb || ratingTmdb) && (
              <div className="media-detail-page__meta-row">
                {metaDate && (
                  <Pill variant="meta">
                    <Calendar size={14} />
                    {metaDate}
                  </Pill>
                )}
                {isMovie && formattedDuration && (
                  <Pill variant="meta">
                    <Clock size={14} />
                    {formattedDuration}
                  </Pill>
                )}
                {!isMovie && seasonsText && (
                  <Pill variant="meta">
                    {seasonsText}
                  </Pill>
                )}
                {!isMovie && episodesText && (
                  <Pill variant="meta">
                    {episodesText}
                  </Pill>
                )}
                {langText && (
                  <Pill variant="meta">
                    {langText}
                  </Pill>
                )}
                {showImdb && (
                  <Pill variant="meta">
                    <img
                      src="/rating/imdb.png"
                      alt="IMDb"
                      className="rating-pill-img"
                    />
                    <span>{isNaN(parseFloat(ratingImdb)) ? ratingImdb : parseFloat(ratingImdb).toFixed(1)}</span>
                  </Pill>
                )}
                {showTmdb && (
                  <Pill variant="meta">
                    <img
                      src="/rating/tmdb.png"
                      alt="TMDb"
                      className="rating-pill-img"
                    />
                    <span>{isNaN(parseFloat(ratingTmdb)) ? ratingTmdb : parseFloat(ratingTmdb).toFixed(1)}</span>
                  </Pill>
                )}
              </div>
            )}

            {normalizedGenres && normalizedGenres.length > 0 && (
              <div className="media-detail-page__meta-row">
                {normalizedGenres.map((genre, idx) => (
                  <Pill key={idx} variant="meta">
                    {genre.toUpperCase()}
                  </Pill>
                ))}
              </div>
            )}

            <div className="media-detail-page__meta-row">
              <Pill variant="meta-large" className="rating-pill--large">
                <button
                  onClick={handleOpenReviewModal}
                  className="review-trigger-btn"
                  title={t('library.details.writeReview') || 'Write Review'}
                >
                  <PenLine size={15} />
                </button>
                <span className="pill-vertical-separator">{verticalBarText}</span>

                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <div
                  className="rating-stars-container"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  onMouseUp={handleClick}
                >
                  <div className="rating-stars-underlay">
                    <Star size={18} strokeWidth={2.3} />
                    <Star size={18} strokeWidth={2.3} />
                    <Star size={18} strokeWidth={2.3} />
                    <Star size={18} strokeWidth={2.3} />
                    <Star size={18} strokeWidth={2.3} />
                  </div>
                  <style>{starsStyleSheetText}</style>
                  <div className="rating-stars-overlay rating-stars-overlay-dynamic">
                    <div className="rating-stars-overlay-inner">
                      <Star size={18} fill="currentColor" />
                      <Star size={18} fill="currentColor" />
                      <Star size={18} fill="currentColor" />
                      <Star size={18} fill="currentColor" />
                      <Star size={18} fill="currentColor" />
                    </div>
                  </div>
                </div>
                <span className="user-rating-label">
                  {displayRating !== undefined && displayRating !== null
                    ? displayRating.toFixed(1)
                    : (t('library.details.yourRating') || 'Your Rating')}
                </span>
              </Pill>
            </div>

            {overview && (
              <div className="media-detail-page__overview">
                <div
                  ref={overviewRef}
                  className="media-detail-page__overview-text"
                >
                  {overview}
                </div>
                {isTruncated && (
                  <button
                    type="button"
                    className="media-detail-page__read-more-btn"
                    onClick={handleReadMore}
                  >
                    {t('library.details.readMore') || 'Read More'}
                  </button>
                )}
              </div>
            )}
          </div>

          {isOwned && (
            <div className="media-detail-page__actions-row">
              {isMovie && item?.collection_data && (
                <Button
                  variant="ghost"
                  onClick={() => navigate(`/library/collection/${item?.collection_data.tmdb_id}`)}
                >
                  <FolderOpen size={16} />
                  {t('library.details.collection') || 'Collection'}
                </Button>
              )}

              {item?.trailer_key && (
                <Button
                  variant="ghost"
                  onClick={handleTrailerClick}
                >
                  <Video size={16} />
                  {t('library.details.trailer') || 'Trailer'}
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={handleToggleWatched}
                disabled={updateStatusMutation.isPending || bulkUpdateWatchedMutation.isPending}
              >
                {isWatched ? <Check size={16} /> : <Eye size={16} />}
                {isWatched ? (t('library.details.watched') || 'Watched') : (t('library.details.markWatched') || 'Mark as Watched')}
              </Button>

              {isMovie ? (
                <Button
                  variant="secondary"
                  onClick={handlePlayClick}
                  disabled={playMutation.isPending}
                >
                  <Play size={16} fill="currentColor" />
                  {item?.resume_position > 0 ? (t('library.details.resume') || 'Resume') : (t('library.details.play') || 'Play')}
                </Button>
              ) : (
                nextEpisodeInfo && (
                  <Button
                    variant="secondary"
                    onClick={handlePlayClick}
                    disabled={playMutation.isPending}
                  >
                    <Play size={16} fill="currentColor" />
                    {t('library.details.continueEpisode', { defaultValue: 'Continue S{{season}} E{{episode}}', season: nextEpisodeInfo.seasonNumber, episode: formatEpisodeNumber(nextEpisodeInfo.episode.episode_number) })}
                  </Button>
                )
              )}
            </div>
          )}
        </div>

        {/* Sliding Side Panel */}
        {activePanel && (
          <div className="media-detail-page__side-panel">
            <div className="media-detail-page__side-panel-content">
              {renderPanelContent()}
            </div>
          </div>
        )}

        {/* Side Nav Button Bar */}
        {isSideNavVisible && (
          <div
            className="media-detail-page__side-nav"
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              right: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              zIndex: 10
            }}
          >
            {isMovie ? (
              <>
                {item?.cast && item.cast.length > 0 && (
                  <button
                    onClick={() => togglePanel('cast')}
                    className={`media-detail-page__side-nav-btn ${activePanel === 'cast' ? 'active' : ''}`}
                    title={t('library.details.cast') || 'Cast & Crew'}
                  >
                    <Users size={20} />
                  </button>
                )}
                <button
                  onClick={() => togglePanel('details')}
                  className={`media-detail-page__side-nav-btn ${activePanel === 'details' ? 'active' : ''}`}
                  title={t('library.details.details') || 'Details'}
                >
                  <Info size={20} />
                </button>
              </>
            ) : (
              <>
                {!isMovie && item?.seasons && item.seasons.length > 0 && (
                  <button
                    onClick={() => togglePanel('seasons')}
                    className={`media-detail-page__side-nav-btn ${activePanel === 'seasons' ? 'active' : ''}`}
                    title={t('library.details.seasons') || 'Seasons'}
                  >
                    <Tv size={20} />
                  </button>
                )}
                {item?.cast && item.cast.length > 0 && (
                  <button
                    onClick={() => togglePanel('cast')}
                    className={`media-detail-page__side-nav-btn ${activePanel === 'cast' ? 'active' : ''}`}
                    title={t('library.details.cast') || 'Cast & Crew'}
                  >
                    <Users size={20} />
                  </button>
                )}
                <button
                  onClick={() => togglePanel('details')}
                  className={`media-detail-page__side-nav-btn ${activePanel === 'details' ? 'active' : ''}`}
                  title={t('library.details.details') || 'Details'}
                >
                  <Info size={20} />
                </button>
              </>
            )}

            <button
              onClick={() => togglePanel('tags')}
              className={`media-detail-page__side-nav-btn ${activePanel === 'tags' ? 'active' : ''}`}
              title={t('library.details.tagger') || 'Tagger'}
            >
              <Tag size={20} />
            </button>

            {item?.extras && item.extras.length > 0 && (
              <button
                onClick={() => togglePanel('extras')}
                className={`media-detail-page__side-nav-btn ${activePanel === 'extras' ? 'active' : ''}`}
                title={t('library.details.extras') || 'Film Extras'}
              >
                <Film size={20} />
              </button>
            )}

            <button
              onClick={() => togglePanel('backdrops')}
              className={`media-detail-page__side-nav-btn ${activePanel === 'backdrops' ? 'active' : ''}`}
              title={t('library.details.backdrops') || 'Choose Backdrop'}
            >
              <ImageIcon size={20} />
            </button>

            {item && (
              <button
                onClick={() => togglePanel('watched')}
                className={`media-detail-page__side-nav-btn ${activePanel === 'watched' ? 'active' : ''}`}
                title={t('library.details.watchedPanel') || 'Watched Panel'}
              >
                <History size={20} />
              </button>
            )}

            {hasTechnicalPanel && (
              <button
                onClick={() => togglePanel('technical')}
                className={`media-detail-page__side-nav-btn ${activePanel === 'technical' ? 'active' : ''}`}
                title={t('library.details.technicalInfo') || 'Technical Info'}
              >
                <Cpu size={20} />
              </button>
            )}


          </div>
        )}
      </div>
    </Page>
  );
}

function ReviewModalContent({ initialComment, onSave, t }) {
  const [comment, setComment] = useState(initialComment || '');
  const maxChars = 2000;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(comment);
  };

  const charCountLabel = `${comment.length} / ${maxChars}`;

  return (
    <form id="review-modal-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', padding: '4px 0' }}>
      <div style={{ position: 'relative', width: '100%' }}>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, maxChars))}
          placeholder={t('library.details.reviewPlaceholder') || 'Write your review here...'}
          style={{
            width: '100%',
            height: '140px',
            background: 'var(--color-bg-canvas)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--font-size-sm)',
            fontFamily: 'inherit',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ position: 'absolute', bottom: '10px', right: '12px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          {charCountLabel}
        </div>
      </div>
    </form>
  );
}
