import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Plus } from 'lucide-react';
import { Tabs } from '@/ui/Tabs';
import Input from '@/ui/Input';
import Button from '@/ui/Button';
import Dropdown from '@/ui/Dropdown';

const SearchInput = React.memo(({ placeholder, onSearchChange }) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(value);
    }, 80);
    return () => clearTimeout(timer);
  }, [value, onSearchChange]);

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
  const showInlineSorter = !showTabs && resolvedTab === 'tags' && setSortKey && setSortDirection && setCurrentPage;
  const btnVariant = activeSessionMode === 'nsfw' ? 'danger' : 'primary';

  return (
    <>
      {/* Row 1: Title */}
      <div className="organizer-panel__row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="organizer-panel__title">{pageTitle || t('library.title')}</span>
        {(resolvedTab === 'people' || resolvedTab === 'adult_people') && hasItems && onAddPeople && (
          <Button variant={btnVariant} size="sm" onClick={onAddPeople} style={{ height: '28px', minHeight: '28px' }}>
            <UserPlus size={14} />
            {t('library.people.addPeopleBtn') || 'Add People'}
          </Button>
        )}
        {resolvedTab === 'tags' && hasItems && onCreateTag && (
          <Button variant={btnVariant} size="sm" onClick={onCreateTag} style={{ height: '28px', minHeight: '28px' }}>
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
