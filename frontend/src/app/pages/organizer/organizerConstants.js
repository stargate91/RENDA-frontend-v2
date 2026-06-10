import { Eye, Film, Tv, FolderPlus, PlayCircle, Captions, Volume2, Image, Info } from 'lucide-react';

export const MAIN_TABS = [
  { value: 'manual', labelKey: 'organizer.tabs.manual', icon: Eye },
  { value: 'movies', labelKey: 'organizer.tabs.movies', icon: Film },
  { value: 'episodes', labelKey: 'organizer.tabs.episodes', icon: Tv },
  { value: 'extras', labelKey: 'organizer.tabs.extras', icon: FolderPlus },
];

export const EXTRAS_TABS = [
  { value: 'bonus', labelKey: 'organizer.extrasTabs.bonus', icon: PlayCircle },
  { value: 'subtitles', labelKey: 'organizer.extrasTabs.subtitles', icon: Captions },
  { value: 'audio', labelKey: 'organizer.extrasTabs.audio', icon: Volume2 },
  { value: 'images', labelKey: 'organizer.extrasTabs.images', icon: Image },
  { value: 'metadata', labelKey: 'organizer.extrasTabs.metadata', icon: Info },
];

export const EMPTY_DISCOVERY = {
  manual: [],
  movies: [],
  series: [],
  extras: [],
  collisions: [],
};
