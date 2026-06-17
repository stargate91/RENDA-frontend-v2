import React, { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, Plus } from 'lucide-react';
import { Tabs } from '@/ui/Tabs';
import Input from '@/ui/Input';
import Button from '@/ui/Button';
import Dropdown from '@/ui/Dropdown';
import { isLibraryPeopleTab, isLibraryTagsTab } from '@/lib/libraryTabs';

const SearchInput = React.memo(({ placeholder, onSearchChange }) => {
  const [value, setValue] = useState('');
  const onSearchChangeRef = useRef(onSearchChange);

  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChangeRef.current?.(value);
    }, 80);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <Input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
});

SearchInput.displayName = 'SearchInput';

export default function LibraryHeader({
  t,
  pageTitle = null,
  tabs,
  resolvedTab,
  setActiveTab,
  searchPlaceholder,
  setSearchQuery,
  onAddPeople,
  onCreateTag,
  showTabs = true,
  sortKey,
  setSortKey,
  sortDirection,
  setSortDirection,
  setCurrentPage,
  activeSessionMode,
}) {
  const currentTabObj = tabs.find(tab => tab.value === resolvedTab);
  const hasItems = currentTabObj ? (currentTabObj.count > 0) : false;
  const showInlineSorter = !showTabs && isLibraryTagsTab(resolvedTab) && setSortKey && setSortDirection && setCurrentPage;
  const btnVariant = 'primary';

  return (
    <>
      {/* Row 1: Title */}
      <div className="organizer-panel__row library-header-row">
        <span className="organizer-panel__title">
          {pageTitle || (activeSessionMode === 'nsfw' ? (t('library.adultTitle') || 'Adult Library') : t('library.title'))}
        </span>
        {isLibraryPeopleTab(resolvedTab) && hasItems && onAddPeople && (
          <Button variant={btnVariant} size="sm" onClick={onAddPeople} className="library-header-btn">
            <UserPlus size={14} />
            {t('library.people.addPeopleBtn') || 'Add People'}
          </Button>
        )}
        {isLibraryTagsTab(resolvedTab) && hasItems && onCreateTag && (
          <Button variant={btnVariant} size="sm" onClick={onCreateTag} className="library-header-btn">
            <Plus size={14} />
            {t('library.tags.createBtn') || 'Create Tag'}
          </Button>
        )}
      </div>

      {/* Row 2: Tabs and Search */}
      <div className="organizer-panel__row">
        {showTabs ? (
          <Tabs
            tabs={tabs}
            value={resolvedTab}
            onChange={setActiveTab}
          />
        ) : (
          <div className="library-header__inline-tools">
            {showInlineSorter ? (
              <div className="library-sorter-container">
                <span className="library-sorter-label">{t('library.sort.label') || 'Sort:'}</span>
                <Dropdown
                  variant="sorter"
                  value={sortKey}
                  onChange={(e) => {
                    setSortKey(e.target.value);
                    setCurrentPage(1);
                  }}
                  sortDirection={sortDirection}
                  onSortDirectionToggle={() => {
                    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'total_count', label: t('library.sort.itemCount') || 'Item Count' },
                    { value: 'name', label: t('library.sort.name') || 'Name' },
                  ]}
                />
              </div>
            ) : null}
          </div>
        )}
        <div className="organizer-search">
          <Search size={14} className="organizer-search__icon" />
          <SearchInput
            key={resolvedTab}
            placeholder={searchPlaceholder}
            onSearchChange={setSearchQuery}
          />
        </div>
      </div>
    </>
  );
}
