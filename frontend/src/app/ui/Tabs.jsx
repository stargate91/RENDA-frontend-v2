import './Tabs.css';

export function Tabs({ tabs, value, onChange, variant }) {
  const isSub = variant === 'sub';
  const containerClass = isSub ? 'ui-tabs--sub' : 'ui-tabs';
  const tabClass = isSub ? 'ui-tab--sub' : 'ui-tab';

  return (
    <div className={containerClass} role="tablist" aria-label="Sections">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={value === tab.value}
            className={`${tabClass} ${value === tab.value ? 'is-active' : ''}`}
            onClick={() => onChange(tab.value)}
          >
            {Icon && <Icon size={isSub ? 12 : 14} className="ui-tab-icon" />}
            <span className="ui-tab__label">{tab.label}</span>
            {typeof tab.count === 'number' ? <strong className="ui-tab__count">{tab.count}</strong> : null}
          </button>
        );
      })}
    </div>
  );
}
