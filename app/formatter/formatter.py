import os
from typing import Optional, Dict, Any, List
from pathlib import Path

from ..db.models import MediaMatch, ItemStatus, ItemType
from .config import Casing, Separator, ExtraOrg, FormatterConfig
from .utils import to_roman, to_alpha
from .models import RenamePreview
from .context_builder import ContextBuilder
from .template_renderer import TemplateRenderer
from .path_resolver import PathResolver

class Formatter:
    """
    Generator for standardized file and directory names.
    Handles template rendering, illegal character stripping, and collision resolution.
    """

    ILLEGAL_CHARS = TemplateRenderer.ILLEGAL_CHARS
    MULTI_SPACE = TemplateRenderer.MULTI_SPACE
    TEMPLATE_VAR = TemplateRenderer.TEMPLATE_VAR

    def __init__(self, config: Optional[FormatterConfig] = None):
        self.config = config or FormatterConfig()
        self.context_builder = ContextBuilder(self.config)
        self.renderer = TemplateRenderer(self.config)
        self.path_resolver = PathResolver(self.config)

    def _match_language_code(self, lang_a: Optional[str], lang_b: Optional[str]) -> bool:
        from ..services.language_service import LanguageService
        return LanguageService.matches_locale(lang_a, lang_b)

    def _pick_localization(self, match: MediaMatch, item: Any = None):
        localizations = getattr(match, "localizations", None) or []
        if not localizations:
            return None
        from ..services.language_service import LanguageService
        preferred_locale = getattr(item, "locale", None) or getattr(getattr(match, "media_item", None), "locale", None)
        locales = [preferred_locale] if preferred_locale else []
        return LanguageService.pick_localization(localizations, locales)

    def format_item(self, item: Any, match: MediaMatch, loc: Any) -> RenamePreview:
        """
        Generates a preview for a single item using official metadata.
        Used for updating planned_path after enrichment.
        """
        is_inplace = not self.config.org_enabled or not self.config.move_to_library or not self.config.library_path
        if is_inplace:
             # Just rename in place (keep same folder)
             target_name = (
                 self.format_movie_filename(self.build_movie_context(item, match, loc))
                 if match.item_type == ItemType.MOVIE
                 else self.format_episode_filename(self.build_tv_context(item, match, loc))
             )
             preview = RenamePreview(
                item_id=item.id,
                original_path=item.current_path,
                target_name=target_name,
                target_subpath="",
                item_type=match.item_type.value,
                destination_root=os.path.dirname(item.current_path),
                source_size=item.size,
                source_duration=item.duration,
                source_resolution=item.resolution,
                source_video_bitrate=item.video_bitrate
             )
             self.resolve_collisions([preview])
             self._check_path_lengths(preview)
             return preview

        if match.item_type == ItemType.MOVIE:
            context = self.build_movie_context(item, match, loc)
            target_name = self.format_movie_filename(context)
            cat_folder = self.get_category_folder("movie", match)
            folder_name = self.format_movie_foldername(context, match)
            
            sub_path_obj = Path()
            for p in [cat_folder, folder_name]:
                if p and str(p).strip() and str(p) != ".":
                    sub_path_obj = sub_path_obj / p
            
            target_subpath = str(sub_path_obj).replace("\\", "/")
            
        elif match.item_type in [ItemType.SERIES, ItemType.SEASON, ItemType.EPISODE]:
            context = self.build_tv_context(item, match, loc)
            target_name = self.format_episode_filename(context)
                
            cat_folder = self.get_category_folder("series", match)
            series_folder = self.format_series_foldername(context)
            season_folder = self.format_season_foldername(context)
            
            sub_path_obj = Path()
            for p in [cat_folder, series_folder, season_folder]:
                if p and str(p).strip() and str(p) != ".":
                    sub_path_obj = sub_path_obj / p
            
            target_subpath = str(sub_path_obj).replace("\\", "/")
        else:
            target_name = item.filename
            target_subpath = ""

        # Normalize slashes
        target_subpath = target_subpath.replace("\\", "/")
        target_name = target_name.replace("\\", "/")

        dest_root = self.config.library_path if self.config.move_to_library and self.config.library_path else os.path.dirname(item.current_path)

        preview = RenamePreview(
            item_id=item.id,
            original_path=item.current_path,
            target_name=target_name,
            target_subpath=target_subpath,
            item_type=match.item_type.value,
            destination_root=dest_root,
            source_size=item.size,
            source_duration=item.duration,
            source_resolution=item.resolution,
            source_video_bitrate=item.video_bitrate
        )
        self.resolve_collisions([preview])
        self._check_path_lengths(preview)
        return preview

    def plan_rename(self, match: MediaMatch, destination_root: str) -> RenamePreview:
        """
        Generates a comprehensive renaming plan for a media item and all its extras.
        Validates path lengths and resolves potential filename collisions.
        """
        item = match.media_item
        loc = self._pick_localization(match, item)
        if not loc:
            raise ValueError("No localization available for rename planning")
        
        # 1. Context Building & Route Generation
        is_inplace = not self.config.org_enabled or not self.config.move_to_library or not self.config.library_path
        if is_inplace:
             # No folder structure, only filename change (in-place)
             if match.item_type == ItemType.MOVIE:
                 context = self.build_movie_context(item, match, loc)
                 target_name = self.format_movie_filename(context)
             else:
                 context = self.build_tv_context(item, match, loc)
                 target_name = self.format_episode_filename(context)
             target_subpath = ""
        else:
            if match.item_type == ItemType.MOVIE:
                context = self.build_movie_context(item, match, loc)
                target_name = self.format_movie_filename(context)
                cat_folder = self.get_category_folder("movie", match)
                folder_name = self.format_movie_foldername(context, match)
                target_subpath = str(Path(cat_folder) / folder_name)
            else:
                context = self.build_tv_context(item, match, loc)
                target_name = self.format_episode_filename(context)
                cat_folder = self.get_category_folder("series", match)
                series_folder = self.format_series_foldername(context)
                season_folder = self.format_season_foldername(context)
                target_subpath = str(Path(cat_folder) / series_folder / season_folder)

        # Defining a Destination Folder (Global Library vs In-place)
        effective_root = destination_root
        if self.config.move_to_library and self.config.library_path:
            effective_root = self.config.library_path
        elif not destination_root:
            effective_root = os.path.dirname(item.current_path)

        # 2. Create a main preview
        main_preview = RenamePreview(
            item_id=item.id,
            original_path=item.current_path,
            target_name=target_name,
            target_subpath=target_subpath,
            item_type=match.item_type.value,
            destination_root=effective_root,
            source_size=item.size,
            source_duration=item.duration,
            source_resolution=item.resolution,
            source_video_bitrate=item.video_bitrate
        )

        # 3. Planning extras
        if self.config.extras_enabled:
            parent_name_no_ext = target_name.rsplit(".", 1)[0]
            for extra in item.extras:
                # We determine the action based on the type
                cat = extra.category.value if hasattr(extra.category, 'value') else str(extra.category)
                
                short_cat = cat
                if cat == "subtitle": short_cat = "sub"
                elif cat == "image": short_cat = "img"
                elif cat == "metadata": short_cat = "meta"
                
                action = getattr(self.config, f"extra_{short_cat}_action", "rename")
                
                if action == "ignore":
                    continue
                
                if action == "delete":
                    # Special preview to indicate deletion
                    main_preview.extra_previews.append(RenamePreview(
                        item_id=extra.id,
                        original_path=extra.current_path,
                        target_name="", # Empty name indicates deletion
                        target_subpath="",
                        item_type="extra",
                        destination_root="",
                        action="delete",
                        extra_id=extra.id,
                        warnings=["File will be deleted according to extras settings."]
                    ))
                    continue

                extra_ctx = self.build_extra_context(extra, parent_name_no_ext)
                extra_name = self.format_extra_filename(extra_ctx)
                extra_sub = self.get_extra_subpath(extra)
                
                # Extras are placed in the parent folder (target_subpath) + optional extra_sub
                # Force flat/in-place placement if organization is disabled or bypassed
                is_inplace = not self.config.org_enabled or not self.config.move_to_library or not self.config.library_path
                final_extra_sub = "" if is_inplace else str(Path(target_subpath) / extra_sub)
                
                main_preview.extra_previews.append(RenamePreview(
                    item_id=extra.id,
                    original_path=extra.current_path,
                    target_name=extra_name,
                    target_subpath=final_extra_sub,
                    item_type="extra",
                    destination_root=effective_root,
                    extra_id=extra.id
                ))

        # 4. Resolve collisions
        self.resolve_collisions([main_preview])

        # 5. Path length check
        self._check_path_lengths(main_preview)

        return main_preview

    def _check_path_lengths(self, preview: RenamePreview):
        """Recursively checks path lengths and issues a warning."""
        self.path_resolver.check_path_lengths(preview)

    def resolve_collisions(self, previews: List[RenamePreview]) -> List[RenamePreview]:
        """
        Detects collisions and automatically numbers the extras.
        Modifies the 'previews' list in-place.
        """
        return self.path_resolver.resolve_collisions(previews)

    # =========================================================================
    # Public API - Films
    # =========================================================================

    def format_movie_filename(self, context: Dict[str, Any]) -> str:
        return self._render(self.config.movie_file, context, is_file=True)

    def format_movie_foldername(self, context: Dict[str, Any], match: Optional[MediaMatch] = None) -> str:
        if not self.config.create_movie_subdir:
            return ""
            
        coll_val = context.get("Collection") or context.get("collection")
        if self._should_use_collection_folder(match, coll_val):
            coll_name = self.format_collection_foldername(context)
            movie_name = self._render(self.config.movie_folder, context, is_file=False)
            if coll_name and movie_name:
                return f"{coll_name}/{movie_name}"
            return movie_name or coll_name
            
        return self._render(self.config.movie_folder, context, is_file=False)

    def format_collection_foldername(self, context: Dict[str, Any]) -> str:
        tmpl = self.config.collection_folder or "{Collection}"
        return self._render(tmpl, context, is_file=False)

    def _should_use_collection_folder(self, match: Optional[MediaMatch], collection_value: Any) -> bool:
        if not self.config.create_collection_dir:
            return False
        if not collection_value or not str(collection_value).strip():
            return False

        mode = getattr(self.config, "collection_folder_mode", "threshold")
        if mode == "never":
            return False
        if mode == "always":
            return True
        if mode == "complete_only":
            owned_count = self._count_owned_collection_movies(match)
            total_parts = self._get_collection_total_parts(match)
            return total_parts > 0 and owned_count >= total_parts
        if mode != "threshold":
            return True

        owned_count = self._count_owned_collection_movies(match)
        threshold = max(1, int(getattr(self.config, "collection_folder_threshold", 3) or 3))
        return owned_count >= threshold

    def _count_owned_collection_movies(self, match: Optional[MediaMatch]) -> int:
        if not match or not match.collection_entity:
            return 0

        owned_statuses = {ItemStatus.MATCHED, ItemStatus.ORGANIZED, ItemStatus.RENAMED}
        seen_item_ids = set()
        for related_match in match.collection_entity.matches or []:
            related_item = related_match.media_item
            if not related_item or related_match.item_type != ItemType.MOVIE or not related_match.is_active:
                continue
            if related_item.status not in owned_statuses:
                continue
            seen_item_ids.add(related_item.id)

        current_item = match.media_item
        if current_item and current_item.item_type == ItemType.MOVIE and current_item.id not in seen_item_ids:
            seen_item_ids.add(current_item.id)

        return len(seen_item_ids)

    def _get_collection_total_parts(self, match: Optional[MediaMatch]) -> int:
        if not match or not match.collection_entity:
            return 0
        try:
            return max(0, int(match.collection_entity.total_parts or 0))
        except (TypeError, ValueError):
            return 0

    # =========================================================================
    # Public API - Series
    # =========================================================================

    def format_series_foldername(self, context: Dict[str, Any]) -> str:
        if not self.config.create_series_dir:
            return ""
        return self._render(self.config.series_folder, context, is_file=False)

    def format_season_foldername(self, context: Dict[str, Any]) -> str:
        if not self.config.create_season_dir:
            return ""
        return self._render(self.config.season_folder, context, is_file=False)

    def format_episode_filename(self, context: Dict[str, Any]) -> str:
        return self._render(self.config.episode_file, context, is_file=True)

    def format_extra_filename(self, context: Dict[str, Any]) -> str:
        cat = context.get("category", "")
        if cat == "video":
            tmpl = self.config.extra_video_template
        elif cat == "subtitle":
            tmpl = self.config.extra_sub_template
        elif cat == "audio":
            tmpl = self.config.extra_audio_template
        elif cat == "image":
            tmpl = self.config.extra_img_template
        elif cat == "metadata":
            tmpl = self.config.extra_meta_template
        else:
            tmpl = "{parent_name} {sub_category}"
            
        name = self._render(tmpl, context, is_file=True)
        name = " ".join(name.split())
        return name

    def get_extra_subpath(self, extra) -> str:
        """It returns the subdirectory of the extra file based on the strategy."""
        if self.config.extras_folder_mode == "flat":
            return ""
        return self.config.extras_subfolder_name

    def get_category_folder(self, item_type_value: str, match: Optional[MediaMatch] = None) -> str:
        """It returns the category folder name (Movies/Series), if enabled."""
        if not self.config.sort_by_type:
            return ""
        if match and match.is_adult:
            return self.config.adult_dir_name
        if item_type_value == "movie":
            return self.config.movies_dir_name
        if item_type_value in ["series", "episode"]:
            return self.config.series_dir_name
        return ""

    # =========================================================================
    # Context Builders
    # =========================================================================

    def build_movie_context(self, item, match, loc) -> Dict[str, Any]:
        """Collects variables for a movie."""
        return self.context_builder.build_movie_context(item, match, loc)

    def build_tv_context(self, item, match, loc, children: List[Any] = None) -> Dict[str, Any]:
        """Collects variables for a series/season/episode."""
        return self.context_builder.build_tv_context(item, match, loc, children)

    def build_extra_context(self, extra, parent_formatted_name: str) -> Dict[str, Any]:
        """Collects variables for an extra file."""
        return self.context_builder.build_extra_context(extra, parent_formatted_name)

    # =========================================================================
    # Helper Functions
    # =========================================================================

    def _render(self, template: str, context: Dict[str, Any], is_file: bool = True) -> str:
        """Renders the template and automatically adds the extension if it's a file."""
        return self.renderer.render(template, context, is_file)

    def apply_casing(self, text: str, context: Optional[Dict[str, Any]] = None) -> str:
        return self.renderer.apply_casing(text, context)

    def apply_separator(self, text: str) -> str:
        return self.renderer.apply_separator(text)

    def format_number(self, num, width: int = 2) -> str:
        return self.renderer.format_number(num, width)

    def sanitize(self, text: str) -> str:
        return self.renderer.sanitize(text)
