import { NavLink } from 'react-router-dom';
import { CircleHelp, Power, ChevronLeft, ChevronRight, LayoutDashboard, FolderSearch2, Library, History, Star, Clapperboard, Settings } from 'lucide-react';
import UtilityButton from '../ui/UtilityButton';
import { sendWindowEvent } from '../lib/ipc';
import { useTranslation } from '../providers/LanguageProvider';

const navItems = [
  { to: '/dashboard', translationKey: 'sidebar.dashboard', icon: LayoutDashboard },
  { to: '/organizer', translationKey: 'sidebar.organizer', icon: FolderSearch2 },
  { to: '/library', translationKey: 'sidebar.library', icon: Library },
  { to: '/undo-history', translationKey: 'sidebar.undoHistory', icon: History },
  { to: '/my-ratings', translationKey: 'sidebar.myRatings', icon: Star },
  { to: '/watched-history', translationKey: 'sidebar.watchedHistory', icon: Clapperboard },
  { to: '/settings', translationKey: 'sidebar.settings', icon: Settings },
];

export default function Sidebar({ isCollapsed, onToggle }) {
  const { t } = useTranslation();
  const toggleAriaLabel = isCollapsed ? 'Expand navigation' : 'Collapse navigation';

  return (
    <aside className="shell__sidebar">
      <div className="shell__sidebar-toggle-row">
        <UtilityButton
          type="button"
          className="shell__sidebar-toggle"
          size="sm"
          aria-label={toggleAriaLabel}
          onClick={onToggle}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </UtilityButton>
      </div>
      <nav className="shell__nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const label = t(item.translationKey);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `shell__nav-link ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={18} />
              <span className="shell__nav-link-label">{label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="shell__sidebar-footer">
        <button type="button" className="shell__nav-link shell__nav-link--footer">
          <CircleHelp size={18} />
          <span className="shell__nav-link-label">{t('sidebar.about')}</span>
        </button>
        <button
          type="button"
          className="shell__nav-link shell__nav-link--footer shell__nav-link--danger"
          onClick={() => sendWindowEvent('app-quit')}
        >
          <Power size={18} />
          <span className="shell__nav-link-label">{t('sidebar.quit')}</span>
        </button>
      </div>
    </aside>
  );
}
