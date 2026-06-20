import logging
import os
from pathlib import Path
from typing import Optional
from io import BytesIO

import requests
from PIL import Image, UnidentifiedImageError

from app.utils.library_utils.lang import _normalize_language_code
from app.utils.library_utils.image_constants import (
    BACKDROP_MIN_WIDTH,
    BACKDROP_PREFERRED_MIN_WIDTH,
    BACKDROP_PROBE_THUMBNAIL_SIZE,
    BACKDROP_WHITE_PIXEL_THRESHOLD,
    LOGO_DARK_PIXEL_THRESHOLD,
    LOGO_MIN_AVERAGE_LUMINANCE,
    LOGO_PROBE_THUMBNAIL_SIZE,
    MIN_CACHED_IMAGE_BYTES,
    POSTER_SIZE,
    PUBLIC_IMAGE_CACHE_TTL_SECONDS,
    TMDB_IMAGE_BASE_ORIGINAL,
    TMDB_IMAGE_SIZES_BY_SUBFOLDER,
)

logger = logging.getLogger(__name__)

MEDIA_IMAGE_ROOT = Path("data/media/images")
TMDB_IMAGE_BASE = TMDB_IMAGE_BASE_ORIGINAL
_LOGO_DARKNESS_CACHE: dict[str, Optional[tuple[float, float]]] = {}
_BACKDROP_TONE_CACHE: dict[str, Optional[tuple[float, float]]] = {}
_LOGO_PROBE_SESSION = requests.Session()
_IMAGE_PROBE_SESSION = requests.Session()
def _is_remote_image_path(path: Optional[str]) -> bool:
    return bool(path and (path.startswith("http://") or path.startswith("https://")))


def _tmdb_image_url(path: Optional[str], size: str = POSTER_SIZE) -> Optional[str]:
    if not path or _is_remote_image_path(path):
        return path
    clean = path if str(path).startswith("/") else f"/{path}"
    return f"https://image.tmdb.org/t/p/{size}{clean}"


def _tmdb_size_for_subfolder(subfolder: str) -> str:
    return TMDB_IMAGE_SIZES_BY_SUBFOLDER.get(subfolder, POSTER_SIZE)


_IMAGE_EXISTENCE_CACHE = {}

def _public_image_path(path: Optional[str], subfolder: str) -> Optional[str]:
    """Returns the /filename form the frontend expects, if the local file exists."""
    if not path:
        return None
    if _is_remote_image_path(path):
        return path

    cache_key = (path, subfolder)
    import time
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
    if local_file.exists() and local_file.stat().st_size > MIN_CACHED_IMAGE_BYTES:
        res = f"/{filename}"
        
    _IMAGE_EXISTENCE_CACHE[cache_key] = (res, now + PUBLIC_IMAGE_CACHE_TTL_SECONDS)
    return res


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
        rgba.thumbnail(LOGO_PROBE_THUMBNAIL_SIZE)
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
    rgb.thumbnail(BACKDROP_PROBE_THUMBNAIL_SIZE)
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


def _pick_backdrop_path(
    raw_data,
    preferred_language: Optional[str] = None,
    min_width: int = BACKDROP_MIN_WIDTH,
    allow_low_res: bool = True,
) -> Optional[str]:
    raw = raw_data or {}
    backdrops = ((raw.get("images") or {}).get("backdrops") or [])
    main_backdrop_path = raw.get("backdrop_path")

    if not allow_low_res:
        main_is_ok = True
        if main_backdrop_path and backdrops:
            main_is_ok = any(
                bd.get("file_path") == main_backdrop_path and int(bd.get("width") or 0) >= min_width
                for bd in backdrops
            )
        if not main_is_ok:
            main_backdrop_path = None

        backdrops = [bd for bd in backdrops if int(bd.get("width") or 0) >= min_width]

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

    # 1. Try to find a good backdrop >= preferred width first
    fallback_candidate = None
    fallback_tone = None
    for backdrop in ranked_backdrops:
        file_path = backdrop.get("file_path")
        width = int(backdrop.get("width") or 0)
        if not file_path or width < BACKDROP_PREFERRED_MIN_WIDTH:
            continue
        tone = _probe_backdrop_tone(file_path)
        if tone is None:
            return file_path
        if tone[0] <= BACKDROP_WHITE_PIXEL_THRESHOLD:
            return file_path
        if fallback_candidate is None or fallback_tone is None or tone[0] < fallback_tone[0]:
            fallback_candidate = file_path
            fallback_tone = tone

    # 2. If no candidate >= preferred width passed the threshold, look for a good one >= min width
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
