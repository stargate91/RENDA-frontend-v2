import logging
import logging
import os
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs, urlsplit
from io import BytesIO

import requests
from PIL import Image, UnidentifiedImageError
from sqlalchemy.exc import IntegrityError

from app.db.models import UserSetting, VirtualMediaState, VirtualEpisodeState, CustomListItem, OMDBCache, ItemType, Person, PersonLocalization, ImageStatus, TMDBCache

logger = logging.getLogger(__name__)

MEDIA_IMAGE_ROOT = Path("data/media/images")
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original"
_LOGO_DARKNESS_CACHE: dict[str, Optional[tuple[float, float]]] = {}
_BACKDROP_TONE_CACHE: dict[str, Optional[tuple[float, float]]] = {}
_LOGO_PROBE_SESSION = requests.Session()
_IMAGE_PROBE_SESSION = requests.Session()
LOGO_DARK_PIXEL_THRESHOLD = 0.2
LOGO_MIN_AVERAGE_LUMINANCE = 0.32
BACKDROP_MIN_WIDTH = 2560
BACKDROP_WHITE_PIXEL_THRESHOLD = 0.58

def _preferred_metadata_language(db) -> str:
    return _preferred_metadata_languages(db)[0]


def _preferred_metadata_languages(db) -> list[str]:
    langs: list[str] = []
    for key in ("fallback_metadata_language", "ui_language", "primary_metadata_language"):
        setting = db.query(UserSetting).filter(UserSetting.key == key).first()
        if not setting or not setting.value:
            continue
        token = str(setting.value).strip()
        if not token or token.lower() == "none":
            continue
        if token not in langs:
            langs.append(token)
    return langs or ["en"]


def _match_language_code(lang_a: Optional[str], lang_b: Optional[str]) -> bool:
    if not lang_a or not lang_b:
        return False
    a = str(lang_a).lower()
    b = str(lang_b).lower()
    return a == b or a.split("-", 1)[0] == b.split("-", 1)[0]


def _normalize_language_code(language: Optional[str]) -> Optional[str]:
    if not language:
        return None
    normalized = str(language).strip().lower()
    if not normalized:
        return None
    return normalized.split("-", 1)[0]


