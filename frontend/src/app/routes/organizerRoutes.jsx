/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';

const OrganizerPage = lazy(() => import('../pages/organizer/OrganizerPage'));

export const organizerRoutes = [
  { path: 'organizer', element: <OrganizerPage /> },
];
