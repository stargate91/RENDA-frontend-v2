import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Plus } from 'lucide-react';
import { Tabs } from '@/ui/Tabs';
import Input from '@/ui/Input';
import Button from '@/ui/Button';

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
  tabs,
  resolvedTab,
  setActiveTab,
  searchPlaceholder,
  setSearchQuery,
  onAddPeople,
  onCreateTag,
}) {
  const currentTabObj = tabs.find(tab => tab.value === resolvedTab);
  const hasItems = currentTabObj ? (currentTabObj.count > 0) : false;

  return (
    <>
      {/* Row 1: Title */}
      <div className="organizer-panel__row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="organizer-panel__title">{t('library.title')}</span>
        {(resolvedTab === 'people' || resolvedTab === 'adult_people') && hasItems && onAddPeople && (
          <Button variant="primary" size="sm" onClick={onAddPeople} style={{ height: '28px', minHeight: '28px' }}>
            <UserPlus size={14} />
            {t('library.people.addPeopleBtn') || 'Add People'}
          </Button>
        )}
        {resolvedTab === 'tags' && hasItems && onCreateTag && (
          <Button variant="primary" size="sm" onClick={onCreateTag} style={{ height: '28px', minHeight: '28px' }}>
            <Plus size={14} />
            {t('library.tags.createBtn') || 'Create Tag'}
          </Button>
        )}
      </div>

      {/* Row 2: Tabs and Search */}
      <div className="organizer-panel__row">
        <Tabs
          tabs={tabs}
          value={resolvedTab}
          onChange={setActiveTab}
        />
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