def _pick_logo_path(raw_data, preferred_language: Optional[str] = None) -> Optional[str]:
    images = (raw_data or {}).get("images") or {}
    logos = images.get("logos") or []
    if not logos:
        return None

    preferred_langs = []
    normalized_preferred = str(preferred_language or "").split("-", 1)[0].strip().lower()
    if normalized_preferred:
        preferred_langs.append(normalized_preferred)
    preferred_langs.extend(["en", None, ""])

    def base_logo_score(logo):
        lang = logo.get("iso_639_1")
        normalized_lang = lang.lower() if isinstance(lang, str) else lang
        try:
            lang_rank = preferred_langs.index(normalized_lang)
        except ValueError:
            lang_rank = len(preferred_langs)
        width = int(logo.get("width") or 0)
        vote_average = float(logo.get("vote_average") or 0)
        vote_count = int(logo.get("vote_count") or 0)
        file_type = str(logo.get("file_type") or "").lower()
        return (lang_rank, -vote_count, -vote_average, -width, 0 if file_type == ".svg" else 1)

    def measure_logo_darkness(image: Image.Image) -> Optional[tuple[float, float]]:
        rgba = image.convert("RGBA")
        rgba.thumbnail((256, 256))
        dark_pixels = 0.0
        weighted_luminance = 0.0
        total_alpha = 0.0
        for red, green, blue, alpha in rgba.getdata():
            if alpha <= 0:
                continue
            alpha_weight = alpha / 255.0
            luminance = ((0.2126 * red) + (0.7152 * green) + (0.0722 * blue)) / 255.0
            if luminance < 0.22:
                dark_pixels += alpha_weight
            weighted_luminance += luminance * alpha_weight
            total_alpha += alpha_weight
        if total_alpha <= 0:
            return None
        return (dark_pixels / total_alpha, weighted_luminance / total_alpha)

    def probe_logo_darkness(file_path: str) -> Optional[tuple[float, float]]:
        cached_darkness = _LOGO_DARKNESS_CACHE.get(file_path)
        if file_path in _LOGO_DARKNESS_CACHE:
            return cached_darkness

        suffix = Path(file_path).suffix.lower()
        if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
            _LOGO_DARKNESS_CACHE[file_path] = None
            return None

        local_file = MEDIA_IMAGE_ROOT / "logos" / file_path.lstrip("/")
        try:
            if local_file.exists():
                with Image.open(local_file) as image:
                    darkness = measure_logo_darkness(image)
                    _LOGO_DARKNESS_CACHE[file_path] = darkness
                    return darkness
        except (OSError, UnidentifiedImageError) as exc:
            logger.debug("Failed to inspect local logo %s: %s", local_file, exc)

        try:
            response = _LOGO_PROBE_SESSION.get(f"{TMDB_IMAGE_BASE}{file_path}", timeout=(3, 10))
            response.raise_for_status()
            with Image.open(BytesIO(response.content)) as image:
                darkness = measure_logo_darkness(image)
        except Exception as exc:
            logger.debug("Failed to probe TMDB logo %s: %s", file_path, exc)
            darkness = None

        _LOGO_DARKNESS_CACHE[file_path] = darkness
        return darkness

    ranked_logos = sorted(logos, key=base_logo_score)
    best_language_rank = base_logo_score(ranked_logos[0])[0]
    same_language_candidates = [logo for logo in ranked_logos if base_logo_score(logo)[0] == best_language_rank][:6]

    fallback_candidate = None
    fallback_darkness = None
    for logo in same_language_candidates:
        file_path = logo.get("file_path")
        if not file_path:
            continue
        darkness = probe_logo_darkness(file_path)
        if darkness is None:
            if fallback_candidate is None:
                fallback_candidate = logo
            continue
        if darkness[0] <= LOGO_DARK_PIXEL_THRESHOLD and darkness[1] >= LOGO_MIN_AVERAGE_LUMINANCE:
            return file_path
        if (
            fallback_candidate is None
            or fallback_darkness is None
            or fallback_darkness[0] > darkness[0]
        ):
            fallback_candidate = logo
            fallback_darkness = darkness

    picked = fallback_candidate or ranked_logos[0]

    return picked.get("file_path")


def _measure_backdrop_tone(image: Image.Image) -> Optional[tuple[float, float]]:
    rgb = image.convert("RGB")
    rgb.thumbnail((320, 180))
    bright_pixels = 0
    total_pixels = 0
    luminance_total = 0.0
    for red, green, blue in rgb.getdata():
        luminance = ((0.2126 * red) + (0.7152 * green) + (0.0722 * blue)) / 255.0
        if luminance >= 0.84:
            bright_pixels += 1
        luminance_total += luminance
        total_pixels += 1
    if total_pixels <= 0:
        return None
    return (bright_pixels / total_pixels, luminance_total / total_pixels)


def _probe_backdrop_tone(file_path: str) -> Optional[tuple[float, float]]:
    if file_path in _BACKDROP_TONE_CACHE:
        return _BACKDROP_TONE_CACHE[file_path]

    suffix = Path(file_path).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
        _BACKDROP_TONE_CACHE[file_path] = None
        return None

    local_file = MEDIA_IMAGE_ROOT / "backdrops" / file_path.lstrip("/")
    try:
        if local_file.exists():
            with Image.open(local_file) as image:
                tone = _measure_backdrop_tone(image)
                _BACKDROP_TONE_CACHE[file_path] = tone
                return tone
    except (OSError, UnidentifiedImageError) as exc:
        logger.debug("Failed to inspect local backdrop %s: %s", local_file, exc)

    try:
        response = _IMAGE_PROBE_SESSION.get(f"{TMDB_IMAGE_BASE}{file_path}", timeout=(3, 10))
        response.raise_for_status()
        with Image.open(BytesIO(response.content)) as image:
            tone = _measure_backdrop_tone(image)
    except Exception as exc:
        logger.debug("Failed to probe TMDB backdrop %s: %s", file_path, exc)
        tone = None

    _BACKDROP_TONE_CACHE[file_path] = tone
    return tone


