/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';

const LibraryPage = lazy(() => import('../pages/LibraryPage'));
const HistoryPage = lazy(() => import('../pages/HistoryPage'));
const RatingsPage = lazy(() => import('../pages/RatingsPage'));
const WatchedHistoryPage = lazy(() => import('../pages/WatchedHistoryPage'));
const PlaceholderPage = lazy(() => import('../pages/PlaceholderPage'));

export const libraryRoutes = [
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
  { path: 'my-ratings', element: <RatingsPage /> },
  { path: 'watched-history', element: <WatchedHistoryPage /> },
];
