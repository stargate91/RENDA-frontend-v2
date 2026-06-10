from enum import Enum
from dataclasses import dataclass
from typing import Any

class Casing(Enum):
    """Naming format style."""
    LOWER = "lower"        # the matrix
    UPPER = "upper"        # THE MATRIX
    TITLE = "title"        # The Matrix
    DEFAULT = "default"    # As the API gives it (unchanged)


class Separator(Enum):
    """Separator character between words."""
    SPACE = " "            # The Matrix
    DOT = "."              # The.Matrix
    DASH = "-"             # The-Matrix
    UNDERSCORE = "_"       # The_Matrix


class ExtraOrg(Enum):
    """Organization mode for extra files."""
    SAME_FOLDER = "same_folder"          # Right next to the parent
    SUBFOLDER = "subfolder"              # In a common folder (e.g., Extras/)
    CATEGORY_FOLDERS = "category_folders" # In category-specific folders (e.g., Images/, Subtitles/)


@dataclass
class FormatterConfig:
    """Formatter settings."""
    casing: Casing = Casing.DEFAULT
    separator: Separator = Separator.SPACE
    zero_pad: bool = True  # S01E03 vs S1E3
    custom_text: str = ""  # {custom} variable value (from Settings)

    # Naming Templates (from Settings)
    movie_file: str = "{title} ({year}) {resolution}"
    episode_file: str = "{series_title} - S{season}E{episode} - {episode_title}"
    
    # Part Formatting
    part_keyword: str = "Part"
    part_numbering: str = "numeric" # numeric, roman, alpha
    part_separator: Separator = Separator.SPACE

    # Folder Organization
    org_enabled: bool = True
    move_to_library: bool = True
    library_path: str = ""
    sort_by_type: bool = True
    movies_dir_name: str = "Movies"
    series_dir_name: str = "TV Shows"
    adult_dir_name: str = "Adult"
    collision_strategy: str = "keep_both"
    collision_duration_tolerance_seconds: int = 10
    
    # Folder Templates
    create_movie_subdir: bool = True
    movie_folder: str = "{title} ({year})"
    create_collection_dir: bool = True
    collection_folder_mode: str = "threshold"
    collection_folder_threshold: int = 3
    collection_folder: str = "{collection}"
    create_series_dir: bool = True
    series_folder: str = "{series_title} ({year})"
    create_season_dir: bool = True
    season_folder: str = "Season {season}"
    create_episode_dir: bool = False
    episode_folder: str = "{series_title} - {season}{episode}"
    
    remove_empty: bool = True
    
    # Extras Handling
    extras_enabled: bool = True
    # Actions: 'rename', 'delete', 'ignore'
    extra_video_action: str = "rename"
    extra_sub_action: str = "rename"
    extra_audio_action: str = "rename"
    extra_img_action: str = "rename"
    extra_meta_action: str = "rename"
    
    # Extras Templates
    extra_video_template: str = "{parent_name}-{sub_category}"
    extra_sub_template: str = "{parent_name}.{language}"
    extra_audio_template: str = "{parent_name}.{language}"
    extra_img_template: str = "{sub_category}"
    extra_meta_template: str = "{parent_name}"
    
    # Extras Folder Placement
    # modes: 'subfolder' (into 'Extras'), 'flat' (next to media)
    extras_folder_mode: str = "subfolder"
    extras_subfolder_name: str = "Extras"
    db_session: Any = None

    @staticmethod
    def from_db(db_session) -> 'FormatterConfig':
        from ..db.models import UserSetting
        config = FormatterConfig()
        config.db_session = db_session
        try:
            settings = {s.key: s.value for s in db_session.query(UserSetting).all()}

            def localize_builtin_folder_name(setting_key: str, current_value: str):
                if not settings.get("follow_app_language_for_naming", True):
                    return current_value

                ui_lang = str(settings.get("ui_language", "en") or "en").lower()
                localized_aliases = {
                    "folder_movies_name": {
                        "en": {"Movies"},
                        "hu": {"Movies", "Filmek"},
                    },
                    "folder_series_name": {
                        "en": {"TV Shows", "Shows", "TV", "Series"},
                        "hu": {"TV Shows", "Shows", "TV", "Series", "Sorozatok"},
                    },
                    "folder_adult_name": {
                        "en": {"Adult"},
                        "hu": {"Adult", "Felnőtt"},
                    },
                    "extras_subfolder_name": {
                        "en": {"Extras", "extras"},
                        "hu": {"Extras", "extras", "Extrák", "extrák"},
                    },
                }
                localized_targets = {
                    "en": {
                        "folder_movies_name": "Movies",
                        "folder_series_name": "TV Shows",
                        "folder_adult_name": "Adult",
                        "extras_subfolder_name": "Extras",
                    },
                    "hu": {
                        "folder_movies_name": "Filmek",
                        "folder_series_name": "Sorozatok",
                        "folder_adult_name": "Felnőtt",
                        "extras_subfolder_name": "Extrák",
                    },
                }

                target_lang = "hu" if ui_lang == "hu" else "en"
                if current_value in localized_aliases.get(setting_key, {}).get(target_lang, set()):
                    return localized_targets[target_lang][setting_key]
                return current_value
            
            # Casing
            c_val = settings.get("naming_filename_casing", "default")
            if c_val == "lower": config.casing = Casing.LOWER
            elif c_val == "upper": config.casing = Casing.UPPER
            elif c_val == "title": config.casing = Casing.TITLE
            else: config.casing = Casing.DEFAULT
            
            # Separator
            s_val = settings.get("naming_word_separator", "space")
            if s_val == "dot": config.separator = Separator.DOT
            elif s_val == "dash": config.separator = Separator.DASH
            elif s_val == "underscore": config.separator = Separator.UNDERSCORE
            else: config.separator = Separator.SPACE

            # Templates (Files)
            config.movie_file = settings.get("naming_movie_template", config.movie_file).replace("{{", "{").replace("}}", "}")
            config.episode_file = settings.get("naming_episode_template", config.episode_file).replace("{{", "{").replace("}}", "}")
            
            # Templates (Folders)
            config.movie_folder = settings.get("folder_movie_template", config.movie_folder).replace("{{", "{").replace("}}", "}")
            config.collection_folder = settings.get("folder_collection_template", config.collection_folder).replace("{{", "{").replace("}}", "}")
            config.series_folder = settings.get("folder_show_template", config.series_folder).replace("{{", "{").replace("}}", "}")
            config.season_folder = settings.get("folder_season_template", config.season_folder).replace("{{", "{").replace("}}", "}")
            config.episode_folder = settings.get("folder_episode_template", config.episode_folder).replace("{{", "{").replace("}}", "}")

            # Templates (Extras)
            config.extra_video_template = settings.get("extras_video_template", config.extra_video_template).replace("{{", "{").replace("}}", "}")
            config.extra_sub_template = settings.get("extras_sub_template", config.extra_sub_template).replace("{{", "{").replace("}}", "}")
            config.extra_audio_template = settings.get("extras_audio_template", config.extra_audio_template).replace("{{", "{").replace("}}", "}")
            config.extra_img_template = settings.get("extras_img_template", config.extra_img_template).replace("{{", "{").replace("}}", "}")
            config.extra_meta_template = settings.get("extras_meta_template", config.extra_meta_template).replace("{{", "{").replace("}}", "}")

            # Folder Switches
            config.org_enabled = settings.get("folder_organization_enabled", True)
            config.move_to_library = settings.get("folder_move_to_library", True)
            config.library_path = settings.get("folder_library_path", "")
            config.sort_by_type = settings.get("folder_sort_by_type", True)
            config.movies_dir_name = localize_builtin_folder_name("folder_movies_name", settings.get("folder_movies_name", "Movies"))
            config.series_dir_name = localize_builtin_folder_name("folder_series_name", settings.get("folder_series_name", "TV Shows"))
            config.adult_dir_name = localize_builtin_folder_name("folder_adult_name", settings.get("folder_adult_name", "Adult"))
            config.collision_strategy = settings.get("collision_strategy", "keep_both")
            config.collision_duration_tolerance_seconds = int(settings.get("collision_duration_tolerance_seconds", 10) or 10)
            
            config.create_movie_subdir = settings.get("folder_create_movie_subdir", True)
            config.create_collection_dir = settings.get("folder_create_collection_dir", True)
            raw_collection_mode = settings.get("folder_collection_mode")
            if isinstance(raw_collection_mode, str) and raw_collection_mode in {"never", "always", "threshold", "complete_only"}:
                config.collection_folder_mode = raw_collection_mode
            else:
                config.collection_folder_mode = "threshold" if config.create_collection_dir else "never"
            try:
                config.collection_folder_threshold = max(1, int(settings.get("folder_collection_threshold", 3) or 3))
            except (TypeError, ValueError):
                config.collection_folder_threshold = 3
            config.create_series_dir = settings.get("folder_create_show_dir", True)
            config.create_season_dir = settings.get("folder_create_season_dir", True)
            config.create_episode_dir = settings.get("folder_create_episode_dir", False)
            config.remove_empty = settings.get("folder_remove_empty", True)

            # Extras Switches & Actions
            config.extras_enabled = settings.get("extras_enabled", True)
            config.extra_video_action = settings.get("extras_video_action", "rename")
            config.extra_sub_action = settings.get("extras_sub_action", "rename")
            config.extra_audio_action = settings.get("extras_audio_action", "rename")
            config.extra_img_action = settings.get("extras_img_action", "rename")
            config.extra_meta_action = settings.get("extras_meta_action", "rename")
            config.extras_folder_mode = settings.get("extras_folder_mode", "subfolder")
            config.extras_subfolder_name = localize_builtin_folder_name(
                "extras_subfolder_name",
                settings.get("extras_subfolder_name", config.extras_subfolder_name)
            )

            config.custom_text = settings.get("naming_custom_tag", "default")
            
        except Exception as e:
            print(f"Error loading FormatterConfig from DB: {e}")
        return config
