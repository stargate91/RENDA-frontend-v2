export const SOURCE_LABELS = {
  bluray: 'Blu-Ray',
  web: 'WEB-DL',
  dvd: 'DVD',
  tv: 'TV HDTV',
  cam: 'CAM'
};

export const EDITION_LABELS = {
  theatrical: 'Theatrical Edition',
  directors_cut: "Director's Cut",
  extended: 'Extended Edition',
  unrated: 'Unrated',
  remastered: 'Remastered',
  special: 'Special Edition',
  ultimate: 'Ultimate',
  collectors_edition: "Collector's Edition",
  fan_edit: 'Fan Edit'
};

export const AUDIO_TYPE_LABELS = {
  mono: 'Mono',
  stereo: 'Stereo',
  surround: 'Surround Sound',
  dual_audio: 'Dual Audio',
  multi_audio: 'Multi Audio'
};

export const getDurationText = (seconds, t) => {
  if (!seconds) return '';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    if (minutes > 0) {
      return t('library.details.durationHoursMinutes', { hours, minutes, defaultValue: '{{hours}}h {{minutes}}m' });
    }
    return t('library.details.durationHours', { hours, count: hours, defaultValue: '{{hours}}h' });
  }
  return t('library.details.durationMinutes', { minutes, count: minutes, defaultValue: '{{minutes}}m' });
};

export const formatEpisodeNumber = (epNum) => {
  if (epNum === undefined || epNum === null) return '';
  const str = String(epNum).trim();

  if (str.includes(',')) {
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      return `${parts[0]}-${parts[parts.length - 1]}`;
    }
  }

  if (str.includes('-')) {
    return str.split('-').map(s => s.trim()).filter(Boolean).join('-');
  }

  return str;
};

export const formatTime = (secs) => {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  return [h > 0 ? h : null, m, s]
    .filter(x => x !== null)
    .map(x => String(x).padStart(2, '0'))
    .join(':');
};

export const countEpisodesInNumber = (epNum) => {
  if (epNum === undefined || epNum === null) return 1;
  const str = String(epNum).trim();
  if (!str) return 1;

  if (str.includes(',')) {
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts.length : 1;
  }

  if (str.includes('-')) {
    const parts = str.split('-').map(s => s.trim()).filter(Boolean);
    if (parts.length === 2) {
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        return end - start + 1;
      }
    }
  }

  return 1;
};

export const resolveDetailsImageUrl = (path, API_BASE, imageType = 'backdrop') => {
  if (!path) return '';
  if (String(path).startsWith('http://') || String(path).startsWith('https://')) {
    return path;
  }
  if (String(path).startsWith('/media/')) {
    return `${API_BASE}${path}`;
  }
  if (String(path).startsWith('/')) {
    const size = imageType === 'backdrop' ? 'w1280' : (imageType === 'logo' ? 'original' : 'w500');
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }
  let folder = 'posters';
  if (imageType === 'backdrop') folder = 'backdrops';
  else if (imageType === 'logo') folder = 'logos';
  return `${API_BASE}/media/images/${folder}/${path}`;
};
