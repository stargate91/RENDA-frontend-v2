import { LayoutDashboard, FolderSearch2, Library, Star, Clapperboard, Settings, ListTodo, RotateCcw, Tag } from 'lucide-react';
import { useTranslation } from '../providers/LanguageProvider';
import { sendWindowEvent } from '../lib/ipc';

export const navItems = [
  { to: '/dashboard', translationKey: 'sidebar.dashboard', icon: LayoutDashboard },
  { to: '/organizer', translationKey: 'sidebar.organizer', icon: FolderSearch2 },
  { to: '/library', translationKey: 'sidebar.library', icon: Library },
  { to: '/tags', translationKey: 'sidebar.tags', icon: Tag },
  { to: '/lists', translationKey: 'sidebar.lists', icon: ListTodo },
  { to: '/watched-history', translationKey: 'sidebar.watchedHistory', icon: Clapperboard },
  { to: '/my-ratings', translationKey: 'sidebar.myRatings', icon: Star },
  { to: '/undo-history', translationKey: 'sidebar.undoHistory', icon: RotateCcw },
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
