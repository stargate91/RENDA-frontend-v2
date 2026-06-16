import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import object_session
from .tech_parser import TechParser
from ..db.models import PartType, PartStyle, ItemType

logger = logging.getLogger(__name__)

class ContextBuilder:
    """
    Orchestrates the creation of naming contexts for different media types.
    Combines technical metadata with descriptive metadata.
    """

    def __init__(self, config: Any):
        self.config = config
        self.tech_parser = TechParser()

    def build_movie_context(self, item: Any, match: Any, loc: Any) -> Dict[str, Any]:
        """Builds context variables for a Movie."""
        ctx = self.tech_parser.get_tech_context(item)
        collection_name = self._resolve_collection_name(match, loc)
        
        ctx.update({
            "Title": loc.title or "",
            "OriginalTitle": loc.original_title or "",
            "Year": str(match.release_date.year) if match.release_date else "",
            "ReleaseDate": match.release_date.strftime("%Y-%m-%d") if match.release_date else "",
            "Edition": self.tech_parser.format_enum_val(item.edition),
            "Source": self.tech_parser.format_source(item.source),
            "AudioType": self.tech_parser.format_enum_val(item.audio_type),
            "Custom": self.config.custom_text,
            "ImdbId": match.imdb_id or "",
            "TmdbId": str(match.tmdb_id) if match.tmdb_id else "",
            "RatingImdb": str(match.rating_imdb) if match.rating_imdb else "",
            "Collection": collection_name,
            "ext": item.extension or "",
        })

        part_label, part_val, part_sep = self._build_part_info(item)
        ctx.update({"PartType": part_label, "Part": part_val, "PartSep": part_sep})
        return ctx

    def build_tv_context(self, item: Any, match: Any, loc: Any, children: List[Any] = None) -> Dict[str, Any]:
        """Builds context variables for Series, Seasons, and Episodes."""
        ctx = self.tech_parser.get_tech_context(item)
        if children:
            mixed_res = self.tech_parser.calculate_mixed_resolution(children)
            ctx["Resolution"] = mixed_res
            ctx["resolution"] = mixed_res

        first_air_date, last_air_date = self._resolve_air_dates(match)
        first_air_year = str(first_air_date.year) if first_air_date else ""
        last_air_year = str(last_air_date.year) if last_air_date else ""
        if first_air_year and last_air_year:
            year_range = first_air_year if first_air_year == last_air_year else f"{first_air_year}-{last_air_year}"
        elif first_air_year:
            year_range = f"{first_air_year}-"
        else:
            year_range = ""

        ctx.update({
            "SeriesTitle": loc.series_title or loc.title or "",
            "ShowTitle": loc.series_title or loc.title or "",
            "SeriesOriginalTitle": loc.original_series_title or "",
            "ShowOriginalTitle": loc.original_series_title or "",
            "SeriesTmdbId": str(match.series_tmdb_id or match.tmdb_id or ""),
            "FirstAirDate": first_air_date.strftime("%Y-%m-%d") if first_air_date else "",
            "FirstAirYear": first_air_year,
            "LastAirDate": last_air_date.strftime("%Y-%m-%d") if last_air_date else "",
            "LastAirYear": last_air_year,
            "YearRange": year_range,
            
            "SeasonNumber": self._format_number(match.season_number),
            "Season": self._format_number(match.season_number),
            "SeasonName": loc.season_title or "",
            
            "EpisodeNumber": self._format_number(match.episode_number),
            "Episode": self._format_number(match.episode_number),
            "EpisodeTitle": loc.episode_title or (loc.title if loc.title != loc.series_title else ""),
            
            "Custom": self.config.custom_text,
            "ext": item.extension or "",
        })

        part_label, part_val, part_sep = self._build_part_info(item)
        ctx.update({"PartType": part_label, "Part": part_val, "PartSep": part_sep})
        return ctx

    def build_extra_context(self, extra: Any, parent_formatted_name: str) -> Dict[str, Any]:
        """Builds context variables for Extra files."""
        sub_cat = extra.subtype.value.replace("_", " ").title() if extra.subtype else ""
        category = extra.category.value if hasattr(extra.category, "value") else str(extra.category or "")
        if category.lower() == "metadata" and sub_cat.lower() == (extra.extension or "").lower().strip("."):
            sub_cat = ""

        return {
            "ParentName": parent_formatted_name,
            "Category": category,
            "category": category,
            "SubCategory": sub_cat,
            "sub_category": sub_cat,
            "Language": extra.language.upper() if extra.language else "",
            "language": extra.language.upper() if extra.language else "",
            "ext": extra.extension or "",
            "custom": self.config.custom_text
        }

    def _build_part_info(self, item: Any) -> (str, str, str):
        """Calculates part-related naming components."""
        label = self.config.part_keyword
        val = ""
        sep = self.config.part_separator.value
        
        if item.part is not None:
            if item.part_type and item.part_type != PartType.NONE:
                label = item.part_type.value
            
            style = item.part_style
            from .utils import to_roman, to_alpha
            if style == PartStyle.ROMAN or (not style and self.config.part_numbering == "roman"):
                val = to_roman(item.part)
            elif style == PartStyle.ALPHA or (not style and self.config.part_numbering == "alpha"):
                val = to_alpha(item.part)
            else:
                val = str(item.part)
                
        return label, val, sep

    def _format_number(self, num: Any, prefix_multi: str = "") -> str:
        """Formats season/episode numbers with zero padding if enabled."""
        if num is None or str(num).strip() == "": return ""
        import json
        
        if isinstance(num, str):
            num = num.strip()
            if num.startswith("[") and num.endswith("]"):
                try:
                    num = json.loads(num)
                except:
                    pass
            elif "," in num:
                num = [n.strip() for n in num.split(",")]

        try:
            if isinstance(num, list) and len(num) > 0:
                parts = []
                for i, n in enumerate(num):
                    formatted_n = self._format_single_num(n)
                    if prefix_multi:
                        parts.append(f"{prefix_multi}{formatted_n}")
                    elif i > 0:
                        parts.append(f"{prefix_multi}{formatted_n}")
                    else:
                        parts.append(formatted_n)
                return "-".join(parts)
            return self._format_single_num(num)
        except:
            return str(num)

    def _resolve_collection_name(self, match: Any, loc: Any) -> str:
        collection = getattr(match, "collection_entity", None)
        localizations = getattr(collection, "localizations", None) if collection else None
        if localizations:
            from ..services.language_service import LanguageService
            locale = getattr(loc, "locale", None)
            locales = [locale] if locale else []
            localized = LanguageService.pick_localization(localizations, locales)
            if localized and localized.name:
                return localized.name
        return getattr(match, "collection", None) or ""

    def _resolve_air_dates(self, match: Any) -> tuple[Optional[datetime], Optional[datetime]]:
        first_air_date = getattr(match, "first_air_date", None)
        last_air_date = getattr(match, "last_air_date", None)
        if first_air_date and last_air_date:
            return first_air_date, last_air_date

        try:
            session = object_session(match)
            if not session:
                return first_air_date, last_air_date

            from ..db.models import TMDBCache

            cache_entries = session.query(TMDBCache).filter(TMDBCache.tmdb_id == getattr(match, "tmdb_id", None)).all()
            for entry in cache_entries:
                raw_data = entry.raw_data or {}
                if not first_air_date and raw_data.get("first_air_date"):
                    try:
                        first_air_date = datetime.strptime(raw_data["first_air_date"], "%Y-%m-%d")
                    except Exception:
                        pass
                if not last_air_date and raw_data.get("last_air_date"):
                    try:
                        last_air_date = datetime.strptime(raw_data["last_air_date"], "%Y-%m-%d")
                    except Exception:
                        pass
                if first_air_date and last_air_date:
                    break
        except Exception:
            return first_air_date, last_air_date

        return first_air_date, last_air_date

    def _format_single_num(self, n: Any) -> str:
        if self.config.zero_pad:
            return f"{int(n):02d}"
        return str(n)
