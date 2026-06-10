import { Search } from 'lucide-react';
import IconButton from '../../../ui/IconButton';
import SegmentedControl from '../../../ui/SegmentedControl';
import Tooltip from '../../../ui/Tooltip';

export default function MatchModalSearchForm({
  query,
  setQuery,
  year,
  setYear,
  season,
  setSeason,
  episode,
  setEpisode,
  mode,
  isSeriesMode,
  isSearching,
  onSearch,
  onModeChange,
  t,
}) {
  return (
    <form className="organizer-match-modal__search" onSubmit={onSearch}>
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
          <Tooltip
            content={isSearching ? t('organizer.details.matchModal.searching') : t('organizer.details.matchModal.search')}
            side="top"
            delay={250}
          >
            <IconButton
              type="submit"
              variant="secondary"
              className="organizer-match-modal__search-button"
              disabled={isSearching}
              label={isSearching ? t('organizer.details.matchModal.searching') : t('organizer.details.matchModal.search')}
              title={null}
            >
              <Search size={15} />
            </IconButton>
          </Tooltip>
        </div>
        <SegmentedControl
          className="organizer-match-modal__mode-toggle"
          options={[
            { value: 'movie', label: t('organizer.details.matchModal.movie') },
            { value: 'tv', label: t('organizer.details.matchModal.series') },
          ]}
          value={mode}
          onChange={onModeChange}
          ariaLabel={t('organizer.details.matchModal.type')}
        />
      </div>
    </form>
  );
}
