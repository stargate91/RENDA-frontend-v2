import os
import shutil
import logging
from pathlib import Path
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from ..db.models import MediaItem, ExtraFile, ActionBatch, ActionLog, ActionType, ActionStatus, ItemStatus
from ..formatter.formatter import Formatter, FormatterConfig, RenamePreview
from ..services.file_system_service import FileSystemService

from ..utils.logger import logger

class RenamerEngine:
    """
    Engine responsible for physical file operations (move, rename) and 
    maintaining consistency between the filesystem and the database.
    """

    def __init__(self, db_session: Session):
        self.db = db_session
        self.formatter = Formatter(FormatterConfig.from_db(db_session))
        self.fs = FileSystemService()

    def execute_batch(self, previews: List[RenamePreview], batch_name: Optional[str] = None) -> int:
        """
        Executes a batch of rename operations.
        Returns the count of successfully processed items.
        """
        batch = ActionBatch(name=batch_name)
        self.db.add(batch)
        self.db.commit()

        success_count = 0
        for preview in previews:
            if self.execute_single(preview, batch.id):
                success_count += 1
        
        return success_count

    def execute_single(self, preview: RenamePreview, batch_id: Optional[int] = None, progress_callback=None) -> bool:
        """
        Executes a rename/move operation for a single media item and its associated extras.
        Atomic operation: if any component fails (main file or extra), the entire move 
        is rolled back to the original state.
        """
        item = self.db.query(MediaItem).get(preview.item_id)
        if not item:
            return False
        batch_id = self._ensure_batch_id(batch_id)

        # Track successful moves for rollback
        successful_moves = [] # List[(Path, Path)] - (old_path, target_path)

        try:
            preview_action = self._preview_action(preview)
            if preview_action == "skip":
                self._log_action(batch_id, item_id=item.id, action_type=ActionType.METADATA_UPDATE,
                                status=ActionStatus.SUCCESS, old_val=item.current_path,
                                new_val=item.current_path, error="Skipped due to collision strategy.")
                self.db.commit()
                return True

            old_path = Path(item.current_path)
            target_path = Path(preview.target_path)

            if not old_path.exists():
                raise FileNotFoundError(f"Source not found: {old_path}")

            if target_path.exists() and target_path != old_path:
                if target_path.is_dir():
                    raise FileExistsError(f"Directory exists at target: {target_path}")
                if preview_action == "replace_if_better":
                    if not self._is_better_replacement(item, target_path):
                        self._log_action(batch_id, item_id=item.id, action_type=ActionType.METADATA_UPDATE,
                                        status=ActionStatus.SUCCESS, old_val=item.current_path,
                                        new_val=str(target_path), error="Skipped because existing file is not worse.")
                        self.db.commit()
                        return True
                    self._remove_existing_target(target_path, batch_id, item)
                elif preview_action == "replace":
                    self._remove_existing_target(target_path, batch_id, item)
                else:
                    raise FileExistsError(f"File exists at target: {target_path}")

            # Physical move
            for extra_preview in preview.extra_previews:
                extra = self.db.query(ExtraFile).get(extra_preview.extra_id)
                if not extra:
                    continue

                e_old = Path(extra.current_path)
                if not e_old.exists():
                    raise FileNotFoundError(f"Extra source not found: {e_old}")

                extra_action = self._preview_action(extra_preview)
                if extra_action == "skip":
                    continue

                if extra_action != "delete":
                    e_target = Path(extra_preview.target_path)
                    if e_target.exists() and e_target != e_old:
                        if e_target.is_dir():
                            raise FileExistsError(f"Directory exists at extra target: {e_target}")
                        raise FileExistsError(f"File exists at extra target: {e_target}")

            target_path.parent.mkdir(parents=True, exist_ok=True)
            from app.utils.fs_utils import move_with_progress
            move_with_progress(str(old_path), str(target_path), progress_callback)
            successful_moves.append((old_path, target_path))
            
            # 3. MOVE OR DELETE EXTRAS
            for extra_preview in preview.extra_previews:
                extra = self.db.query(ExtraFile).get(extra_preview.extra_id)
                if not extra: continue

                e_old = Path(extra.current_path)
                
                if not e_old.exists():
                    raise FileNotFoundError(f"Extra source not found: {e_old}")

                extra_action = self._preview_action(extra_preview)
                if extra_action == "skip":
                    continue

                if extra_action == "delete":
                    # Delete
                    self.fs.send_to_trash([e_old])
                    successful_moves.append((e_old, None)) # None indicates it was deleted
                else:
                    # Move
                    e_target = Path(extra_preview.target_path)
                    if e_target.exists() and e_target != e_old:
                        if e_target.is_dir():
                            raise FileExistsError(f"Directory exists at extra target: {e_target}")
                        raise FileExistsError(f"File exists at extra target: {e_target}")
                    e_target.parent.mkdir(parents=True, exist_ok=True)
                    if e_target != e_old:
                        shutil.move(str(e_old), str(e_target))
                        successful_moves.append((e_old, e_target))

            # --- AFTER SUCCESSFUL MOVES: DATABASE UPDATE ---

            # 4. Update main item
            old_item_path = item.current_path
            item.current_path = str(target_path)
            item.status = ItemStatus.RENAMED
            self._log_action(batch_id, item_id=item.id, action_type=ActionType.RENAME, 
                            status=ActionStatus.SUCCESS, old_val=old_item_path, new_val=str(target_path))

            # 5. Update extras
            for extra_preview in preview.extra_previews:
                extra = self.db.query(ExtraFile).get(extra_preview.extra_id)
                if extra:
                    old_e_path = extra.current_path
                    extra_action = self._preview_action(extra_preview)
                    if extra_action == "skip":
                        self._log_action(batch_id, extra_id=extra.id, action_type=ActionType.METADATA_UPDATE,
                                        status=ActionStatus.SUCCESS, old_val=old_e_path,
                                        new_val=old_e_path, error="Skipped due to collision strategy.")
                    elif extra_action == "delete":
                        self.db.delete(extra)
                        self._log_action(batch_id, extra_id=None, action_type=ActionType.DELETE, 
                                        status=ActionStatus.SUCCESS, old_val=old_e_path, new_val=None)
                    else:
                        extra.current_path = extra_preview.target_path
                        self._log_action(batch_id, extra_id=extra.id, action_type=ActionType.RENAME, 
                                        status=ActionStatus.SUCCESS, old_val=old_e_path, new_val=extra_preview.target_path)

            self.db.commit()
            
            # 6. Clean up empty source folder
            self._cleanup_empty_parent(old_path.parent)
            return True

        except Exception as e:
            logger.error(f"Error during rename ({preview.target_name}): {e}")
            self.db.rollback()

            # --- ROLLBACK ---
            if successful_moves:
                logger.info(f"Rolling back {len(successful_moves)} files...")
                for orig_p, curr_p in reversed(successful_moves):
                    try:
                        if curr_p is None:
                            # Deleted file - unfortunately this cannot be easily rolled back (unless put in the recycle bin)
                            logger.warning(f"Cannot rollback deleted file: {orig_p}")
                        elif curr_p.exists():
                            shutil.move(str(curr_p), str(orig_p))
                    except Exception as re:
                        logger.critical(f"CRITICAL: Rollback failed ({curr_p} -> {orig_p}): {re}")

            # Save error to database
            self._log_action(batch_id, item_id=item.id, action_type=ActionType.RENAME, 
                            status=ActionStatus.FAILED, old_val=item.current_path, 
                            new_val=preview.target_path, error=str(e))
            self.db.commit()
            return False

    def _execute_extra_move(self, extra: ExtraFile, target_path_str: str, batch_id: int):
        """Move a single extra file."""
        old_path = Path(extra.current_path)
        new_path = Path(target_path_str)
        
        if old_path.exists():
            if new_path.exists() and new_path != old_path:
                if new_path.is_dir():
                    raise FileExistsError(f"Directory exists at extra target: {new_path}")
                raise FileExistsError(f"File exists at extra target: {new_path}")
            new_path.parent.mkdir(parents=True, exist_ok=True)
            if new_path != old_path:
                shutil.move(str(old_path), str(new_path))
            
            old_current = extra.current_path
            extra.current_path = str(new_path)
            
            self._log_action(batch_id, extra_id=extra.id, action_type=ActionType.RENAME, 
                            status=ActionStatus.SUCCESS, old_val=old_current, new_val=str(new_path))

    def _ensure_batch_id(self, batch_id: Optional[int]) -> int:
        """Creates an ad-hoc batch when execute_single is called directly."""
        if batch_id is not None:
            return batch_id

        batch = ActionBatch(name="Single rename")
        self.db.add(batch)
        self.db.commit()
        return batch.id

    def _preview_action(self, preview: RenamePreview) -> str:
        """Normalizes preview actions from config/UI values."""
        return str(getattr(preview, "action", "rename") or "rename").strip().lower()

    def _remove_existing_target(self, target_path: Path, batch_id: int, source_item: MediaItem):
        from ..db.models import CustomListItem, PlaybackLog
        target_item = self.db.query(MediaItem).filter(MediaItem.current_path == str(target_path)).first()
        if target_item:
            # Migrate user state
            source_item.watch_count = max(source_item.watch_count or 0, target_item.watch_count or 0)
            source_item.is_watched = source_item.is_watched or target_item.is_watched
            source_item.is_favorite = source_item.is_favorite or target_item.is_favorite
            if not source_item.user_rating and target_item.user_rating:
                source_item.user_rating = target_item.user_rating
            if not source_item.resume_position and target_item.resume_position:
                source_item.resume_position = target_item.resume_position
            if not source_item.last_watched_at and target_item.last_watched_at:
                source_item.last_watched_at = target_item.last_watched_at

            # Migrate tags
            for tag in target_item.tags:
                if tag not in source_item.tags:
                    source_item.tags.append(tag)

            # Re-link custom list items
            list_items = self.db.query(CustomListItem).filter(CustomListItem.media_item_id == target_item.id).all()
            for li in list_items:
                li.media_item_id = source_item.id

            # Re-link playback logs
            for log in target_item.playback_logs:
                log.media_item_id = source_item.id

            # Re-link extras that are not being explicitly replaced
            # (We only migrate extras that have different original paths than the new extras)
            new_extra_paths = {e.original_path for e in source_item.extras}
            for ext in target_item.extras:
                if ext.original_path not in new_extra_paths:
                    ext.parent_item_id = source_item.id

            self._log_action(batch_id, item_id=target_item.id, action_type=ActionType.DELETE,
                            status=ActionStatus.SUCCESS, old_val=target_item.current_path,
                            new_val=None, error="Replaced by collision strategy.")
            self.db.delete(target_item)
            self.db.flush()
        
        if target_path.exists():
            try:
                target_path.unlink()
            except: pass

    def _is_better_replacement(self, source_item: MediaItem, target_path: Path) -> bool:
        target_item = self.db.query(MediaItem).filter(MediaItem.current_path == str(target_path)).first()
        if not target_item:
            return False

        tolerance = getattr(self.formatter.config, "collision_duration_tolerance_seconds", 10) or 10
        if source_item.duration and target_item.duration:
            if abs(float(source_item.duration) - float(target_item.duration)) > tolerance:
                return False

        return self._quality_score(source_item) > self._quality_score(target_item)

    def _quality_score(self, item: MediaItem):
        return (
            self._resolution_height(item.resolution),
            item.video_bitrate or 0,
            item.size or 0,
        )

    def _resolution_height(self, resolution: str) -> int:
        if not resolution:
            return 0
        text = str(resolution).lower()
        if "x" in text:
            try:
                return int(text.split("x")[-1].strip().rstrip("p"))
            except ValueError:
                return 0
        digits = "".join(ch for ch in text if ch.isdigit())
        return int(digits) if digits else 0

    def _log_action(self, batch_id, item_id=None, extra_id=None, action_type=None, status=None, old_val=None, new_val=None, error=None):
        """Log operation to database."""
        log = ActionLog(
            batch_id=batch_id,
            media_item_id=item_id,
            extra_file_id=extra_id,
            action_type=action_type,
            status=status,
            old_value=old_val,
            new_value=new_val,
            error_message=error
        )
        self.db.add(log)

    def undo_batch(self, batch_id: int, progress_callback=None, stop_check=None) -> int:
        """
        Visszavonja egy adott batch összes műveletét.
        Visszaadja a sikeresen visszavont műveletek számát.
        """
        logs = self.db.query(ActionLog).filter(
            ActionLog.batch_id == batch_id,
            ActionLog.status == ActionStatus.SUCCESS
        ).order_by(ActionLog.id.desc()).all() # REVERSE ORDER!

        undo_count = 0
        total = len(logs)
        for i, log in enumerate(logs):
            if stop_check and stop_check():
                break
            if self._undo_single(log):
                undo_count += 1
            if progress_callback:
                progress_callback(i + 1, total)
        
        return undo_count

    def _undo_single(self, log: ActionLog) -> bool:
        """Undo a single operation."""
        try:
            if log.action_type not in [ActionType.RENAME, ActionType.MOVE]:
                return False

            new_path = Path(log.new_value)
            old_path = Path(log.old_value)

            if not new_path.exists():
                logger.error(f"Undo hiba: A fájl már nem található a célhelyen: {new_path}")
                log.status = ActionStatus.FAILED
                log.error_message = "File missing at destination"
                self.db.commit()
                return False

            # Move back
            old_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(new_path), str(old_path))

            # DB update
            if log.media_item_id:
                item = self.db.query(MediaItem).get(log.media_item_id)
                if item:
                    item.current_path = str(old_path)
                    item.status = ItemStatus.MATCHED # Restore to MATCHED status
            elif log.extra_file_id:
                extra = self.db.query(ExtraFile).get(log.extra_file_id)
                if extra:
                    extra.current_path = str(old_path)

            log.status = ActionStatus.UNDONE
            self.db.commit()

            # Clean up at target location (where the file previously was)
            self._cleanup_empty_parent(new_path.parent)
            
            return True

        except Exception as e:
            logger.exception(f"Undo hiba: {e}")
            self.db.rollback()
            return False

    def _cleanup_empty_parent(self, path: Path):
        """
        Recursively removes empty parent directories up the hierarchy.
        Includes guards to prevent deleting drive roots or the library root.
        """
        try:
            # 1. Stop if we reached the root of the filesystem
            if not path or path.parent == path:
                return

            # 2. Stop if it's a drive root (Windows)
            if len(path.parts) <= 1:
                return

            # 3. Check if this is a protected path (e.g. library root)
            # We fetch this dynamically or can pass it in. For now, let's check settings if available.
            protected_paths = set()
            try:
                from ..db.models import UserSetting
                # Cache or fetch once? For simplicity in this method, we fetch if not already provided.
                # However, it's better to protect common sensitive paths.
                lib_path_setting = self.db.query(UserSetting).filter(UserSetting.key == "folder_library_path").first()
                if lib_path_setting and lib_path_setting.value:
                    protected_paths.add(Path(lib_path_setting.value).resolve())
            except:
                pass

            if path.resolve() in protected_paths:
                logger.debug(f"Cleanup stopped: {path} is a protected library root.")
                return

            # 4. Actual removal if empty
            if path.exists() and path.is_dir() and not any(path.iterdir()):
                logger.info(f"Cleaning up empty directory: {path}")
                path.rmdir()
                # Recurse upwards
                self._cleanup_empty_parent(path.parent)
        except Exception as e:
            logger.debug(f"Cleanup failed for {path}: {e}")
