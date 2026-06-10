import { Navigate, createHashRouter } from 'react-router-dom';
import AppShell from './shell/AppShell';
import DashboardPage from './pages/DashboardPage';
import OrganizerPage from './pages/organizer/OrganizerPage';
import HistoryPage from './pages/HistoryPage';
import LibraryPage from './pages/LibraryPage';
import NotFoundPage from './pages/NotFoundPage';
import PlaceholderPage from './pages/PlaceholderPage';
import SettingsPage from './pages/SettingsPage';
import RatingsPage from './pages/RatingsPage';
import WatchedHistoryPage from './pages/WatchedHistoryPage';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/organizer" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'organizer', element: <OrganizerPage /> },
      { path: 'library', element: <LibraryPage /> },
      {
        path: 'library/movie/:id',
        element: (
          <PlaceholderPage
            eyebrow="Planned page"
            title="Movie Details"
            description="Detailed information about the selected movie."
          />
        ),
      },
      {
        path: 'library/series/:id',
        element: (
          <PlaceholderPage
            eyebrow="Planned page"
            title="Series Details"
            description="Detailed information about the selected TV series."
          />
        ),
      },
      {
        path: 'library/people/:id',
        element: (
          <PlaceholderPage
            eyebrow="Planned page"
            title="Person Profile"
            description="Information and filmography of the selected actor or crew member."
          />
        ),
      },
      {
        path: 'library/collection/:id',
        element: (
          <PlaceholderPage
            eyebrow="Planned page"
            title="Collection Details"
            description="Detailed information about the selected collection."
          />
        ),
      },
      { path: 'undo-history', element: <HistoryPage /> },
      {
        path: 'my-ratings',
        element: <RatingsPage />,
      },
      {
        path: 'watched-history',
        element: <WatchedHistoryPage />,
      },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
