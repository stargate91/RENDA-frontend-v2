import { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppClosePrompt from './AppClosePrompt';
import WindowTitlebar from './WindowTitlebar';
import Sidebar from './Sidebar';
import Spinner from '../ui/Spinner';

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
      <button
        type="button"
        tabIndex={0}
        autoFocus
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          border: 0,
        }}
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
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '40px' }}>
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

