import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './queryClient';
import { router } from './router';
import { UiProvider } from './providers/UiProvider';
import { LanguageProvider } from './providers/LanguageProvider';

export default function RootApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <UiProvider>
        <LanguageProvider>
          <RouterProvider router={router} />
        </LanguageProvider>
      </UiProvider>
    </QueryClientProvider>
  );
}

