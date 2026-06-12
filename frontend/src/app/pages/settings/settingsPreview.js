export function generatePreview(template, type, casing, separator, customTag, isFile = true, sortOptions = null) {
  if (!template) return '';

  let context = {};
  let ext = isFile ? '.mp4' : '';
  if (type === 'movie') {
    context = {
      title: 'The Matrix',
      original_title: 'The Matrix',
      year: '1999',
      release_date: '1999-03-31',
      resolution: '1080p',
      edition: 'Ultimate Edition',
      collection: 'The Matrix Collection',
      source: 'BluRay',
      video_codec: 'h264',
      audio_codec: 'DTS-HD',
      audio_channels: '5.1',
      imdb_id: 'tt0133093',
      tmdb_id: '603',
      rating_imdb: '8.7',
      custom: customTag || 'custom'
    };
  } else if (type === 'adultMovie') {
    context = {
      title: 'Velvet Nights XXX',
      original_title: 'Velvet Nights XXX',
      year: '2018',
      release_date: '2018-06-14',
      resolution: '1080p',
      edition: 'Extended Cut',
      collection: '',
      source: 'WEB-DL',
      video_codec: 'h264',
      audio_codec: 'AAC',
      audio_channels: '2.0',
      imdb_id: 'tt0000000',
      tmdb_id: '0',
      rating_imdb: '6.4',
      custom: customTag || 'custom'
    };
  } else if (type === 'show') {
    context = {
      series_title: 'Stranger Things',
      series_original_title: 'Stranger Things',
      year: '2016',
      first_air_year: '2016',
      first_air_date: '2016-07-15',
      last_air_year: '2022',
      last_air_date: '2022-07-01',
      year_range: '2016-2022',
      series_tmdb_id: '66732',
      custom: customTag || 'custom'
    };
  } else if (type === 'season') {
    context = {
      season: '01',
      season_name: 'Season 1',
      series_title: 'Stranger Things',
      custom: customTag || 'custom'
    };
  } else if (type === 'collection') {
    context = {
      collection: 'The Matrix Collection',
      custom: customTag || 'custom'
    };
  } else if (type === 'extraVideo') {
    ext = isFile ? '.mp4' : '';
    context = {
      parent_name: 'The Matrix (1999)',
      sub_category: 'trailer',
      custom: customTag || 'custom'
    };
  } else if (type === 'extraSub') {
    ext = isFile ? '.srt' : '';
    context = {
      parent_name: 'The Matrix (1999)',
      language: 'en',
      sub_category: 'forced',
      custom: customTag || 'custom'
    };
  } else if (type === 'extraAudio') {
    ext = isFile ? '.ac3' : '';
    context = {
      parent_name: 'The Matrix (1999)',
      language: 'en',
      sub_category: 'commentary',
      custom: customTag || 'custom'
    };
  } else if (type === 'extraImg') {
    ext = isFile ? '.jpg' : '';
    context = {
      parent_name: 'The Matrix (1999)',
      sub_category: 'poster',
      custom: customTag || 'custom'
    };
  } else if (type === 'extraMeta') {
    ext = isFile ? '.nfo' : '';
    context = {
      parent_name: 'The Matrix (1999)',
      custom: customTag || 'custom'
    };
  } else {
    context = {
      series_title: 'Stranger Things',
      series_original_title: 'Stranger Things',
      season: '01',
      episode: '03',
      episode_title: 'Holly, Jolly',
      resolution: '1080p',
      video_codec: 'h264',
      audio_codec: 'EAC3',
      audio_channels: '5.1',
      series_tmdb_id: '66732',
      first_air_year: '2016',
      custom: customTag || 'custom'
    };
  }

  let result = template.replace(/\{(\w+)\}/g, (match, p1) => {
    const key = p1.toLowerCase().replace(/_/g, '');
    const foundKey = Object.keys(context).find((k) => k.toLowerCase().replace(/_/g, '') === key);
    return foundKey ? context[foundKey] : '';
  });

  result = result.replace(/\(\s*\)/g, '');
  result = result.replace(/\[\s*\]/g, '');
  result = result.replace(/\s*-\s*-\s*/g, ' - ');
  result = result.replace(/\s{2,}/g, ' ');
  result = result.replace(/\s*-\s*$/g, '');
  result = result.replace(/^\s*-\s*/g, '');
  result = result.replace(/[\\/:*?"<>|]/g, '').trim();

  if (casing === 'lower') {
    result = result.toLowerCase();
  } else if (casing === 'upper') {
    result = result.toUpperCase();
  } else if (casing === 'title') {
    result = result.replace(/\b[a-z]/gi, (char) => char.toUpperCase());
  }

  const sepMap = {
    space: ' ',
    dot: '.',
    dash: '-',
    underscore: '_'
  };
  const sep = sepMap[separator] || ' ';
  if (sep !== ' ') {
    result = result.replace(/\(/g, '').replace(/\)/g, '').replace(/\[/g, '').replace(/\]/g, '');
    result = result.replace(/\s-\s/g, ' ');
    result = result.replace(/\s+/g, ' ');
    result = result.replace(/\s/g, sep);
  }

  let finalResult = result;
  if (!isFile && result) {
    if (type === 'movie') {
      finalResult = `${result}/The Matrix (1999) 1080p.mp4`;
    } else if (type === 'adultMovie') {
      finalResult = `${result}/Velvet Nights XXX (2018) 1080p.mp4`;
    } else if (type === 'show') {
      finalResult = `${result}/Season 01/Stranger Things - S01E03 - Holly, Jolly.mp4`;
    } else if (type === 'season' || type === 'episode') {
      finalResult = `${result}/Stranger Things - S01E03 - Holly, Jolly.mp4`;
    }
  } else if (type === 'collection') {
    finalResult = result ? `${result}/The Matrix (1999).mp4` : '';
  } else {
    finalResult = result ? `${result}${ext}` : '';
  }

  if (sortOptions && sortOptions.enabled && (!isFile || type === 'collection') && finalResult) {
    const rootName = (type === 'movie' || type === 'collection')
      ? (sortOptions.moviesName || 'Movies')
      : (sortOptions.seriesName || 'TV Shows');
    finalResult = `${rootName}/${finalResult}`;
  }

  return finalResult;
}
