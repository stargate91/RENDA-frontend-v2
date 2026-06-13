import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Tabs } from '@/ui/Tabs';
import Input from '@/ui/Input';

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
}) {
  return (
    <>
      {/* Row 1: Title */}
      <div className="organizer-panel__row">
        <span className="organizer-panel__title">{t('library.title')}</span>
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
