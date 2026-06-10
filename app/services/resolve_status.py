from __future__ import annotations

from app.db.models import ItemStatus, ItemType


def _has_episode_value(episode) -> bool:
    if isinstance(episode, list):
        return len(episode) > 0
    return episode not in (None, "")


def determine_resolved_media_shape(media_kind, season=None, episode=None):
    if media_kind in (ItemType.MOVIE, "movie"):
        return ItemType.MOVIE, ItemStatus.MATCHED

    has_season = season not in (None, "")
    has_episode = _has_episode_value(episode)

    if has_season and has_episode:
        return ItemType.EPISODE, ItemStatus.MATCHED
    if has_season:
        return ItemType.SEASON, ItemStatus.UNCERTAIN
    if has_episode:
        return ItemType.EPISODE, ItemStatus.UNCERTAIN
    return ItemType.SERIES, ItemStatus.UNCERTAIN
