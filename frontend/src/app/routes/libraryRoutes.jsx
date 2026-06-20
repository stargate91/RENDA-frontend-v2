/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';

const LibraryPage = lazy(() => import('../pages/library/LibraryPage'));
const TagsPage = lazy(() => import('../pages/tags/TagsPage'));
const MediaDetailPage = lazy(() => import('../pages/library/MediaDetailPage'));
const PeopleCollectionDetailPage = lazy(() => import('../pages/library/PeopleCollectionDetailPage'));
const HistoryPage = lazy(() => import('../pages/history/HistoryPage'));
const RatingsPage = lazy(() => import('../pages/RatingsPage'));

export const libraryRoutes = [
  { path: 'library', element: <LibraryPage /> },
  { path: 'tags', element: <TagsPage /> },
  {
    path: 'library/movie/:id',
    element: <MediaDetailPage type="movie" />,
  },
  {
    path: 'library/scene/:id',
    element: <MediaDetailPage type="scene" />,
  },
  {
    path: 'library/series/:id',
    element: <MediaDetailPage type="series" />,
  },
  {
    path: 'library/people/:id',
    element: <PeopleCollectionDetailPage type="people" />,
  },
  {
    path: 'library/collection/:id',
    element: <PeopleCollectionDetailPage type="collection" />,
  },
  { path: 'history', element: <HistoryPage /> },
  { path: 'my-ratings', element: <RatingsPage /> },
];
