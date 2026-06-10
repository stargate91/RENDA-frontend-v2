import re
import unicodedata
from typing import Any, Optional

MOVIE_LINE_PATTERN = re.compile(r"^\s*(?P<title>.+?)\s*\((?P<year>\d{4})\)\s*$")
TV_OPEN_ENDED_LINE_PATTERN = re.compile(r"^\s*(?P<title>.+?)\s*\((?P<start_year>\d{4})\s*[–-]\s*\)\s*$")
TV_RANGE_LINE_PATTERN = re.compile(r"^\s*(?P<title>.+?)\s*\((?P<start_year>\d{4})\s*[–-]\s*(?P<end_year>\d{4})\)\s*$")

def _parse_bulk_import_rows(raw_text: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    valid_rows = []
    ignored_rows = []

    for line_number, raw_line in enumerate((raw_text or "").splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue

        movie_match = MOVIE_LINE_PATTERN.match(stripped)
        if movie_match:
            valid_rows.append({
                "line_number": line_number,
                "raw": raw_line,
                "title": movie_match.group("title").strip(),
                "year": int(movie_match.group("year")),
                "media_type": "movie",
            })
            continue

        tv_match = TV_OPEN_ENDED_LINE_PATTERN.match(stripped) or TV_RANGE_LINE_PATTERN.match(stripped)
        if tv_match:
            valid_rows.append({
                "line_number": line_number,
                "raw": raw_line,
                "title": tv_match.group("title").strip(),
                "year": int(tv_match.group("start_year")),
                "media_type": "tv",
            })
            continue

        ignored_rows.append({
            "line_number": line_number,
            "raw": raw_line,
            "reason": "invalid_format",
        })

    return valid_rows, ignored_rows

def _result_year(result: dict[str, Any], media_type: str) -> Optional[int]:
    date_value = result.get("release_date") if media_type == "movie" else result.get("first_air_date")
    if not date_value:
        return None
    try:
        return int(str(date_value).split("-", 1)[0])
    except Exception:
        return None

def _normalize_title(value: Optional[str]) -> str:
    if not value:
        return ""
    dash_normalized = re.sub(r"[\u2013\u2014\-]+", " ", str(value))
    ascii_value = unicodedata.normalize("NFKD", dash_normalized).encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-z0-9]+", " ", ascii_value.lower())
    return " ".join(normalized.split())


def _fold_ascii(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def _title_search_variants(title: str) -> list[str]:
    variants = []
    seen = set()

    def add(value: Optional[str]) -> None:
        candidate = " ".join((value or "").split()).strip()
        if not candidate:
            return
        key = candidate.casefold()
        if key in seen:
            return
        seen.add(key)
        variants.append(candidate)

    add(title)
    dash_normalized = re.sub(r"[\u2013\u2014\-]+", " ", title or "")
    add(dash_normalized)
    for separator in (" – ", " - ", " — ", " –", " -"):
        if separator in (title or ""):
            add((title or "").split(separator, 1)[0])
    return variants


def _build_query_candidates(query: str) -> list[str]:
    candidates = []
    seen = set()

    source_values = []
    for title_variant in _title_search_variants(query):
        source_values.extend([
            title_variant,
            _normalize_title(title_variant),
            _fold_ascii(title_variant),
            _normalize_title(_fold_ascii(title_variant)),
        ])

    for raw in source_values:
        candidate = " ".join((raw or "").split()).strip()
        key = candidate.casefold()
        if candidate and key not in seen:
            seen.add(key)
            candidates.append(candidate)

    return candidates


def _collect_bulk_search_results(
    tmdb,
    query_candidates: list[str],
    media_type: str,
    year: Optional[int],
    include_adult: bool,
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen_ids: set[int] = set()

    for query_value in query_candidates:
        batch = tmdb.search(
            query_value,
            item_type=media_type,
            year=year,
            language=None,
            include_adult=include_adult,
        )
        for result in batch:
            result_id = result.get("id")
            if not result_id or result_id in seen_ids:
                continue
            seen_ids.add(result_id)
            merged.append(result)
        if merged:
            break

    return merged

def _narrow_bulk_results(results: list[dict[str, Any]], media_type: str, year: int) -> list[dict[str, Any]]:
    exact_year = [result for result in results if _result_year(result, media_type) == year]
    return exact_year or results

def _pick_exact_title_match(results: list[dict[str, Any]], title: str) -> Optional[dict[str, Any]]:
    wanted = _normalize_title(title)
    if not wanted:
        return None

    exact = []
    for result in results:
        candidate_titles = [
            result.get("title"),
            result.get("original_title"),
            result.get("name"),
            result.get("original_name"),
        ]
        normalized_titles = {_normalize_title(candidate) for candidate in candidate_titles if candidate}
        if wanted in normalized_titles:
            exact.append(result)

    if len(exact) == 1:
        return exact[0]
    return None


def _resolve_bulk_results(results: list[dict[str, Any]], title: str, media_type: str) -> dict[str, Any]:
    exact_match = _pick_exact_title_match(results, title)
    if exact_match:
        return {"status": "matched", "media_type": media_type, "result": exact_match}

    if len(results) == 1:
        return {"status": "matched", "media_type": media_type, "result": results[0]}

    if results:
        return {"status": "multiple", "media_type": media_type, "results": results}

    return {"status": "no_match"}


def _pick_bulk_search_match(
    tmdb,
    title: str,
    year: int,
    media_type: str,
    include_adult: bool,
) -> dict[str, Any]:
    query_candidates = _build_query_candidates(title)

    merged_results = _collect_bulk_search_results(
        tmdb, query_candidates, media_type, year, include_adult
    )
    results = _narrow_bulk_results(merged_results, media_type, year)
    if not results:
        return {"status": "no_match"}

    if len(results) == 1:
        return {"status": "matched", "media_type": media_type, "result": results[0]}

    return {"status": "multiple", "media_type": media_type, "results": results}
