/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const SettingsPage = lazy(() => import('../pages/settings/SettingsPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const PlaceholderPage = lazy(() => import('../pages/PlaceholderPage'));

export const coreRoutes = [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: 'dashboard', element: <DashboardPage /> },
  {
    path: 'lists',
    element: (
      <PlaceholderPage
        eyebrow="Planned page"
        title="Lists"
        description="Manage your custom watchlists and collections."
      />
    ),
  },
  { path: 'settings', element: <SettingsPage /> },
  { path: '*', element: <NotFoundPage /> },
];
