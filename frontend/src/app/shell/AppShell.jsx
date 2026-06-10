import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppClosePrompt from './AppClosePrompt';
import WindowTitlebar from './WindowTitlebar';
import Sidebar from './Sidebar';

export default function AppShell() {
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
      <WindowTitlebar />
      <Sidebar isCollapsed={isSidebarCollapsed} onToggle={handleToggleSidebar} />

      <div className="shell__main">
        <main className="shell__content">
          <header className="shell__utility-bar">
            <div className="shell__utility-bar-left" aria-label="Context actions placeholder" />
          </header>
          <Outlet />
        </main>
      </div>
      <AppClosePrompt />
    </div>
  );
}

