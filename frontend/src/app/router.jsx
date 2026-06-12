import { createHashRouter } from 'react-router-dom';
import AppShell from './shell/AppShell';
import OnboardingWizard from './pages/onboarding/OnboardingWizard';
import { coreRoutes } from './routes/coreRoutes';
import { organizerRoutes } from './routes/organizerRoutes';
import { libraryRoutes } from './routes/libraryRoutes';

export const router = createHashRouter([
  {
    path: '/onboarding',
    element: <OnboardingWizard />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      ...coreRoutes,
      ...organizerRoutes,
      ...libraryRoutes,
    ],
  },
]);