def _pick_backdrop_path(raw_data, preferred_language: Optional[str] = None, min_width: int = BACKDROP_MIN_WIDTH) -> Optional[str]:
    raw = raw_data or {}
    backdrops = ((raw.get("images") or {}).get("backdrops") or [])
    main_backdrop_path = raw.get("backdrop_path")

    if not backdrops:
        return main_backdrop_path

    def backdrop_score(backdrop):
        vote_count = int(backdrop.get("vote_count") or 0)
        vote_average = float(backdrop.get("vote_average") or 0)
        width = int(backdrop.get("width") or 0)
        height = int(backdrop.get("height") or 0)
        return (-vote_count, -vote_average, -width, -height)

    ranked_all_backdrops = sorted(backdrops, key=backdrop_score)

    neutral_backdrops = [
        backdrop for backdrop in backdrops
        if backdrop.get("iso_639_1") in (None, "")
    ]

    if not neutral_backdrops:
        return ranked_all_backdrops[0].get("file_path") or main_backdrop_path

    ranked_backdrops = sorted(neutral_backdrops, key=backdrop_score)

    fallback_candidate = None
    fallback_tone = None
    for backdrop in ranked_backdrops:
        file_path = backdrop.get("file_path")
        width = int(backdrop.get("width") or 0)
        if not file_path or width < min_width:
            continue
        tone = _probe_backdrop_tone(file_path)
        if tone is None:
            return file_path
        if tone[0] <= BACKDROP_WHITE_PIXEL_THRESHOLD:
            return file_path
        if fallback_candidate is None or fallback_tone is None or tone[0] < fallback_tone[0]:
            fallback_candidate = file_path
            fallback_tone = tone

    return fallback_candidate or ranked_all_backdrops[0].get("file_path") or main_backdrop_path or ranked_backdrops[0].get("file_path")


def _pick_trailer_key(
    raw_data,
    preferred_language: Optional[str] = None,
    original_language: Optional[str] = None,
) -> Optional[str]:
    videos = ((raw_data or {}).get("videos") or {}).get("results") or []
    if not videos:
        return None

    preferred_lang = _normalize_language_code(preferred_language)
    original_lang = _normalize_language_code(original_language)

    preferred_langs: list[Optional[str]] = []
    for candidate in (preferred_lang, "en", original_lang, None, ""):
        if candidate not in preferred_langs:
            preferred_langs.append(candidate)

    candidates = [
        video for video in videos
        if video.get("site") == "YouTube" and video.get("type") in ("Trailer", "Teaser")
    ]
    if not candidates:
        return None

    def trailer_score(video):
        lang = _normalize_language_code(video.get("iso_639_1"))
        try:
            lang_rank = preferred_langs.index(lang)
        except ValueError:
            lang_rank = len(preferred_langs)
        video_type = str(video.get("type") or "")
        official_rank = 0 if video.get("official") else 1
        type_rank = 0 if video_type == "Trailer" else 1
        size_rank = -int(video.get("size") or 0)
        return (lang_rank, type_rank, official_rank, size_rank)

    picked = sorted(candidates, key=trailer_score)[0]
    return picked.get("key")


