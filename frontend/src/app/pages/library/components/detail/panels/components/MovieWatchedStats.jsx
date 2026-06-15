import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatTime } from '../../../../utils/detailUtils';
import { useMediaDetailContext } from '../../MediaDetailContext';
import '../PanelsCommon.css';
import './WatchedStats.css';
import Pill from '@/ui/Pill';


export default function MovieWatchedStats() {
  const { state, actions, t } = useMediaDetailContext();
  const { item, isWatchLogsExpanded } = state;
  const { setIsWatchLogsExpanded } = actions;

  const formatLogDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

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
                  <Pill variant="success" className="activity-item__token">
                    {t('library.details.watched') || 'Watched'}
                  </Pill>
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
}
