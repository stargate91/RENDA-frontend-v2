import { useState, useMemo } from 'react';
import { usePeopleInfiniteQuery, useUpdatePersonStatusMutation, useSettingsQuery } from '@/queries';
import SegmentedControl from '@/ui/SegmentedControl';
import Input from '@/ui/Input';
import Spinner from '@/ui/Spinner';
import IconButton from '@/ui/IconButton';
import EmptyState from '@/ui/EmptyState';
import Dropdown from '@/ui/Dropdown';
import { Search, Plus, Check, Minus } from 'lucide-react';
import { API_BASE } from '@/lib/backend';

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
        style={!isHovered ? {
          color: 'var(--color-state-success)',
          background: 'var(--color-state-success-bg)',
          borderColor: 'color-mix(in srgb, var(--color-state-success) 40%, transparent)',
        } : undefined}
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

export default function AddPeopleModalContent({ isAdult, t }) {
  const [activeMode, setActiveMode] = useState('local'); // 'local', 'search', 'bulk'
  const [searchQuery, setSearchQuery] = useState('');
  const [optimisticStatus, setOptimisticStatus] = useState({});
  // eslint-disable-next-line no-unused-vars
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [roleFilter, setRoleFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [sortBy, setSortBy] = useState('library_count');
  const [sortDirection, setSortDirection] = useState('asc');

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
  const hasSearchQuery = searchQuery.trim().length > 0;
  const hasActiveFilters = roleFilter !== 'all' || (!hideGenderFilter && genderFilter !== 'all');

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
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(personId);
        return next;
      });
    }
  };

  return (
    <div className="add-people-modal" style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '360px' }}>
      <SegmentedControl
        value={activeMode}
        onChange={setActiveMode}
        options={[
          { value: 'local', label: t('library.addPeople.modes.local') || 'Local Pack' },
          { value: 'search', label: t('library.addPeople.modes.search') || 'TMDB Search' },
          { value: 'bulk', label: t('library.addPeople.modes.bulk') || 'Bulk Add' },
        ]}
      />

      {activeMode === 'local' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexGrow: 1, justifyContent: (people.length === 0 && !isLoading) ? 'center' : undefined }}>
          <Input
            type="text"
            placeholder={t('library.addPeople.searchPlaceholder') || 'Search people...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={Search}
          />

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '100%' }}>
            <div className="library-sorter-container" style={{ flex: 1 }}>
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

            <div className="library-sorter-container" style={{ flex: 1 }}>
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
              <div className="library-sorter-container" style={{ flex: 1 }}>
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
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '32px' }}>
              <Spinner label={t('library.addPeople.loading') || 'Loading people...'} />
            </div>
          ) : people.length === 0 ? (
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
          ) : (
            <div
              onScroll={(e) => {
                const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                if (scrollHeight - scrollTop - clientHeight < 50 && hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}
            >
              {people.map((person) => {
                const isActive = optimisticStatus[person.id] !== undefined
                  ? optimisticStatus[person.id]
                  : person.is_active;

                return (
                  <div
                    key={person.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          background: 'var(--color-surface-glass-strong)',
                          flexShrink: 0,
                        }}
                      >
                        {person.profile_path ? (
                          <img
                            src={resolveProfileUrl(person.profile_path)}
                            alt={person.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            ?
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ color: 'var(--color-text-primary)', fontSize: '14px' }}>{person.name}</strong>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
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
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)' }}>
          {t('library.addPeople.tmdbPlaceholder') || 'TMDB search is not yet implemented.'}
        </div>
      )}

      {activeMode === 'bulk' && (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)' }}>
          {t('library.addPeople.bulkPlaceholder') || 'Bulk add is not yet implemented.'}
        </div>
      )}
    </div>
  );
}
