from urllib.parse import parse_qs, urlsplit
from sqlalchemy import case, func, inspect, literal, or_, select
from sqlalchemy.orm import Session
from ..db.models import CustomListItem, VirtualMediaState
from ..db.models.metadata import TMDBCache

class LibraryVirtualCacheService:
    """
    Helper service for dealing with TMDB cache and virtual list snapshots.
    """

    def __init__(self, db: Session):
        self.db = db

    def table_exists(self, table_name: str) -> bool:
        try:
            return inspect(self.db.bind).has_table(table_name)
        except Exception:
            return False

    def can_join_tmdb_cache_in_main_query(self) -> bool:
        try:
            main_bind = self.db.get_bind(mapper=VirtualMediaState)
            cache_bind = self.db.get_bind(mapper=TMDBCache)
            return bool(main_bind is cache_bind)
        except Exception:
            return False

    def build_virtual_cache_choice_subquery(self, media_type: str, preferred_languages: list[str]):
        cache_lang = func.lower(TMDBCache.target_language)
        language_rank = case(
            *[
                (
                    or_(
                        cache_lang == preferred.lower(),
                        cache_lang == preferred.split("-", 1)[0].lower(),
                    ),
                    idx,
                )
                for idx, preferred in enumerate(preferred_languages)
            ],
            (
                or_(cache_lang == "en", cache_lang.like("en-%")),
                len(preferred_languages),
            ),
            else_=len(preferred_languages) + 1,
        )
        endpoint_prefix = f"/{media_type}/"
        ranked = (
            select(
                TMDBCache.tmdb_id.label("tmdb_id"),
                TMDBCache.raw_data.label("raw_data"),
                func.row_number().over(
                    partition_by=TMDBCache.tmdb_id,
                    order_by=(language_rank.asc(), TMDBCache.updated_at.desc(), TMDBCache.id.desc()),
                ).label("rn"),
            )
            .where(
                TMDBCache.tmdb_id.isnot(None),
                TMDBCache.cache_key.like(f"{endpoint_prefix}%"),
            )
            .subquery()
        )
        return (
            select(
                ranked.c.tmdb_id,
                ranked.c.raw_data,
            )
            .where(ranked.c.rn == 1)
            .subquery()
        )

    def build_virtual_list_snapshot_subquery(self, media_type: str):
        ranked = (
            select(
                literal(media_type).label("media_type"),
                CustomListItem.tmdb_id.label("tmdb_id"),
                CustomListItem.title.label("list_title"),
                CustomListItem.poster_path.label("list_poster_path"),
                func.row_number().over(
                    partition_by=CustomListItem.tmdb_id,
                    order_by=(CustomListItem.id.desc(),),
                ).label("rn"),
            )
            .where(
                CustomListItem.tmdb_id.isnot(None),
                CustomListItem.media_type == media_type,
            )
            .subquery()
        )
        return (
            select(
                ranked.c.media_type,
                ranked.c.tmdb_id,
                ranked.c.list_title,
                ranked.c.list_poster_path,
            )
            .where(ranked.c.rn == 1)
            .subquery()
        )

    def preload_virtual_cache_payload(self, media_type: str, tmdb_ids: list[int], preferred_languages: list[str]) -> dict[int, dict]:
        if not tmdb_ids:
            return {}
        rows = self.db.query(TMDBCache).filter(TMDBCache.tmdb_id.in_(tmdb_ids)).all()
        grouped: dict[int, list[TMDBCache]] = {}
        prefix = f"/{media_type}/"
        for row in rows:
            cache_key = row.cache_key if isinstance(row.cache_key, str) else ""
            if not cache_key.startswith(prefix):
                continue
            grouped.setdefault(int(row.tmdb_id), []).append(row)

        def _rank(cache: TMDBCache) -> tuple[int, float]:
            cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
            cache_lang = ""
            try:
                parsed = urlsplit(cache_key)
                cache_lang = str((parse_qs(parsed.query).get("language") or [""])[0] or "").lower()
            except Exception:
                cache_lang = ""
            if not cache_lang:
                cache_lang = str(cache.target_language or "").lower()
            for idx, preferred in enumerate(preferred_languages):
                preferred_norm = preferred.lower()
                preferred_short = preferred_norm.split("-", 1)[0]
                if cache_lang == preferred_norm or cache_lang == preferred_short:
                    return idx, -cache.updated_at.timestamp()
                if cache_lang.split("-", 1)[0] == preferred_short:
                    return idx, -cache.updated_at.timestamp()
            if cache_lang == "en" or cache_lang.startswith("en-"):
                return len(preferred_languages), -cache.updated_at.timestamp()
            return len(preferred_languages) + 1, -cache.updated_at.timestamp()

        payload: dict[int, dict] = {}
        for tmdb_id, candidates in grouped.items():
            best = sorted(candidates, key=_rank)[0]
            if isinstance(best.raw_data, dict):
                payload[tmdb_id] = best.raw_data
        return payload
