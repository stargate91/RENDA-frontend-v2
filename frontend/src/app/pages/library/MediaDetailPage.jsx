import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Page from '@/ui/Page';
import NavButton from '@/ui/NavButton';
import Pill from '@/ui/Pill';
import Button from '@/ui/Button';
import {
  Calendar, Clock, Star, Play, Check, Video, Eye, EyeOff, FolderOpen,
  X, Users, Info, Tv, Film, ChevronRight, ChevronDown, Sliders, PenLine
} from 'lucide-react';
import { useTranslation } from '@/providers/LanguageContext';
import { useUi } from '@/providers/UiProvider';
import { useFullMetadataQuery, useLibraryItemDetailQuery, useLibrarySeriesDetailQuery } from '@/queries/metadataQueries';
import {
  useUpdateMediaStatusMutation, usePlayMediaMutation, useResetProgressMutation,
  useBulkUpdateWatchedMutation, usePreviewMediaMutation
} from '@/queries/mediaQueries';
import { useSettingsQuery } from '@/queries/settingsQueries';
import { API_BASE } from '@/lib/backend';
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

export default function MediaDetailPage({ type = 'movie' }) {
  const { id } = useParams();
  const cleanId = id?.startsWith('series_') ? id.replace('series_', '') : id;
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const { openModal, closeModal } = useUi();

  const [hoveredRating, setHoveredRating] = useState(null);
  const updateStatusMutation = useUpdateMediaStatusMutation();

  const [isTruncated, setIsTruncated] = useState(false);
  const overviewRef = useRef(null);

  const isMovie = type === 'movie';
  const { data: movieDetail, isLoading: isMovieLoading } = useLibraryItemDetailQuery(cleanId, { enabled: isMovie });
  const { data: seriesDetail, isLoading: isSeriesLoading } = useLibrarySeriesDetailQuery(cleanId, { enabled: !isMovie });
  const item = isMovie ? movieDetail : seriesDetail;
  const isLoading = isMovie ? isMovieLoading : isSeriesLoading;
  const { data: settings } = useSettingsQuery();

  const playMutation = usePlayMediaMutation();
  const resetProgressMutation = useResetProgressMutation();
  const previewMutation = usePreviewMediaMutation();

  const [activePanel, setActivePanel] = useState(null);
  const [expandedSeasons, setExpandedSeasons] = useState({ 1: true });
  const [isSideNavVisible, setIsSideNavVisible] = useState(true);

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
        <div className="seasons-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {item.seasons?.map(season => {
              const isExpanded = expandedSeasons[season.season_number];
              return (
                <div
                  key={season.season_number}
                  className="season-section"
                  style={{
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    className="season-header"
                    onClick={() => toggleSeason(season.season_number)}
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: 'rgba(255, 255, 255, 0.04)',
                      userSelect: 'none'
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {season.title || `Season ${season.season_number}`}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)' }}>
                      <span style={{ fontSize: 'var(--font-size-xs)' }}>
                        {season.episodes?.length || 0} {t('library.details.episodes') || 'Episodes'}
                      </span>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="episodes-list" style={{ display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
                      {season.episodes?.map(episode => (
                        <div
                          key={episode.id}
                          className="episode-item"
                          style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                            <span style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>
                              {episode.episode_number}. {episode.title}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
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
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: episode.is_watched ? 'var(--color-state-success, #2fe07c)' : 'var(--color-text-secondary)',
                                  cursor: 'pointer',
                                  padding: 2,
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                              >
                                {episode.is_watched ? <Check size={16} /> : <Eye size={16} />}
                              </button>

                              {episode.path && !episode.is_missing ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playMutation.mutate(episode.id);
                                  }}
                                  style={{
                                    background: 'var(--color-accent-blue)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '24px',
                                    height: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <Play size={10} fill="currentColor" style={{ marginLeft: 1 }} />
                                </button>
                              ) : (
                                <span
                                  title="Virtual / Missing"
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--color-text-muted)',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    padding: '2px 6px',
                                    borderRadius: 'var(--radius-sm)'
                                  }}
                                >
                                  Virtual
                                </span>
                              )}
                            </div>
                          </div>
                          {episode.overview && (
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                              {episode.overview}
                            </p>
                          )}
                          {episode.technical?.resolution && (
                            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', alignSelf: 'flex-start' }}>
                              {episode.technical.resolution} • {episode.technical.video_codec} • {episode.technical.audio_codec}
                            </span>
                          )}
                        </div>
                      ))}
                      {(!season.episodes || season.episodes.length === 0) && (
                        <div style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                          No episodes found.
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
        <div className="cast-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {filteredDirectors && filteredDirectors.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                {t('library.details.directors') || 'Directors / Creators'}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredDirectors.map(director => (
                  <div
                    key={director.id}
                    className="person-card"
                    onClick={() => navigate(`/people/${director.id}`)}
                  >
                    {director.profile_path ? (
                      <img
                        src={`${API_BASE}/media/images/persons/${director.profile_path}`}
                        alt={director.name}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                      />
                    ) : (
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)', display: 'grid', placeItems: 'center' }}>
                        <Users size={16} />
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>{director.name}</span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {t(`library.people.roles.${String(director.job || 'director').toLowerCase()}`, director.job || 'Director')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredWriters && filteredWriters.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                {t('library.details.writers') || 'Writers / Creators'}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredWriters.map(writer => (
                  <div
                    key={writer.id}
                    className="person-card"
                    onClick={() => navigate(`/people/${writer.id}`)}
                  >
                    {writer.profile_path ? (
                      <img
                        src={`${API_BASE}/media/images/persons/${writer.profile_path}`}
                        alt={writer.name}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                      />
                    ) : (
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)', display: 'grid', placeItems: 'center' }}>
                        <Users size={16} />
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>{writer.name}</span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {t(`library.people.roles.${String(writer.job || 'writer').toLowerCase()}`, writer.job || 'Writer')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredCast && filteredCast.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                {t('library.details.actors') || 'Actors'}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredCast.map(actor => (
                  <div
                    key={actor.id}
                    className="person-card"
                    onClick={() => navigate(`/people/${actor.id}`)}
                  >
                    {actor.profile_path ? (
                      <img
                        src={`${API_BASE}/media/images/persons/${actor.profile_path}`}
                        alt={actor.name}
                        style={{ width: '45px', height: '45px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                      />
                    ) : (
                      <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)', display: 'grid', placeItems: 'center' }}>
                        <Users size={18} />
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>{actor.name}</span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {actor.character || t('library.people.roles.actor') || 'Actor'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activePanel === 'details') {
      const hasImdb = item?.rating_imdb != null;
      const hasTmdb = item?.rating_tmdb != null;
      const hasRotten = item?.rating_rotten != null && item?.rating_rotten !== '';
      const hasMeta = item?.rating_meta != null;

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

      const hasSpecs = isMovie && item.technical;

      return (
        <div className="details-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {ratings.length > 0 ? (
            <div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                {t('library.details.ratingsSection') || 'Ratings'}
              </h4>
              <div className="ratings-container">
                {ratings.map((rating, idx) => {
                  const isLast = idx === ratings.length - 1;
                  const isOddTotal = ratings.length % 2 !== 0;
                  const gridColumn = (isLast && isOddTotal) ? 'span 2' : undefined;

                  return (
                    <div
                      key={rating.id}
                      className="rating-card"
                      style={{ gridColumn }}
                    >
                      <img src={rating.logo} alt={rating.alt} style={{ width: '40px', height: '20px', objectFit: 'contain', flexShrink: 0 }} />
                      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
                        {rating.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', fontSize: '13px' }}>
              No ratings available.
            </div>
          )}

          {isMovie && (item.technical?.edition && item.technical.edition !== 'none' || item.technical?.source && item.technical.source !== 'none' || item.technical?.audio_type && item.technical.audio_type !== 'none') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                Edition & Source
              </h4>
              <div className="specs-grid">
                {item.technical?.edition && item.technical.edition !== 'none' && (
                  <div className="specs-card">
                    <span className="specs-card__label">Edition</span>
                    <span className="specs-card__value" title={EDITION_LABELS[item.technical.edition] || item.technical.edition}>
                      {EDITION_LABELS[item.technical.edition] || item.technical.edition}
                    </span>
                  </div>
                )}
                {item.technical?.source && item.technical.source !== 'none' && (
                  <div className="specs-card">
                    <span className="specs-card__label">Source</span>
                    <span className="specs-card__value" title={SOURCE_LABELS[item.technical.source] || item.technical.source}>
                      {SOURCE_LABELS[item.technical.source] || item.technical.source}
                    </span>
                  </div>
                )}
                {item.technical?.audio_type && item.technical.audio_type !== 'none' && (
                  <div className="specs-card">
                    <span className="specs-card__label">Audio Style</span>
                    <span className="specs-card__value" title={AUDIO_TYPE_LABELS[item.technical.audio_type] || item.technical.audio_type}>
                      {AUDIO_TYPE_LABELS[item.technical.audio_type] || item.technical.audio_type}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {hasSpecs && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                Technical Info
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
                    <span className="specs-card__value" title={`${item.technical.audio_codec.toUpperCase()} (${item.technical.audio_channels}ch)`}>
                      {item.technical.audio_codec.toUpperCase()} ({item.technical.audio_channels}ch)
                    </span>
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
                    <span className="specs-card__label">HDR</span>
                    <span className="specs-card__value" title={item.technical.hdr_type}>{item.technical.hdr_type}</span>
                  </div>
                )}
                {item.technical.bit_depth && (
                  <div className="specs-card">
                    <span className="specs-card__label">Bit Depth</span>
                    <span className="specs-card__value" title={`${item.technical.bit_depth}-bit`}>{item.technical.bit_depth}-bit</span>
                  </div>
                )}
                {item.technical.framerate && (
                  <div className="specs-card">
                    <span className="specs-card__label">Framerate</span>
                    <span className="specs-card__value" title={`${parseFloat(item.technical.framerate).toFixed(3)} fps`}>
                      {parseFloat(item.technical.framerate).toFixed(3)} fps
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activePanel === 'extras') {
      return (
        <div className="extras-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {item.extras?.map(extra => (
              <div
                key={extra.id}
                className="extra-item"
                onClick={() => {
                  if (extra.path) {
                    previewMutation.mutate(extra.path);
                  }
                }}
                style={{
                  padding: '12px 16px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, marginRight: '10px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {extra.name}
                  </span>
                  {extra.subtype && (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {extra.subtype}
                    </span>
                  )}
                </div>
                <button
                  style={{
                    background: 'var(--ui-surface-soft)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  <Play size={12} fill="currentColor" style={{ marginLeft: 1 }} />
                </button>
              </div>
            ))}
            {(!item.extras || item.extras.length === 0) && (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                No extra files found.
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="ghost" onClick={closeModal}>
            {t('common.close') || 'Close'}
          </Button>
          <Button variant="secondary" type="submit" form="review-modal-form">
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
    episodesCount = regularSeasons.reduce((acc, s) => acc + (s.episodes?.length || s.episode_count || 0), 0);
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
          style={{ aspectRatio: '16/9', border: 'none', width: '100%' }}
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

  useEffect(() => {
    if (overviewRef.current) {
      const el = overviewRef.current;
      setIsTruncated(el.scrollHeight > el.clientHeight);
    }
  }, [overview, isLoading]);

  const handleReadMore = () => {
    openModal({
      title: title,
      description: t('library.details.overview') || 'Overview',
      content: (
        <div style={{
          fontSize: 'var(--font-size-md, 16px)',
          lineHeight: '1.6',
          color: 'color-mix(in srgb, var(--color-text-primary, #fff) 85%, transparent)',
          maxHeight: '60vh',
          overflowY: 'auto',
          paddingRight: '8px'
        }}>
          {overview}
        </div>
      )
    });
  };

  if (isLoading) {
    return (
      <Page className="media-detail-page">
        <div className="library-loading" style={{ height: '100%', display: 'grid', placeItems: 'center', flex: 1 }}>
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
        <div
          className="media-detail-page__hero-backdrop"
          style={backdropUrl ? { backgroundImage: `url(${backdropUrl})` } : undefined}
        />
        <div className="media-detail-page__hero-overlay" />
      </div>

      <div className="media-detail-page__layout-wrapper" style={{ display: 'flex', width: '100%', height: '100%', position: 'relative', zIndex: 2 }}>
        <button
          onClick={handleToggleSideNav}
          className={`media-detail-page__side-nav-toggle ${!isSideNavVisible ? 'hidden-state' : ''}`}
          title={isSideNavVisible ? 'Hide Info Panels' : 'Show Info Panels'}
          style={{
            position: 'absolute',
            top: '18px',
            right: '20px',
            zIndex: 11
          }}
        >
          {isSideNavVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>

        <div
          className="media-detail-page__container"
          style={{
            flex: 1,
            minWidth: 0,
            paddingRight: activePanel ? '500px' : '80px',
            transition: 'padding-right 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
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
                "{tagline}"
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
                      style={{ height: '16px', width: 'auto', display: 'block', borderRadius: '2px' }}
                    />
                    <span>{isNaN(parseFloat(ratingImdb)) ? ratingImdb : parseFloat(ratingImdb).toFixed(1)}</span>
                  </Pill>
                )}
                {showTmdb && (
                  <Pill variant="meta">
                    <img
                      src="/rating/tmdb.png"
                      alt="TMDb"
                      style={{ height: '16px', width: 'auto', display: 'block', borderRadius: '2px' }}
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
              <Pill variant="meta-large" style={{ minWidth: '260px', justifyContent: 'flex-start' }}>
                <button
                  onClick={handleOpenReviewModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                    marginRight: '2px',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}
                  title={t('library.details.writeReview') || 'Write Review'}
                >
                  <PenLine size={15} />
                </button>
                <span style={{ margin: '0 8px 0 6px', color: 'rgba(255, 255, 255, 0.15)', userSelect: 'none' }}>|</span>

                <div
                  className="rating-stars-container"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  onMouseUp={handleClick}
                  style={{ position: 'relative', cursor: 'pointer', display: 'inline-flex' }}
                >
                  <div className="rating-stars-underlay" style={{ display: 'flex', gap: '4px', color: 'var(--color-text-muted)' }}>
                    <Star size={18} strokeWidth={2.3} />
                    <Star size={18} strokeWidth={2.3} />
                    <Star size={18} strokeWidth={2.3} />
                    <Star size={18} strokeWidth={2.3} />
                    <Star size={18} strokeWidth={2.3} />
                  </div>
                  <div
                    className="rating-stars-overlay"
                    style={{
                      display: 'flex',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: `${starsFillPercent}%`,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      color: '#f5c518',
                      pointerEvents: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '4px', width: '106px', flexShrink: 0 }}>
                      <Star size={18} fill="currentColor" />
                      <Star size={18} fill="currentColor" />
                      <Star size={18} fill="currentColor" />
                      <Star size={18} fill="currentColor" />
                      <Star size={18} fill="currentColor" />
                    </div>
                  </div>
                </div>
                <span className="user-rating-label" style={{ marginLeft: '10px', fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
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
                    {t('library.details.continueEpisode', { defaultValue: 'Continue S{{season}} E{{episode}}', season: nextEpisodeInfo.seasonNumber, episode: nextEpisodeInfo.episode.episode_number })}
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
            <button
              onClick={() => togglePanel('details')}
              className={`media-detail-page__side-nav-btn ${activePanel === 'details' ? 'active' : ''}`}
              title={t('library.details.details') || 'Details'}
            >
              <Info size={20} />
            </button>

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

            {item?.extras && item.extras.length > 0 && (
              <button
                onClick={() => togglePanel('extras')}
                className={`media-detail-page__side-nav-btn ${activePanel === 'extras' ? 'active' : ''}`}
                title={t('library.details.extras') || 'Extras'}
              >
                <Film size={20} />
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

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(comment);
  };

  return (
    <form id="review-modal-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', padding: '4px 0' }}>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('library.details.reviewPlaceholder') || 'Write your review here...'}
        style={{
          width: '100%',
          minHeight: '140px',
          background: 'rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 'var(--radius-md)',
          padding: '12px',
          color: '#fff',
          fontFamily: 'inherit',
          fontSize: 'var(--font-size-sm, 14px)',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box'
        }}
      />
    </form>
  );
}