def _pick_tmdb_cache(db, tmdb_id: Optional[int], media_type: str, preferred_languages: list[str]):
    if not tmdb_id:
        return None
    endpoint_prefix = f"/{media_type}/{tmdb_id}"
    caches = []
    for cache in db.query(TMDBCache).filter(TMDBCache.tmdb_id == tmdb_id).all():
        cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
        if not cache_key.startswith(endpoint_prefix):
            continue
        suffix = cache_key[len(endpoint_prefix):]
        if suffix == "" or suffix.startswith("?"):
            caches.append(cache)
    if not caches:
        return None
    if len(caches) == 1:
        return caches[0]

    def _cache_language(cache: TMDBCache) -> str:
        cache_key = cache.cache_key if isinstance(cache.cache_key, str) else ""
        try:
            parsed = urlsplit(cache_key)
            parsed_language = str((parse_qs(parsed.query).get("language") or [""])[0] or "")
            if parsed_language:
                return parsed_language
        except Exception:
            pass
        return str(cache.target_language or "")

    def rank_for(cache: TMDBCache) -> tuple[int, float]:
        cache_lang = _cache_language(cache)
        for idx, preferred in enumerate(preferred_languages):
            if _match_language_code(cache_lang, preferred):
                return idx, -cache.updated_at.timestamp()
        if _match_language_code(cache_lang, "en"):
            return len(preferred_languages), -cache.updated_at.timestamp()
        return len(preferred_languages) + 1, -cache.updated_at.timestamp()

    return sorted(caches, key=rank_for)[0]


def _pick_match_localization(match, preferred_languages: list[str]):
    if not match or not match.localizations:
        return None
    for preferred in preferred_languages:
        loc = next(
            (entry for entry in match.localizations if _match_language_code(entry.target_language, preferred)),
            None,
        )
        if loc:
            return loc
    return next((entry for entry in match.localizations if entry.is_primary), None) or match.localizations[0]


def _resolve_virtual_catalog_metadata(
    db,
    tmdb_id: int,
    media_type: str,
    preferred_languages: list[str],
    terminal_series_statuses: Optional[set[str]] = None,
) -> tuple[str, Optional[int], Optional[str], Optional[str]]:
    terminal_series_statuses = terminal_series_statuses or {"ended", "canceled", "cancelled"}
    title, year, year_display, poster = "Unknown TMDB Item", None, None, None

    list_item = (
        db.query(CustomListItem)
        .filter(
            CustomListItem.tmdb_id == tmdb_id,
            CustomListItem.media_type == media_type,
        )
        .order_by(CustomListItem.id.desc())
        .first()
    )
    if list_item and (list_item.title or "").strip():
        title = list_item.title.strip()
    if list_item and list_item.poster_path:
        poster = _public_image_path(list_item.poster_path, "posters") or list_item.poster_path

    cached = _pick_tmdb_cache(db, tmdb_id, media_type, preferred_languages)
    if cached and isinstance(cached.raw_data, dict):
        cdata = cached.raw_data
        if not list_item or not (list_item.title or "").strip():
            title = cdata.get("title") or cdata.get("name") or title
        if not poster:
            poster = _public_image_path(cdata.get("poster_path"), "posters") or cdata.get("poster_path")
        release_date = cdata.get("release_date") or cdata.get("first_air_date")
        if release_date and len(release_date) >= 4:
            try:
                year = int(release_date[:4])
            except (TypeError, ValueError):
                year = None
        if media_type == "tv" and str(cdata.get("status") or "").lower() in terminal_series_statuses:
            first_air_date = cdata.get("first_air_date")
            last_air_date = cdata.get("last_air_date")
            if first_air_date and last_air_date and len(first_air_date) >= 4 and len(last_air_date) >= 4:
                first_year = first_air_date[:4]
                last_year = last_air_date[:4]
                year_display = first_year if first_year == last_year else f"{first_year}-{last_year}"

    return title, year, year_display, poster

def _is_remote_image_path(path: Optional[str]) -> bool:
    return bool(path and (path.startswith("http://") or path.startswith("https://")))

def _tmdb_image_url(path: Optional[str], size: str = "w500") -> Optional[str]:
    if not path or _is_remote_image_path(path):
        return path
    clean = path if str(path).startswith("/") else f"/{path}"
    return f"https://image.tmdb.org/t/p/{size}{clean}"

