from typing import Iterable, List

from sqlalchemy.orm import Session

from app.db.models import (
    ActionLog,
    CustomListItem,
    ExtraFile,
    MediaItem,
    MediaMatch,
    MediaPersonLink,
    MetadataLocalization,
    PlaybackLog,
    media_item_tags,
)


def _unique_ids(ids: Iterable[int]) -> List[int]:
    return sorted({int(item_id) for item_id in ids if item_id is not None})


def _collect_match_tree_ids(db: Session, root_ids: Iterable[int]) -> List[int]:
    all_ids = set(_unique_ids(root_ids))
    frontier = set(all_ids)

    while frontier:
        child_ids = {
            row.id
            for row in db.query(MediaMatch.id)
            .filter(MediaMatch.parent_id.in_(frontier))
            .all()
        }
        child_ids -= all_ids
        all_ids.update(child_ids)
        frontier = child_ids

    return sorted(all_ids)


def delete_media_matches_by_ids(db: Session, match_ids: Iterable[int]) -> int:
    ids = _collect_match_tree_ids(db, match_ids)
    if not ids:
        return 0

    db.query(MediaPersonLink).filter(MediaPersonLink.media_match_id.in_(ids)).delete(synchronize_session=False)
    db.query(MetadataLocalization).filter(MetadataLocalization.match_id.in_(ids)).delete(synchronize_session=False)
    db.query(MediaMatch).filter(MediaMatch.id.in_(ids)).delete(synchronize_session=False)
    return len(ids)


def delete_media_matches_for_items(db: Session, item_ids: Iterable[int]) -> int:
    ids = _unique_ids(item_ids)
    if not ids:
        return 0

    match_ids = [
        row.id
        for row in db.query(MediaMatch.id)
        .filter(MediaMatch.media_item_id.in_(ids))
        .all()
    ]
    return delete_media_matches_by_ids(db, match_ids)


def delete_extra_files_by_ids(db: Session, extra_ids: Iterable[int]) -> int:
    ids = _unique_ids(extra_ids)
    if not ids:
        return 0

    db.query(ActionLog).filter(ActionLog.extra_file_id.in_(ids)).update(
        {ActionLog.extra_file_id: None},
        synchronize_session=False,
    )
    deleted = db.query(ExtraFile).filter(ExtraFile.id.in_(ids)).delete(synchronize_session=False)
    return deleted


def delete_media_items_by_ids(db: Session, item_ids: Iterable[int]) -> int:
    ids = _unique_ids(item_ids)
    if not ids:
        return 0

    extra_ids = [
        row.id
        for row in db.query(ExtraFile.id)
        .filter(ExtraFile.parent_item_id.in_(ids))
        .all()
    ]

    delete_media_matches_for_items(db, ids)
    delete_extra_files_by_ids(db, extra_ids)

    db.query(ActionLog).filter(ActionLog.media_item_id.in_(ids)).update(
        {ActionLog.media_item_id: None},
        synchronize_session=False,
    )
    db.query(PlaybackLog).filter(PlaybackLog.media_item_id.in_(ids)).delete(synchronize_session=False)
    db.query(CustomListItem).filter(CustomListItem.media_item_id.in_(ids)).delete(synchronize_session=False)
    db.execute(media_item_tags.delete().where(media_item_tags.c.media_item_id.in_(ids)))

    deleted = db.query(MediaItem).filter(MediaItem.id.in_(ids)).delete(synchronize_session=False)
    return deleted
