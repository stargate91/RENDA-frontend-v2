import { useState, useMemo } from 'react';
import { usePeopleInfiniteQuery, useUpdatePersonStatusMutation, useSettingsQuery, useAddPersonTmdbMutation } from '@/queries';
import api from '@/lib/api';
import { useUi } from '@/providers/UiProvider';
import SegmentedControl from '@/ui/SegmentedControl';
import Input from '@/ui/Input';
import Spinner from '@/ui/Spinner';
import IconButton from '@/ui/IconButton';
import Tooltip from '@/ui/Tooltip';
import EmptyState from '@/ui/EmptyState';
import Dropdown from '@/ui/Dropdown';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Check, Minus } from 'lucide-react';
import { API_BASE } from '@/lib/backend';

const QUESTION_MARK = '?';

function ActivationButton({ isActive, onClick, disabled }) {
  const [isHovered, setIsHovered] = useState(false);

  if (isActive) {
    return (
      <IconButton
        variant={isHovered ? 'danger' : 'ghost'}
        size="sm"
        onClick={() => onClick(false)}
        disabled={disabled}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={!isHovered ? 'add-people-modal__activation-btn--active' : ''}
      >
        {isHovered ? <Minus size={16} /> : <Check size={16} />}
      </IconButton>
    );
  }

  return (
    <IconButton
      variant="secondary"
      size="sm"
      onClick={() => onClick(true)}
      disabled={disabled}
    >
      <Plus size={16} />
    </IconButton>
  );
}

