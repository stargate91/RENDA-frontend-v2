from typing import Optional
from app.services.language_service import LanguageService

def _preferred_metadata_language(db) -> str:
    return LanguageService.get_preferred_locale(db)


def _preferred_metadata_languages(db) -> list[str]:
    return LanguageService.get_preferred_locales(db)


def _match_language_code(lang_a: Optional[str], lang_b: Optional[str]) -> bool:
    return LanguageService.matches_locale(lang_a, lang_b)


def _normalize_language_code(language: Optional[str]) -> Optional[str]:
    return LanguageService.normalize_locale(language)


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
