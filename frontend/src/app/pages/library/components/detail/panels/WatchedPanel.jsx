import { useMediaDetailContext } from '../MediaDetailContext';
import MovieWatchedStats from './components/MovieWatchedStats';
import SeriesWatchedStats from './components/SeriesWatchedStats';

export default function WatchedPanel() {
  const { state } = useMediaDetailContext();
  const { isMovie } = state;

  return isMovie ? <MovieWatchedStats /> : <SeriesWatchedStats />;
}
