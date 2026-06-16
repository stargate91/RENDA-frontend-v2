from typing import Any, List, Optional
from sqlalchemy.orm import Session
from app.db.models import UserSetting

class LanguageService:
    """Centralized service for app, UI, and metadata locale resolution."""

    @staticmethod
    def normalize_locale(locale: Optional[str]) -> Optional[str]:
        """Normalize locale string (e.g., 'hu-HU' -> 'hu', 'en_US' -> 'en')."""
        if not locale:
            return None
        cleaned = str(locale).strip().lower().replace("_", "-")
        if not cleaned or cleaned == "none":
            return None
        return cleaned.split("-", 1)[0]

    @classmethod
    def get_preferred_locales(cls, db: Session) -> List[str]:
        """Fetch preferred locales ordered by priority from user settings."""
        locales: List[str] = []
        keys = (
            "default_target_language",
            "fallback_metadata_language",
            "ui_language",
            "primary_metadata_language"
        )
        for key in keys:
            setting = db.query(UserSetting).filter(UserSetting.key == key).first()
            if not setting or not setting.value:
                continue
            normalized = cls.normalize_locale(setting.value)
            if normalized and normalized not in locales:
                locales.append(normalized)
        return locales or ["en"]

    @classmethod
    def get_preferred_locale(cls, db: Session) -> str:
        """Get the single primary preferred metadata locale."""
        return cls.get_preferred_locales(db)[0]

    @classmethod
    def matches_locale(cls, locale_a: Optional[str], locale_b: Optional[str]) -> bool:
        """Check if two locales match after normalization."""
        norm_a = cls.normalize_locale(locale_a)
        norm_b = cls.normalize_locale(locale_b)
        return bool(norm_a and norm_b and norm_a == norm_b)

    @classmethod
    def pick_localization(cls, localizations: List[Any], db_or_locales: Any) -> Optional[Any]:
        """
        Pick the best localization from a list of localization records based on preferred locales.
        db_or_locales can be a list of locales or a DB session.
        """
        if not localizations:
            return None

        # Resolve locales list
        if isinstance(db_or_locales, list):
            locales = db_or_locales
        else:
            locales = cls.get_preferred_locales(db_or_locales)

        # Try to find a match in preferred order
        for preferred in locales:
            for loc in localizations:
                # loc.locale is the renamed column in our new model schema
                loc_locale = getattr(loc, "locale", None) or getattr(loc, "target_language", None) or getattr(loc, "language", None)
                if cls.matches_locale(loc_locale, preferred):
                    return loc

        # Fallback 1: primary localization
        primary = next((l for l in localizations if getattr(l, "is_primary", False)), None)
        if primary:
            return primary

        # Fallback 2: first item in the list
        return localizations[0]