export default function AddPeopleModalContent({ isAdult, t, onClose }) {
  const { toast } = useUi();
  const queryClient = useQueryClient();
  const [activeMode, setActiveMode] = useState('local'); // 'local', 'search', 'bulk'
  const [searchQuery, setSearchQuery] = useState('');
  const [optimisticStatus, setOptimisticStatus] = useState({});
  const [activatedThisSession, setActivatedThisSession] = useState(() => new Set());
  // eslint-disable-next-line no-unused-vars
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [roleFilter, setRoleFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [sortBy, setSortBy] = useState('library_count');
  const [sortDirection, setSortDirection] = useState('asc');

  // TMDB Search States
  const [tmdbQuery, setTmdbQuery] = useState('');
  const [tmdbResults, setTmdbResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchingError, setSearchingError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const addPersonMutation = useAddPersonTmdbMutation();

  // Bulk Add States
  const [bulkText, setBulkText] = useState('');

  const { data: settings } = useSettingsQuery();
  const hideGenderFilter = isAdult && settings?.adult_gender_preference && settings.adult_gender_preference !== 'all';

  // Fetch people with pagination and infinite scroll
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = usePeopleInfiniteQuery({
    include_inactive: true,
    adult_only: isAdult,
    search: searchQuery.trim() || undefined,
    role: roleFilter !== 'all' ? (roleFilter === 'actor' ? 'Actor' : roleFilter === 'director' ? 'Director' : 'Writer') : undefined,
    gender: hideGenderFilter ? settings.adult_gender_preference : (genderFilter !== 'all' ? genderFilter : undefined),
    sort_by: sortBy === 'library_count' ? `library_count_${sortDirection}` : `name_${sortDirection}`,
  });

  const updateStatusMutation = useUpdatePersonStatusMutation();

  const people = useMemo(() => {
    return data?.pages.flatMap(page => page.items) || [];
  }, [data]);
  const visiblePeople = useMemo(() => {
    return people.filter((person) => {
      const isActive = optimisticStatus[person.id] !== undefined
        ? optimisticStatus[person.id]
        : person.is_active;
      return !isActive || activatedThisSession.has(person.id);
    });
  }, [people, optimisticStatus, activatedThisSession]);
  const hasSearchQuery = searchQuery.trim().length > 0;
  const hasActiveFilters = roleFilter !== 'all' || (!hideGenderFilter && genderFilter !== 'all');
  const textKey = (adultKey, defaultKey) => (isAdult ? adultKey : defaultKey);
  const hasPendingBulkReport = (() => {
    try {
      return localStorage.getItem(isAdult ? 'showBulkImportBanner:nsfw' : 'showBulkImportBanner:sfw') === 'true';
    } catch {
      return false;
    }
  })();

  const resolveProfileUrl = (path) => {
    if (!path) return '';
    if (String(path).startsWith('http://') || String(path).startsWith('https://')) {
      return path;
    }
    if (String(path).startsWith('/') && !String(path).startsWith('/images/')) {
      return `https://image.tmdb.org/t/p/w185${path}`;
    }
    return `${API_BASE}${path}`;
  };

  const handleToggleStatus = async (personId, newActiveStatus) => {
    setOptimisticStatus((prev) => ({ ...prev, [personId]: newActiveStatus }));
    setActivatedThisSession((prev) => {
      const next = new Set(prev);
      if (newActiveStatus) {
        next.add(personId);
      } else {
        next.delete(personId);
      }
      return next;
    });
    setLoadingIds((prev) => {
      const next = new Set(prev);
      next.add(personId);
      return next;
    });
    try {
      await updateStatusMutation.mutateAsync({
        personId,
        payload: { is_active: newActiveStatus }
      });
    } catch (err) {
      console.error(err);
      setOptimisticStatus((prev) => ({ ...prev, [personId]: !newActiveStatus }));
      setActivatedThisSession((prev) => {
        const next = new Set(prev);
        if (newActiveStatus) {
          next.delete(personId);
        } else {
          next.add(personId);
        }
        return next;
      });
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(personId);
        return next;
      });
    }
  };

  return (
    <div className="add-people-modal add-people-modal--people">
      <div className="add-people-modal__mode-selector">
        <SegmentedControl
          value={activeMode}
          onChange={setActiveMode}
          options={[
            { value: 'local', label: t('library.addPeople.modes.local') || 'Local Pack' },
            { value: 'search', label: t('library.addPeople.modes.search') || 'TMDB Search' },
            { value: 'bulk', label: t('library.addPeople.modes.bulk') || 'Bulk Add' },
          ]}
          className="add-people-modal__segmented-control"
        />
      </div>

      {activeMode === 'local' && (
        <div className="add-people-modal__local-panel">
          <div className="add-people-modal__search-row">
            <Input
              type="text"
              placeholder={t(textKey('library.addPeople.adultSearchPlaceholder', 'library.addPeople.searchPlaceholder'))}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={Search}
            />
          </div>

          <div className="add-people-modal__filter-row">
            <div className="library-sorter-container">
              <span className="library-sorter-label">{t('library.sort.label') || 'Sort:'}</span>
              <Dropdown
                className="add-people-dropdown"
                variant="sorter"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                sortDirection={sortDirection}
                onSortDirectionToggle={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                options={[
                  { value: 'library_count', label: t('library.sort.libraryCount') || 'Library Count' },
                  { value: 'name', label: t('library.sort.name') || 'Name' },
                ]}
              />
            </div>

            <div className="library-sorter-container">
              <span className="library-sorter-label">{t('library.filter.roleLabel') || 'Role:'}</span>
              <Dropdown
                className="add-people-dropdown"
                variant="sorter"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                options={[
                  { value: 'all', label: t('library.filter.all') || 'All Roles' },
                  { value: 'actor', label: t('library.people.roles.actor') || 'Actor' },
                  { value: 'director', label: t('library.people.roles.director') || 'Director' },
                  { value: 'writer', label: t('library.people.roles.writer') || 'Writer' },
                ]}
              />
            </div>

            {!hideGenderFilter && (
              <div className="library-sorter-container">
                <span className="library-sorter-label">{t('library.filter.genderLabel') || 'Gender:'}</span>
                <Dropdown
                  className="add-people-dropdown"
                  variant="sorter"
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value)}
                  options={[
                    { value: 'all', label: t('library.filter.all') || 'All Genders' },
                    { value: 'female', label: t('library.filter.female') || 'Female' },
                    { value: 'male', label: t('library.filter.male') || 'Male' },
                  ]}
                />
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="add-people-modal__loading-wrapper">
              <Spinner label={t('library.addPeople.loading') || 'Loading people...'} />
            </div>
          ) : visiblePeople.length === 0 ? (
            <div className="add-people-modal__empty-fill">
              <EmptyState
                title={hasSearchQuery
                  ? (isAdult
                      ? (t('library.addPeople.adultNoSearchResultsTitle') || 'No matching adult people found')
                      : (t('library.addPeople.noSearchResultsTitle') || 'No matching people found'))
                  : hasActiveFilters
                    ? (isAdult
                        ? (t('library.addPeople.adultNoFilterResultsTitle') || 'Nothing fits these filters')
                        : (t('library.addPeople.noFilterResultsTitle') || 'Nothing fits these filters'))
                    : (isAdult
                        ? (t('library.addPeople.adultNoInactive') || 'All discovered adult people are already in your library.')
                        : (t('library.addPeople.noInactive') || 'No people found.'))
                }
                description={hasSearchQuery
                  ? (isAdult
                      ? (t('library.addPeople.adultNoSearchResultsDesc') || 'No adult people in your local pack matched this search. Try another name.')
                      : (t('library.addPeople.noSearchResultsDesc') || 'No people in your local pack matched this search. Try another name.'))
                  : hasActiveFilters
                    ? (isAdult
                        ? (t('library.addPeople.adultNoFilterResultsDesc') || 'Try clearing or relaxing the local adult people filters to see more suggestions.')
                        : (t('library.addPeople.noFilterResultsDesc') || 'Try clearing or relaxing the local people filters to see more suggestions.'))
                    : (isAdult
                        ? (t('library.addPeople.adultNoInactiveDesc') || 'Scan and organize new adult titles to find more cast and creator suggestions.')
                        : (t('library.addPeople.noInactiveDesc') || 'All people from organized items are already active.'))
                }
                variant={hasSearchQuery ? 'modal-search' : hasActiveFilters ? 'modal-filter' : 'modal-default'}
              />
            </div>
          ) : (
            <div
              onScroll={(e) => {
                const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                if (scrollHeight - scrollTop - clientHeight < 50 && hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              className="add-people-modal__list"
            >
              {visiblePeople.map((person) => {
                const isActive = optimisticStatus[person.id] !== undefined
                  ? optimisticStatus[person.id]
                  : person.is_active;

                return (
                  <div
                    key={person.id}
                    className="add-people-modal__card"
                  >
                    <div className="add-people-modal__card-left">
                      <div className="add-people-modal__avatar">
                        {person.profile_path ? (
                          <img
                            src={resolveProfileUrl(person.profile_path)}
                            alt={person.name}
                            className="add-people-modal__avatar-img"
                          />
                        ) : (
                          <div className="add-people-modal__avatar-placeholder">
                            {QUESTION_MARK}
                          </div>
                        )}
                      </div>
                      <div className="add-people-modal__card-info">
                        <strong className="add-people-modal__card-name">{person.name}</strong>
                        <span className="add-people-modal__card-meta">
                          {person.known_for || ''}
                        </span>
                      </div>
                    </div>
                    <ActivationButton
                      isActive={isActive}
                      onClick={(newActiveStatus) => handleToggleStatus(person.id, newActiveStatus)}
                      disabled={updateStatusMutation.isPending}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeMode === 'search' && (
        <div className="add-people-modal__tab-panel">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!tmdbQuery.trim()) return;
              setIsSearching(true);
              setSearchingError('');
              try {
                const results = await api.people.searchTmdb(tmdbQuery.trim(), { adultOnly: isAdult });
                setTmdbResults(results);
                setHasSearched(true);
              } catch (err) {
                setSearchingError(err.message || 'Failed to search TMDB');
              } finally {
                setIsSearching(false);
              }
            }}
            className="add-people-modal__search-form"
          >
            <div className="add-people-modal__form-input-wrapper">
              <Input
                type="text"
                placeholder={t(textKey('library.addPeople.adultTmdbSearchPlaceholder', 'library.addPeople.tmdbSearchPlaceholder'))}
                value={tmdbQuery}
                onChange={(e) => setTmdbQuery(e.target.value)}
              />
            </div>
            <Tooltip
              content={isSearching ? t('library.addPeople.searching') || 'Searching...' : t('common.search') || 'Search'}
              side="top"
            >
              <IconButton
                type="submit"
                variant="secondary"
                disabled={isSearching}
                label={isSearching ? t('library.addPeople.searching') || 'Searching...' : t('common.search') || 'Search'}
                title={null}
              >
                <Search size={15} />
              </IconButton>
            </Tooltip>
          </form>

          {isSearching ? (
            <div className="add-people-modal__loading-wrapper">
              <Spinner label={t('library.addPeople.searching') || 'Searching...'} />
            </div>
          ) : searchingError ? (
            <div className="add-people-modal__error-message">
              {searchingError}
            </div>
          ) : !hasSearched ? (
            <div className="add-people-modal__empty-fill">
              <EmptyState
                title={t(textKey('library.addPeople.adultSearchEmptyTitle', 'library.addPeople.searchEmptyTitle'))}
                description={t(textKey('library.addPeople.adultSearchEmptyDesc', 'library.addPeople.searchEmptyDesc'))}
                variant="modal-intro"
              />
            </div>
          ) : tmdbResults.length === 0 ? (
            <div className="add-people-modal__empty-fill">
              <EmptyState
                title={t(textKey('library.addPeople.adultSearchNoResultsTitle', 'library.addPeople.searchNoResultsTitle'))}
                description={t(textKey('library.addPeople.adultSearchNoResultsDesc', 'library.addPeople.searchNoResultsDesc'))}
                variant="modal-search"
              />
            </div>
          ) : (
            <div className="add-people-modal__list">
              {tmdbResults.map((person) => {
                const isActive = optimisticStatus[person.id] !== undefined
                  ? optimisticStatus[person.id]
                  : person.is_active;

                return (
                  <div
                    key={person.id}
                    className="add-people-modal__card"
                  >
                    <div className="add-people-modal__card-left">
                      <div className="add-people-modal__avatar">
                        {person.profile_path ? (
                          <img
                            src={resolveProfileUrl(person.profile_path)}
                            alt={person.name}
                            className="add-people-modal__avatar-img"
                          />
                        ) : (
                          <div className="add-people-modal__avatar-placeholder">
                            {QUESTION_MARK}
                          </div>
                        )}
                      </div>
                      <div className="add-people-modal__card-info">
                        <strong className="add-people-modal__card-name">{person.name}</strong>
                        <span className="add-people-modal__card-meta add-people-modal__card-meta--wrap">
                          {person.known_for_department || ''}
                          {Array.isArray(person.known_for) && person.known_for.length > 0 && ` • Known for: ${person.known_for.map(k => k.title || k.name).filter(Boolean).slice(0, 2).join(', ')}`}
                        </span>
                      </div>
                    </div>
                    <ActivationButton
                      isActive={isActive}
                      onClick={async (newActiveStatus) => {
                        if (newActiveStatus) {
                          setOptimisticStatus((prev) => ({ ...prev, [person.id]: true }));
                          try {
                            await addPersonMutation.mutateAsync(person.id);
                          } catch (err) {
                            console.error(err);
                            setOptimisticStatus((prev) => ({ ...prev, [person.id]: false }));
                          }
                        } else {
                          setOptimisticStatus((prev) => ({ ...prev, [person.id]: false }));
                          try {
                            await updateStatusMutation.mutateAsync({
                              personId: person.id,
                              payload: { is_active: false }
                            });
                          } catch (err) {
                            console.error(err);
                            setOptimisticStatus((prev) => ({ ...prev, [person.id]: true }));
                          }
                        }
                      }}
                      disabled={addPersonMutation.isPending || updateStatusMutation.isPending}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeMode === 'bulk' && (
        <div className="add-people-modal__tab-panel">
          <div className="add-people-modal__bulk-field">
            <span className="ui-field__label">{t(textKey('library.addPeople.adultBulkLabel', 'library.addPeople.bulkLabel'))}</span>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="Harrison Ford&#10;Will Smith&#10;Ana de Armas"
              className="add-people-modal__bulk-textarea"
            />
          </div>

          <button
            type="button"
            onClick={async () => {
              if (!bulkText.trim()) return;
              if (hasPendingBulkReport) {
                toast(t(textKey('library.addPeople.adultBulkPendingBlockedToast', 'library.addPeople.bulkPendingBlockedToast')), 'danger');
                return;
              }
              try {
                await api.people.bulkImport({
                  raw_text: bulkText,
                  role: 'all',
                  adult_only: isAdult
                });
                queryClient.invalidateQueries({ queryKey: ['scan-status'] });
                queryClient.invalidateQueries({ queryKey: ['library'] });
                queryClient.invalidateQueries({ queryKey: ['stats'] });
                toast(t(textKey('library.addPeople.adultBulkStartedToast', 'library.addPeople.bulkStartedToast')), 'info');
                if (onClose) onClose();
              } catch (err) {
                console.error(err);
                toast(err.message || 'Failed to start bulk import', 'danger');
              }
            }}
            className="ui-button ui-button--primary ui-button--md add-people-modal__bulk-submit"
            disabled={!bulkText.trim()}
          >
            {t('library.addPeople.startBulk') || 'Start Import'}
          </button>
        </div>
      )}
    </div>
  );
}
