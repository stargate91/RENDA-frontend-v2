import { NavLink } from 'react-router-dom';
import { CircleHelp, Power, ChevronLeft, ChevronRight } from 'lucide-react';
import UtilityButton from '../ui/UtilityButton';
import Tooltip from '../ui/Tooltip';
import { useSidebar } from './useSidebar';

export default function Sidebar({ isCollapsed, onToggle }) {
  const { t, navItems, toggleAriaLabel, quitApp } = useSidebar(isCollapsed);

  return (
    <aside className="shell__sidebar">
      <div className="shell__sidebar-toggle-row">
        <Tooltip content={isCollapsed ? t('sidebar.expand') || 'Expand' : t('sidebar.collapse') || 'Collapse'} side="right">
          <UtilityButton
            type="button"
            className="shell__sidebar-toggle"
            size="sm"
            aria-label={toggleAriaLabel}
            onClick={onToggle}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </UtilityButton>
        </Tooltip>
      </div>
      <nav className="shell__nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const label = t(item.translationKey);
          const linkContent = (
            <NavLink
              to={item.to}
              className={({ isActive }) => `shell__nav-link ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={18} />
              <span className="shell__nav-link-label">{label}</span>
            </NavLink>
          );

          return isCollapsed ? (
            <Tooltip key={item.to} content={label} side="right">
              {linkContent}
            </Tooltip>
          ) : (
            <div key={item.to}>{linkContent}</div>
          );
        })}
      </nav>
      <div className="shell__sidebar-footer">
        {isCollapsed ? (
          <Tooltip content={t('sidebar.about')} side="right">
            <button type="button" className="shell__nav-link shell__nav-link--footer">
              <CircleHelp size={18} />
              <span className="shell__nav-link-label">{t('sidebar.about')}</span>
            </button>
          </Tooltip>
        ) : (
          <button type="button" className="shell__nav-link shell__nav-link--footer">
            <CircleHelp size={18} />
            <span className="shell__nav-link-label">{t('sidebar.about')}</span>
          </button>
        )}
        {isCollapsed ? (
          <Tooltip content={t('sidebar.quit')} side="right">
            <button
              type="button"
              className="shell__nav-link shell__nav-link--footer shell__nav-link--danger"
              onClick={quitApp}
            >
              <Power size={18} />
              <span className="shell__nav-link-label">{t('sidebar.quit')}</span>
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            className="shell__nav-link shell__nav-link--footer shell__nav-link--danger"
            onClick={quitApp}
          >
            <Power size={18} />
            <span className="shell__nav-link-label">{t('sidebar.quit')}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
