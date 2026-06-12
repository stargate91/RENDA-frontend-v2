function createTagGroup(tags, commonTags = []) {
  return {
    common: commonTags,
    all: tags,
  };
}

export const MOVIE_TAGS = createTagGroup(
  ['{title}', '{original_title}', '{year}', '{release_date}', '{resolution}', '{edition}', '{collection}', '{source}', '{video_codec}', '{audio_codec}', '{audio_channels}', '{imdb_id}', '{tmdb_id}', '{rating_imdb}', '{custom}'],
  ['{title}', '{year}', '{resolution}', '{edition}', '{custom}']
);

export const EPISODE_TAGS = createTagGroup(
  ['{series_title}', '{series_original_title}', '{season}', '{episode}', '{episode_title}', '{resolution}', '{video_codec}', '{audio_codec}', '{audio_channels}', '{series_tmdb_id}', '{first_air_year}', '{custom}'],
  ['{series_title}', '{season}', '{episode}', '{episode_title}', '{custom}']
);

export const FOLDER_MOVIE_TAGS = createTagGroup(
  ['{title}', '{original_title}', '{year}', '{release_date}', '{resolution}', '{edition}', '{collection}', '{source}', '{video_codec}', '{audio_codec}', '{audio_channels}', '{imdb_id}', '{tmdb_id}', '{rating_imdb}', '{custom}'],
  ['{title}', '{year}', '{collection}', '{custom}']
);

export const FOLDER_SHOW_TAGS = createTagGroup(
  ['{series_title}', '{series_original_title}', '{year_range}', '{first_air_year}', '{first_air_date}', '{last_air_year}', '{last_air_date}', '{series_tmdb_id}', '{custom}'],
  ['{series_title}', '{year_range}', '{first_air_year}', '{custom}']
);

export const FOLDER_SEASON_TAGS = createTagGroup(
  ['{season}', '{season_name}', '{series_title}', '{custom}'],
  ['{season}', '{season_name}', '{custom}']
);

export const FOLDER_EPISODE_TAGS = createTagGroup(
  ['{series_title}', '{series_original_title}', '{season}', '{episode}', '{episode_title}', '{resolution}', '{video_codec}', '{audio_codec}', '{audio_channels}', '{series_tmdb_id}', '{first_air_year}', '{custom}'],
  ['{series_title}', '{season}', '{episode}', '{episode_title}', '{custom}']
);

export const EXTRA_VIDEO_TAGS = createTagGroup(
  ['{parent_name}', '{sub_category}', '{custom}'],
  ['{parent_name}', '{sub_category}', '{custom}']
);

export const EXTRA_SUB_TAGS = createTagGroup(
  ['{parent_name}', '{language}', '{sub_category}', '{custom}'],
  ['{parent_name}', '{language}', '{custom}']
);

export const EXTRA_AUDIO_TAGS = createTagGroup(
  ['{parent_name}', '{language}', '{sub_category}', '{custom}'],
  ['{parent_name}', '{language}', '{custom}']
);

export const EXTRA_IMG_TAGS = createTagGroup(
  ['{parent_name}', '{sub_category}', '{custom}'],
  ['{parent_name}', '{sub_category}', '{custom}']
);

export const EXTRA_META_TAGS = createTagGroup(
  ['{parent_name}', '{custom}'],
  ['{parent_name}', '{custom}']
);