def _tmdb_size_for_subfolder(subfolder: str) -> str:
    return {
        "posters": "w500",
        "stills": "w400",
        "backdrops": "w1280",
        "logos": "original",
        "persons": "h632",
    }.get(subfolder, "w500")

def _fetch_tv_season_detail(tmdb_client, series_id: int, season_number: int, language: str) -> dict:
    detail = {}
    try:
        detail = tmdb_client.get_season_details(series_id, season_number, language=language) or {}
    except Exception:
        detail = {}

    if not detail.get("episodes"):
        try:
            fallback = tmdb_client.get_season_details(series_id, season_number, language="en-US") or {}
            if fallback.get("episodes"):
                detail = fallback
        except Exception:
            pass

    return detail if isinstance(detail, dict) else {}

_IMAGE_EXISTENCE_CACHE = {}

def _public_image_path(path: Optional[str], subfolder: str) -> Optional[str]:
    """Returns the /filename form the frontend expects, if the local file exists."""
    if not path:
        return None
    if _is_remote_image_path(path):
        return path

    import time
    cache_key = (path, subfolder)
    now = time.time()
    if cache_key in _IMAGE_EXISTENCE_CACHE:
        val, expiry = _IMAGE_EXISTENCE_CACHE[cache_key]
        if now < expiry:
            return val

    clean_path = path.replace("\\", "/")
    marker = f"media/images/{subfolder}/"
    filename = clean_path.split(marker, 1)[1] if marker in clean_path else clean_path.lstrip("/")
    local_file = MEDIA_IMAGE_ROOT / subfolder / filename
    
    res = None
    if local_file.exists() and local_file.stat().st_size > 100:
        res = f"/{filename}"
        
    _IMAGE_EXISTENCE_CACHE[cache_key] = (res, now + 15)
    return res

def _get_virtual_media_state(db, tmdb_id: int, media_type: str):
    return db.query(VirtualMediaState).filter(
        VirtualMediaState.tmdb_id == tmdb_id,
        VirtualMediaState.media_type == media_type,
    ).first()

def _get_virtual_episode_state(db, series_tmdb_id: int, season_number: int, episode_number: int):
    return db.query(VirtualEpisodeState).filter(
        VirtualEpisodeState.series_tmdb_id == series_tmdb_id,
        VirtualEpisodeState.season_number == season_number,
        VirtualEpisodeState.episode_number == episode_number,
    ).first()

def _is_virtual_media_tracked(db, tmdb_id: int, media_type: str) -> bool:
    state = _get_virtual_media_state(db, tmdb_id, media_type)
    if state is not None:
        return bool(getattr(state, "is_tracked", True))
    return db.query(CustomListItem.id).filter(
        CustomListItem.tmdb_id == tmdb_id,
        CustomListItem.media_type == media_type,
    ).first() is not None

def _get_omdb_ratings_from_imdb(db, imdb_id: Optional[str]) -> dict:
    if not imdb_id:
        return {}
    cache = db.query(OMDBCache).filter(OMDBCache.imdb_id == imdb_id).first()
    return cache.raw_data if cache and isinstance(cache.raw_data, dict) else {}

