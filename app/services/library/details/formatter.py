import os
from app.utils.library_utils import _public_image_path, _tmdb_size_for_subfolder, _tmdb_image_url, _match_language_code

class DetailFormatterService:
    def resolve_image_response_path(
        self,
        image_path: str | None = None,
        local_image_path: str | None = None,
        subfolder: str = "",
        tmdb_size: str | None = None,
    ):
        local_public = _public_image_path(local_image_path, subfolder) or _public_image_path(image_path, subfolder)
        if local_public:
            return local_public
        size = tmdb_size or _tmdb_size_for_subfolder(subfolder)
        return _tmdb_image_url(image_path, size=size)

    def resolve_logo_response_path(self, logo_path: str | None = None, local_logo_path: str | None = None):
        return self.resolve_image_response_path(logo_path, local_logo_path, "logos")

    def serialize_extra_file(self, extra, parent_label: str | None = None):
        if not extra:
            return None
        return {
            "id": extra.id,
            "name": os.path.basename(extra.current_path or extra.original_path or "") or f"extra_{extra.id}",
            "path": extra.current_path,
            "category": extra.category.value if getattr(extra, "category", None) else None,
            "subtype": extra.subtype.value if getattr(extra, "subtype", None) else None,
            "language": extra.language,
            "parent_label": parent_label,
        }

    def pick_collection_localization(self, collection, ui_lang: str):
        if not collection or not getattr(collection, "localizations", None):
            return None
        from app.services.language_service import LanguageService
        return LanguageService.pick_localization(collection.localizations, [ui_lang] if ui_lang else [])

    def serialize_collection(self, collection, fallback_name: str, ui_lang: str):
        if not collection and not fallback_name:
            return None

        loc = self.pick_collection_localization(collection, ui_lang)
        return {
            "tmdb_id": getattr(collection, "tmdb_id", None),
            "title": (loc.name if loc and loc.name else fallback_name),
            "overview": loc.overview if loc else None,
            "poster_path": (
                _public_image_path(getattr(loc, "manual_local_poster_path", None), "posters")
                or _public_image_path(getattr(loc, "manual_poster_path", None), "posters")
                or getattr(loc, "manual_poster_path", None)
                or _public_image_path(loc.local_poster_path, "posters")
                or loc.poster_path
            ) if loc else None,
            "backdrop_path": (
                _public_image_path(getattr(collection, "manual_local_backdrop_path", None), "backdrops")
                or _public_image_path(getattr(collection, "manual_backdrop_path", None), "backdrops")
                or getattr(collection, "manual_backdrop_path", None)
                or _public_image_path(collection.local_backdrop_path, "backdrops")
                or collection.backdrop_path
            ) if collection else None,
        }
