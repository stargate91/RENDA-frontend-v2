import { LayoutDashboard, FolderSearch2, Library, Star, Clapperboard, Settings, ListTodo, History } from 'lucide-react';
import { useTranslation } from '../providers/LanguageContext';
import { sendWindowEvent } from '../lib/ipc';

export const navItems = [
  { to: '/dashboard', translationKey: 'sidebar.dashboard', icon: LayoutDashboard },
  { to: '/organizer', translationKey: 'sidebar.organizer', icon: FolderSearch2 },
  { to: '/library', translationKey: 'sidebar.library', icon: Library },
  { to: '/lists', translationKey: 'sidebar.lists', icon: ListTodo },
  { to: '/my-ratings', translationKey: 'sidebar.myRatings', icon: Star },
  { to: '/history', translationKey: 'sidebar.history', icon: History },
  { to: '/settings', translationKey: 'sidebar.settings', icon: Settings },
];

export function useSidebar(isCollapsed) {
  const { t } = useTranslation();
  const toggleAriaLabel = isCollapsed ? 'Expand navigation' : 'Collapse navigation';

  const quitApp = () => {
    sendWindowEvent('app-quit');
  };

  return {
    t,
    navItems,
    toggleAriaLabel,
    quitApp,
  };
}
