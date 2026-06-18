from __future__ import annotations

from ...utils.library_helpers import public_image_path as _public_image_path


def resolve_asset_path(
    *,
    subfolder: str,
    manual_local_path: str | None = None,
    manual_path: str | None = None,
    local_path: str | None = None,
    remote_path: str | None = None,
) -> str | None:
    return (
        _public_image_path(manual_local_path, subfolder)
        or _public_image_path(manual_path, subfolder)
        or manual_path
        or _public_image_path(local_path, subfolder)
        or remote_path
    )


def has_local_asset(
    *,
    subfolder: str,
    manual_local_path: str | None = None,
    local_path: str | None = None,
) -> bool:
    return bool(
        _public_image_path(manual_local_path, subfolder)
        or _public_image_path(local_path, subfolder)
    )