def _parse_omdb_float(value):
    if value in (None, "", "N/A"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

def _parse_omdb_int(value):
    if value in (None, "", "N/A"):
        return None
    try:
        return int(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None

def _serialize_playback_logs(item) -> list[dict]:
    return [
        {
            "id": log.id,
            "watched_at": log.watched_at.isoformat(),
        }
        for log in sorted(getattr(item, "playback_logs", []) or [], key=lambda x: x.watched_at, reverse=True)
        if getattr(log, "watched_at", None)
    ]

def _series_folder_path(item) -> Optional[str]:
    if not item or not getattr(item, "current_path", None):
        return None
    current_path = item.current_path
    if getattr(item, "item_type", None) == ItemType.SERIES:
        return current_path
    parent = Path(current_path).parent
    parent_name = parent.name.lower()
    if parent_name.startswith("season ") or parent_name.startswith("specials"):
        return str(parent.parent)
    return str(parent)

def _best_series_level_match(items) -> Optional["MediaMatch"]:
    candidates = []
    for item in items or []:
        for match in getattr(item, "matches", []) or []:
            if not getattr(match, "is_active", False):
                continue
            candidates.append(match)

    if not candidates:
        return None

    def _rank(match):
        item_type = getattr(match, "item_type", None)
        return {
            ItemType.SERIES: 0,
            ItemType.SEASON: 1,
            ItemType.EPISODE: 2,
            ItemType.MOVIE: 3,
        }.get(item_type, 99)

    ranked = sorted(candidates, key=_rank)
    best_rank = _rank(ranked[0])
    same_level = [m for m in ranked if _rank(m) == best_rank]
    preferred = next((m for m in same_level if any([
        m.rating_imdb is not None,
        m.vote_count_imdb is not None,
        m.rating_rotten,
        m.rating_meta is not None,
    ])), None)
    return preferred or same_level[0]

def _resolve_person_profile_path(person) -> Optional[str]:
    """Resolves the best profile path to return for a person, prioritizing custom and local images."""
    if not person:
        return None
    local_path = _public_image_path(person.local_profile_path, "persons")
    if local_path:
        return local_path
    profile_path = _public_image_path(person.profile_path, "persons")
    if profile_path:
        return profile_path
    return person.profile_path if _is_remote_image_path(person.profile_path) else None

def _download_media_assets_sync(
    poster_path: Optional[str] = None,
    backdrop_path: Optional[str] = None,
    logo_path: Optional[str] = None,
    cast_profiles: Optional[list] = None,
    season_posters: Optional[list] = None,
    stills: Optional[list] = None
):
    """
    Downloads media assets in parallel using ThreadPoolExecutor.
    Blocks until all downloads are completed or timed out.
    """
    from concurrent.futures import ThreadPoolExecutor
    from app.services.asset_service import AssetService
    
    asset_service = AssetService()
    tasks = []
    
    # 1. Poster
    if poster_path and not poster_path.startswith("http"):
        tasks.append(("posters", poster_path, "w500"))
        
    # 2. Backdrop
    if backdrop_path and not backdrop_path.startswith("http"):
        tasks.append(("backdrops", backdrop_path, "w1280"))

    # 2.5. Logo
    if logo_path and not logo_path.startswith("http"):
        tasks.append(("logos", logo_path, "original"))
        
    # 3. Cast/Crew profiles
    if cast_profiles:
        for profile in cast_profiles:
            if profile and not profile.startswith("http"):
                tasks.append(("persons", profile, "h632"))
                
    # 4. Season posters
    if season_posters:
        for sp in season_posters:
            if sp and not sp.startswith("http"):
                tasks.append(("posters", sp, "w500"))

    if stills:
        for still in stills:
            if still and not still.startswith("http"):
                tasks.append(("stills", still, "w400"))

    if not tasks:
        return

    seen = set()
    unique_tasks = []
    for task in tasks:
        key = (task[0], task[1])
        if key in seen:
            continue
        seen.add(key)
        unique_tasks.append(task)

    def _download_task(args):
        import time
        subfolder, tmdb_path, size = args
        for attempt in range(3):
            try:
                if asset_service.download_image(tmdb_path, subfolder, size=size):
                    return
            except Exception as e:
                if attempt == 2:
                    logger.warning(f"Failed sync download of {tmdb_path} to {subfolder}: {e}")
            time.sleep(0.35 * (attempt + 1))
        logger.warning(f"Sync download missing after retries: {tmdb_path} -> {subfolder}")

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(_download_task, unique_tasks))

def _ensure_person_cached(db, actor_id: int, actor_name: str, actor_profile_path: Optional[str], actor_popularity: Optional[float], ui_lang: str) -> Optional[str]:
    """
    Checks if a person exists in the database. If not, creates them with ImageStatus.PENDING so they get cached by the ImageWorker.
    Returns the local profile path if already downloaded, or the TMDB URL if pending.
    """
    if not actor_profile_path:
        return None

    lang_code = ui_lang.split("-")[0] if ui_lang else "en"

    person = db.query(Person).filter(Person.id == actor_id).first()
    if not person:
        try:
            person = Person(
                id=actor_id,
                popularity=actor_popularity,
                profile_path=actor_profile_path,
                image_status=ImageStatus.PENDING,
                is_active=False
            )
            
            # If the image was downloaded synchronously, mark as downloaded immediately
            if actor_profile_path:
                local_file_path = os.path.join("data", "media", "images", "persons", actor_profile_path.lstrip("/"))
                if os.path.exists(local_file_path):
                    person.local_profile_path = actor_profile_path
                    person.image_status = ImageStatus.COMPLETED

            db.add(person)
            db.add(PersonLocalization(person_id=actor_id, language=lang_code, name=actor_name))
            db.commit()
        except IntegrityError:
            db.rollback()
            person = db.query(Person).filter(Person.id == actor_id).first()
            if not person:
                logger.warning(f"Person insert raced but existing row was not found: {actor_id}")
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating virtual Person: {e}")
            person = db.query(Person).filter(Person.id == actor_id).first()

    if person:
        updated = False
        if not person.profile_path and actor_profile_path:
            person.profile_path = actor_profile_path
            person.image_status = ImageStatus.PENDING
            updated = True
        elif person.image_status == ImageStatus.FAILED and actor_profile_path:
            person.image_status = ImageStatus.PENDING
            updated = True
        
        # If image was downloaded synchronously, update local profile path and status
        if person.profile_path and person.image_status != ImageStatus.COMPLETED:
            local_file_path = os.path.join("data", "media", "images", "persons", person.profile_path.lstrip("/"))
            if os.path.exists(local_file_path):
                person.local_profile_path = person.profile_path
                person.image_status = ImageStatus.COMPLETED
                updated = True

        if actor_name and not db.query(PersonLocalization.id).filter(
            PersonLocalization.person_id == actor_id,
            PersonLocalization.language == lang_code,
        ).first():
            db.add(PersonLocalization(person_id=actor_id, language=lang_code, name=actor_name))
            updated = True

        if updated:
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Error updating Person profile: {e}")

    # Check if local image is available
    resolved = _resolve_person_profile_path(person)
    if resolved:
        if resolved.startswith("http://") or resolved.startswith("https://") or resolved.startswith("/"):
            return resolved
        return f"/{resolved.lstrip('/')}"
            
    return None


def _split_genres(genres: list[str]) -> list[str]:
    result = []
    seen_keys = set()

    genre_aliases = {
        "scifi": "Sci-Fi",
        "sciencefiction": "Sci-Fi",
        "sciencefictionfantasy": "Sci-Fi & Fantasy",
    }

    def _canonicalize_genre_label(raw_genre: str) -> str:
        cleaned = str(raw_genre or "").strip()
        if not cleaned:
            return ""

        normalized_key = "".join(ch for ch in cleaned.casefold() if ch.isalnum())
        alias = genre_aliases.get(normalized_key)
        if alias:
            return alias

        if len(cleaned) == 1:
            return cleaned.upper()
        return cleaned[0].upper() + cleaned[1:]

    for g in genres:
        if not g:
            continue

        parts = []
        if " & " in g:
            parts = g.split(" & ")
        elif " and " in g:
            parts = g.split(" and ")
        elif " és " in g:
            parts = g.split(" és ")
        elif " / " in g:
            parts = g.split(" / ")
        else:
            parts = [g]
        
        for part in parts:
            part_clean = _canonicalize_genre_label(part)
            if not part_clean:
                continue

            part_key = "".join(ch for ch in part_clean.casefold() if ch.isalnum())
            if part_key in seen_keys:
                continue

            seen_keys.add(part_key)
            result.append(part_clean)
    return result
