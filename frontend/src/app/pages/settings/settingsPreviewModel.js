import { EXTRAS_FOLDER_MODES } from './settingsConstants.js';
import { generatePreview } from './settingsPreview.js';

const FOLDER_ICON = '\uD83D\uDCC1';
const FILE_ICON = '\uD83D\uDCC4';
const RENAME_ARROW = '\u2192';

function createFolderNode(label, options = {}) {
  return {
    kind: 'folder',
    label,
    tone: options.tone || 'folder',
    topSpacing: Boolean(options.topSpacing),
    children: options.children || [],
  };
}

function createFileNode(label, options = {}) {
  return {
    kind: 'file',
    label,
    tone: options.tone || 'success',
    topSpacing: Boolean(options.topSpacing),
    strike: Boolean(options.strike),
  };
}

function buildPreviewAssets(form) {
  return {
    movieFile: generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true),
    movieSubtitle: `${generatePreview(form.naming_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false).replace(/\.mp4$/, '')}.en.srt`,
    adultMovieFile: generatePreview(form.naming_movie_template, 'adultMovie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true),
    adultFolderMovie: generatePreview(form.folder_movie_template, 'adultMovie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false),
    episodeFile: generatePreview(form.naming_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, true),
    folderMovie: generatePreview(form.folder_movie_template, 'movie', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false),
    folderShow: generatePreview(form.folder_show_template, 'show', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false),
    folderSeason: generatePreview(form.folder_season_template, 'season', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false),
    folderEpisode: generatePreview(form.folder_episode_template, 'episode', form.naming_filename_casing, form.naming_word_separator, form.naming_custom_tag, false),
  };
}

function buildMovieExtraNodes(form, assets) {
  if (!form.extras_enabled) {
    return [];
  }

  if (form.extras_folder_mode === EXTRAS_FOLDER_MODES.SUBFOLDER) {
    return [
      createFolderNode(form.extras_subfolder_name, {
        topSpacing: true,
        children: [createFileNode(assets.movieSubtitle, { tone: 'muted' })],
      }),
    ];
  }

  return [createFileNode(assets.movieSubtitle, { tone: 'muted', topSpacing: true })];
}

function buildMovieNodes(form, assets) {
  if (form.folder_create_movie_subdir) {
    return [
      createFolderNode(assets.folderMovie, {
        children: [
          createFileNode(assets.movieFile),
          ...buildMovieExtraNodes(form, assets),
        ],
      }),
    ];
  }

  return [
    createFileNode(assets.movieFile),
    ...buildMovieExtraNodes(form, assets),
  ];
}

function buildAdultNodes(form, assets) {
  if (form.folder_create_movie_subdir) {
    return [
      createFolderNode(assets.adultFolderMovie, {
        tone: 'adult',
        children: [createFileNode(assets.adultMovieFile, { tone: 'adult' })],
      }),
    ];
  }

  return [createFileNode(assets.adultMovieFile, { tone: 'adult' })];
}

function buildEpisodeFileNode(assets) {
  return createFileNode(assets.episodeFile);
}

function buildShowNodes(form, assets, options = {}) {
  if (!form.folder_create_show_dir) {
    return [createFileNode(assets.episodeFile, { topSpacing: Boolean(options.topSpacing) })];
  }

  if (!form.folder_create_season_dir) {
    return [
      createFolderNode(assets.folderShow, {
        topSpacing: Boolean(options.topSpacing),
        children: [buildEpisodeFileNode(assets)],
      }),
    ];
  }

  const seasonChildren = form.folder_create_episode_dir
    ? [
        createFolderNode(assets.folderEpisode, {
          children: [buildEpisodeFileNode(assets)],
        }),
      ]
    : [buildEpisodeFileNode(assets)];

  return [
    createFolderNode(assets.folderShow, {
      topSpacing: Boolean(options.topSpacing),
      children: [
        createFolderNode(assets.folderSeason, {
          children: seasonChildren,
        }),
      ],
    }),
  ];
}

function buildOrganizedNodes(form, assets) {
  if (form.folder_sort_by_type) {
    return [
      createFolderNode(form.folder_movies_name, {
        children: buildMovieNodes(form, assets),
      }),
      createFolderNode(form.folder_series_name, {
        topSpacing: true,
        children: buildShowNodes(form, assets),
      }),
      ...(form.include_adult ? [
        createFolderNode(form.folder_adult_name, {
          tone: 'adult',
          topSpacing: true,
          children: buildAdultNodes(form, assets),
        }),
      ] : []),
    ];
  }

  return [
    ...buildMovieNodes(form, assets),
    ...buildShowNodes(form, assets, { topSpacing: true }),
    ...(form.include_adult ? buildAdultNodes(form, assets).map((node, index) => ({
      ...node,
      topSpacing: index === 0,
    })) : []),
  ];
}

function buildUnorganizedNodes(form, assets) {
  return [
    createFileNode(assets.movieFile),
    ...(form.extras_enabled ? [createFileNode(assets.movieSubtitle, { tone: 'muted', topSpacing: true })] : []),
    createFileNode(assets.episodeFile),
    ...(form.include_adult ? [createFileNode(assets.adultMovieFile, { topSpacing: true })] : []),
  ];
}

function buildRenameItems(form, assets) {
  const items = [
    {
      before: 'original_movie_file.mp4',
      after: assets.movieFile,
      afterTone: 'success',
    },
    {
      before: 'original_episode_file.mp4',
      after: assets.episodeFile,
      afterTone: 'success',
    },
  ];

  if (form.extras_enabled) {
    items.push({
      before: 'original_subtitle.srt',
      after: assets.movieSubtitle,
      afterTone: 'muted',
    });
  }

  if (form.include_adult) {
    items.push({
      before: 'original_adult_movie_file.mp4',
      after: assets.adultMovieFile,
      afterTone: 'adult',
    });
  }

  return items;
}

export function buildStructurePreviewModel(form, t) {
  const assets = buildPreviewAssets(form);

  if (!form.folder_move_to_library) {
    return {
      mode: 'rename',
      rootIcon: FOLDER_ICON,
      fileIcon: FILE_ICON,
      arrow: RENAME_ARROW,
      rootLabel: t('settingsPage.sections.organization.previewScanFolderPlaceholder'),
      items: buildRenameItems(form, assets),
    };
  }

  return {
    mode: 'tree',
    rootIcon: FOLDER_ICON,
    fileIcon: FILE_ICON,
    folderIcon: FOLDER_ICON,
    rootLabel: form.folder_library_path.trim() || t('settingsPage.sections.organization.previewTargetFolderPlaceholder'),
    nodes: form.folder_organization_enabled
      ? buildOrganizedNodes(form, assets)
      : buildUnorganizedNodes(form, assets),
  };
}
