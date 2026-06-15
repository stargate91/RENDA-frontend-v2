import { ChevronDown, ChevronRight } from 'lucide-react';
import { SETTINGS_TAB_GROUP_IDS } from '../settingsConstants.js';

export default function SettingsSidebar({
  t,
  tabGroups,
  visibleOrganizationTabs,
  activeOrganizationIndex,
  activeTab,
  isOrgExpanded,
  isOrganizationTabActive,
  onTabSelect,
  onOrganizationToggle,
}) {
  const isSubMenuVisible = isOrgExpanded || isOrganizationTabActive;

  return (
    <aside className="settings-sidebar">
      <h1 className="settings-sidebar-header">{t('sidebar.settings')}</h1>
      <nav className="settings-sidebar-menu">
        {tabGroups.map((group) => {
          const Icon = group.icon;

          if (group.id === SETTINGS_TAB_GROUP_IDS.ORGANIZATION) {
            return (
              <div key={group.id}>
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <div
                  className={`settings-sidebar-item${isOrganizationTabActive ? ' active' : ''}`}
                  onClick={onOrganizationToggle}
                >
                  <Icon size={18} />
                  <span className="settings-sidebar-label">{t(group.labelKey)}</span>
                  {(isOrgExpanded || isOrganizationTabActive) ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </div>
                <div
                  className={`settings-sidebar-sub-menu${isSubMenuVisible ? ' is-open' : ' is-closed'}`}
                  aria-hidden={!isSubMenuVisible}
                >
                  {activeOrganizationIndex !== -1 && (
                    <div
                      className={`settings-sidebar-sub-indicator settings-sidebar-sub-indicator--${activeOrganizationIndex}`}
                    />
                  )}
                  {visibleOrganizationTabs.map((tab) => {
                    return (
                      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                      <div
                        key={tab.id}
                        className={`settings-sidebar-sub-item${tab.className ? ` ${tab.className}${tab.isCurrentlyVisible ? ' visible' : ''}` : ''}${activeTab === tab.id ? ' active' : ''}`}
                        onClick={() => onTabSelect(tab.id)}
                      >
                        <span>{t(tab.labelKey)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          return (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div
              key={group.id}
              className={`settings-sidebar-item${activeTab === group.id ? ' active' : ''}`}
              onClick={() => onTabSelect(group.id)}
            >
              <Icon size={18} />
              <span>{t(group.labelKey)}</span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
