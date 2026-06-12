import { Suspense, useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import AppClosePrompt from './AppClosePrompt';
import WindowTitlebar from './WindowTitlebar';
import Sidebar from './Sidebar';
import Spinner from '../ui/Spinner';
import { useSettingsQuery } from '../queries';

export default function AppShell() {
  const { data: settings } = useSettingsQuery();
  const theme = settings?.ui_theme || 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem('sidebar_collapsed', JSON.stringify(next));
      } catch {
        // Ignore storage access errors.
      }
      return next;
    });
  };

  return (
    <div className={`shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <button
        type="button"
        tabIndex={0}
        autoFocus
        className="shell__focus-sentinel"
        aria-hidden="true"
      />
      <WindowTitlebar />
      <Sidebar isCollapsed={isSidebarCollapsed} onToggle={handleToggleSidebar} />

      <div className="shell__main">
        <main className="shell__content">
          <header className="shell__utility-bar">
            <div className="shell__utility-bar-left" aria-label="Context actions placeholder" />
          </header>
          <Suspense fallback={
            <div className="shell__suspense-fallback">
              <Spinner label="Loading page..." />
            </div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <AppClosePrompt />
    </div>
  );
}
