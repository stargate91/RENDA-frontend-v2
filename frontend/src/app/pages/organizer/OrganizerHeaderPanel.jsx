import { Search } from 'lucide-react';
import { Tabs } from '../../ui/Tabs';
import Input from '../../ui/Input';

export default function OrganizerHeaderPanel({
  activeExtrasTab,
  activeManualTab,
  activeMainTab,
  actions,
  computedExtrasTabs,
  computedManualTabs,
  computedMainTabs,
  onChangeExtrasTab,
  onChangeManualTab,
  onChangeMainTab,
  searchPlaceholder,
  searchQuery,
  setSearchQuery,
  title,
}) {
  return (
    <div className="organizer-panel">
      <div className="organizer-panel__row">
        <span className="organizer-panel__title">{title}</span>
        <div className="organizer-panel__actions">
          {actions}
        </div>
      </div>

      <div className="organizer-panel__row">
        <Tabs
          tabs={computedMainTabs}
          value={activeMainTab}
          onChange={onChangeMainTab}
        />
        <div className="organizer-search">
          <Search size={14} className="organizer-search__icon" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      {activeMainTab === 'manual' ? (
        <div className="organizer-panel__row">
          <Tabs
            tabs={computedManualTabs}
            value={activeManualTab}
            onChange={onChangeManualTab}
            variant="sub"
          />
        </div>
      ) : null}

      {activeMainTab === 'extras' ? (
        <div className="organizer-panel__row">
          <Tabs
            tabs={computedExtrasTabs}
            value={activeExtrasTab}
            onChange={onChangeExtrasTab}
            variant="sub"
          />
        </div>
      ) : null}
    </div>
  );
}
