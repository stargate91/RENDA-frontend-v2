import logging
import threading
import time
import os
import traceback
from typing import List

from app.db.base import Session
from app.db.models import (
    MediaItem, MediaMatch, ItemStatus, ItemType, UserSetting, 
    ImageStatus, MetadataLocalization, MediaCollectionLocalization, CustomListItem, VirtualMediaState, ActionBatch, Person
)
from app.scanner.metadata_enricher import MetadataEnricher
from app.scanner.scanner_manager import update_scan_status
from app.api.tmdb_client import TMDBClient
from app.services.asset_service import AssetService
from app.services.person_service import PersonService
from app.formatter.formatter import Formatter, FormatterConfig
from app.renamer.renamer_engine import RenamerEngine
from app.services.resolve_status import determine_resolved_media_shape
from app.utils.library_utils import _pick_logo_path

logger = logging.getLogger(__name__)
language_sync_status = {"active": False}
language_sync_lock = threading.Lock()


class MetadataService:
    @staticmethod
    def is_language_sync_active():
        with language_sync_lock:
            return bool(language_sync_status["active"])

    @staticmethod
    def run_sync_language():
        def _run_sync():
            db = Session()
            try:
                sync_pending_setting = db.query(UserSetting).filter(UserSetting.key == "language_sync_pending").first()
                if sync_pending_setting:
                    sync_pending_setting.value = "true"
                else:
                    db.add(UserSetting(key="language_sync_pending", value="true"))
                db.commit()

                with language_sync_lock:
                    language_sync_status["active"] = True

                lang = db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
                fallback = db.query(UserSetting).filter(UserSetting.key == "fallback_metadata_language").first()
                
                target_lang = lang.value if lang else "en"
                fallback_lang = fallback.value if fallback and fallback.value != "none" else None
                sync_langs = [target_lang]
                if fallback_lang and fallback_lang != target_lang:
                    sync_langs.append(fallback_lang)

                items = db.query(MediaItem).filter(MediaItem.status.in_([
                    ItemStatus.MATCHED, ItemStatus.RENAMED, ItemStatus.ORGANIZED,
                    ItemStatus.UNCERTAIN, ItemStatus.MULTIPLE
                ])).all()

                local_movie_ids = set()
                local_series_ids = set()
                active_matches = db.query(MediaMatch).join(MediaItem).filter(
                    MediaMatch.is_active == True,
                    MediaItem.status.in_([ItemStatus.ORGANIZED, ItemStatus.RENAMED])
                ).all()
                for match in active_matches:
                    if match.item_type == ItemType.MOVIE:
                        if match.tmdb_id:
                            local_movie_ids.add(match.tmdb_id)
                    else:
                        if match.series_tmdb_id:
                            local_series_ids.add(match.series_tmdb_id)
                        if match.tmdb_id:
                            local_series_ids.add(match.tmdb_id)

                def _normalize_media_type(media_type):
                    value = str(media_type or "movie").strip().lower()
                    if value in {"tv", "series", "show"}:
                        return "tv"
                    return "movie"

                def _ensure_virtual_state(tmdb_id, media_type):
                    normalized_media_type = _normalize_media_type(media_type)
                    state = db.query(VirtualMediaState).filter(
                        VirtualMediaState.tmdb_id == tmdb_id,
                        VirtualMediaState.media_type == normalized_media_type,
                    ).first()
                    if not state:
                        db.add(VirtualMediaState(
                            tmdb_id=tmdb_id,
                            media_type=normalized_media_type,
                            custom_tags=[],
                            is_tracked=True,
                        ))
                        db.flush()
                        return
                    if not bool(getattr(state, "is_tracked", True)):
                        state.is_tracked = True
                        db.flush()

                virtual_targets = {}

                for row in db.query(CustomListItem.tmdb_id, CustomListItem.media_type).filter(CustomListItem.tmdb_id != None).all():
                    media_type = _normalize_media_type(row.media_type)
                    if media_type == "movie" and row.tmdb_id in local_movie_ids:
                        continue
                    if media_type == "tv" and row.tmdb_id in local_series_ids:
                        continue
                    _ensure_virtual_state(row.tmdb_id, media_type)
                    virtual_targets[(media_type, row.tmdb_id)] = True

                for row in db.query(VirtualMediaState.tmdb_id, VirtualMediaState.media_type).all():
                    media_type = _normalize_media_type(row.media_type)
                    if media_type == "movie" and row.tmdb_id in local_movie_ids:
                        continue
                    if media_type == "tv" and row.tmdb_id in local_series_ids:
                        continue
                    virtual_targets[(media_type, row.tmdb_id)] = True

                total_units = len(items) + len(virtual_targets)

                update_scan_status({
                    "active": True,
                    "phase": "resolving",
                    "total": total_units,
                    "current": 0,
                    "start_time": time.time(),
                    "message": "Syncing metadata language..."
                })

                enricher = MetadataEnricher(db)
                tmdb = TMDBClient(db)
                asset_service = AssetService()
                person_service = PersonService(db)
                progress_count = 0
                pending_item_writes = 0
                sync_commit_batch_size = 50

                def _match_language_code(lang_a, lang_b):
                    if not lang_a or not lang_b:
                        return False
                    a = str(lang_a).lower()
                    b = str(lang_b).lower()
                    return a == b or a.split("-", 1)[0] == b.split("-", 1)[0]

                def _missing_sync_languages(match):
                    existing_langs = [loc.locale for loc in match.localizations]
                    return [
                        lang_code
                        for lang_code in sync_langs
                        if not any(_match_language_code(existing, lang_code) for existing in existing_langs)
                    ]

                def _refresh_planned_path(item, active_match):
                    try:
                        from app.formatter.formatter import Formatter, FormatterConfig

                        loc = next(
                            (l for l in active_match.localizations if _match_language_code(l.locale, target_lang)),
                            None,
                        )
                        if not loc and active_match.localizations:
                            loc = next((l for l in active_match.localizations if l.is_primary), active_match.localizations[0])
                        if loc:
                            formatter = Formatter(FormatterConfig.from_db(db))
                            item.planned_path = formatter.format_item(item, active_match, loc).target_path
                    except Exception as path_ex:
                        logger.error(f"Failed to refresh planned path during language sync for item {item.id}: {path_ex}")

                def _download_if_present(path_value, subfolder, size):
                    if not path_value or path_value.startswith("http"):
                        return
                    try:
                        asset_service.download_image(path_value, subfolder, size=size)
                    except Exception as asset_ex:
                        logger.error(f"Failed to download synced asset {path_value}: {asset_ex}")

                def _collect_people(details, media_type):
                    credits = details.get("aggregate_credits", {}) if media_type == "tv" else details.get("credits", {})
                    if not credits or not credits.get("cast"):
                        credits = details.get("credits", {})

                    cast = credits.get("cast", [])[:20]
                    crew = credits.get("crew", [])

                    if media_type == "movie":
                        creators = [p for p in crew if p.get("job") == "Director"][:2]
                        creator_job = "Director"
                    else:
                        creators = details.get("created_by", [])
                        if not creators:
                            for person in crew:
                                if "jobs" in person:
                                    if any(j.get("job") in ["Executive Producer", "Director"] for j in person["jobs"] if isinstance(j, dict)):
                                        creators.append(person)
                                elif person.get("job") in ["Executive Producer", "Director"]:
                                    creators.append(person)
                        creators = creators[:2]
                        creator_job = "Creator"

                    processed_ids = set()
                    people = []
                    for person in creators:
                        if not person.get("id"):
                            continue
                        people.append((person, creator_job))
                        processed_ids.add(person["id"])

                    for person in cast:
                        if not person.get("id") or person["id"] in processed_ids:
                            continue
                        people.append((person, "Actor"))
                        processed_ids.add(person["id"])

                    return people

                def _sync_virtual_title(media_type, tmdb_id):
                    normalized_media_type = _normalize_media_type(media_type)
                    primary_details = None
                    fetch_langs = list(reversed(sync_langs))

                    for lang_code in fetch_langs:
                        details = tmdb.get_details(tmdb_id, normalized_media_type, language=lang_code)
                        if details and lang_code == target_lang:
                            primary_details = details

                    if not primary_details:
                        return

                    synced_title = (
                        primary_details.get("name") or primary_details.get("title") or str(tmdb_id)
                    ) if normalized_media_type == "tv" else (
                        primary_details.get("title") or primary_details.get("name") or str(tmdb_id)
                    )
                    synced_poster_path = primary_details.get("poster_path")
                    db.query(CustomListItem).filter(
                        CustomListItem.tmdb_id == tmdb_id,
                        CustomListItem.media_type.in_(
                            ["tv", "series", "show"] if normalized_media_type == "tv" else ["movie"]
                        ),
                    ).update(
                        {
                            "title": synced_title,
                            "poster_path": synced_poster_path,
                        },
                        synchronize_session=False,
                    )

                    _download_if_present(primary_details.get("poster_path"), "posters", "w500")
                    _download_if_present(primary_details.get("backdrop_path"), "backdrops", "w1280")
                    _download_if_present(_pick_logo_path(primary_details, target_lang), "logos", "original")

                    for person_data, _job in _collect_people(primary_details, normalized_media_type):
                        person_id = person_data.get("id")
                        if not person_id:
                            continue

                        person = db.query(Person).filter(
                            Person.id == person_id,
                            Person.is_active == True,
                        ).first()
                        if not person:
                            continue

                        profile_path = person_data.get("profile_path")
                        if profile_path:
                            _download_if_present(profile_path, "persons", "h632")

                        updated = False
                        if person_data.get("popularity") and not person.popularity:
                            person.popularity = person_data.get("popularity")
                            updated = True
                        if profile_path and not person.profile_path:
                            person.profile_path = profile_path
                            if person.image_status == ImageStatus.NONE:
                                person.image_status = ImageStatus.PENDING
                            updated = True
                        if updated:
                            db.flush()

                        person_service.enrich_person_metadata(person.id, sync_langs)
                
                for index, item in enumerate(items):
                    update_scan_status({
                        "current": progress_count,
                        "current_item": item.filename,
                        "message": f"Syncing {progress_count + 1}/{total_units} items..."
                    })
                    try:
                        previous_backdrop_path = None
                        active_match = next((match for match in item.matches if match.is_active), None)
                        if active_match:
                            previous_backdrop_path = active_match.backdrop_path

                        previous_logo_paths = {
                            loc.locale: loc.logo_path
                            for match in item.matches
                            if match.is_active
                            for loc in match.localizations
                        }
                        missing_langs = _missing_sync_languages(active_match) if active_match else []

                        if active_match:
                            primary_sync_lang = sync_langs[0]
                            fallback_sync_lang = sync_langs[1] if len(sync_langs) > 1 else None
                            enricher.enrich_matched_item(
                                item,
                                language=primary_sync_lang,
                                fallback_language=fallback_sync_lang,
                                include_ratings=False,
                                commit=False,
                            )
                            if not missing_langs:
                                _refresh_planned_path(item, active_match)

                        for match in item.matches:
                            if match.is_active:
                                if active_match:
                                    match.image_status = ImageStatus.PENDING
                                backdrop_changed = previous_backdrop_path != match.backdrop_path
                                logo_changed = any(
                                    previous_logo_paths.get(loc.locale) != loc.logo_path
                                    for loc in match.localizations
                                )
                                if logo_changed:
                                    match.image_status = ImageStatus.PENDING
                                if backdrop_changed:
                                    match.backdrop_status = ImageStatus.PENDING
                    except Exception as item_ex:
                        logger.error(f"Error enriching item {item.id} during lang sync: {item_ex}")
                        db.rollback()
                        pending_item_writes = 0
                    else:
                        pending_item_writes += 1
                        if pending_item_writes >= sync_commit_batch_size:
                            db.commit()
                            pending_item_writes = 0
                    
                    progress_count += 1
                    update_scan_status({
                        "current": progress_count,
                        "message": f"Syncing {progress_count}/{total_units} items..."
                    })

                if pending_item_writes:
                    db.commit()
                    pending_item_writes = 0

                for media_type, tmdb_id in virtual_targets.keys():
                    update_scan_status({
                        "current": progress_count,
                        "current_item": "",
                        "message": f"Syncing {progress_count + 1}/{total_units} items..."
                    })
                    try:
                        _sync_virtual_title(media_type, tmdb_id)
                    except Exception as virtual_ex:
                        logger.error(f"Error syncing virtual {media_type} {tmdb_id}: {virtual_ex}")

                    progress_count += 1
                    update_scan_status({
                        "current": progress_count,
                        "message": f"Syncing {progress_count}/{total_units} items..."
                    })

                db.query(MetadataLocalization).filter(MetadataLocalization.locale == target_lang).update({"is_primary": True})
                db.query(MetadataLocalization).filter(MetadataLocalization.locale != target_lang).update({"is_primary": False})
                db.query(MediaCollectionLocalization).filter(MediaCollectionLocalization.locale == target_lang).update({"is_primary": True})
                db.query(MediaCollectionLocalization).filter(MediaCollectionLocalization.locale != target_lang).update({"is_primary": False})
                
                sync_pending_setting = db.query(UserSetting).filter(UserSetting.key == "language_sync_pending").first()
                if sync_pending_setting:
                    sync_pending_setting.value = "false"
                db.commit()

                update_scan_status({
                    "current": total_units,
                    "current_item": "",
                    "message": "Metadata language sync completed."
                })

            except Exception as e:
                db.rollback()
                logger.error(f"Error syncing language: {e}")
                logger.error(traceback.format_exc())
            finally:
                with language_sync_lock:
                    language_sync_status["active"] = False
                update_scan_status({
                    "active": False,
                    "phase": "idle",
                    "total": 0,
                    "current": 0,
                    "current_item": "",
                    "message": ""
                })
                db.close()
                Session.remove()

        threading.Thread(target=_run_sync, daemon=True).start()

    @staticmethod
    def resolve_metadata(db: Session, request_data: dict):
        item_id = request_data.get("item_id")
        targets_raw = request_data.get("targets", [])
        
        item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
        if not item:
            raise ValueError("Item not found")
            
        original_status = item.status
        
        db.query(MediaMatch).filter(MediaMatch.media_item_id == item.id).update({"is_active": False})
        
        targets = []
        if not targets_raw and request_data.get("tmdb_id"):
            targets.append({
                "tmdb_id": request_data.get("tmdb_id"),
                "item_type": request_data.get("item_type"),
                "season": request_data.get("season"),
                "episode": request_data.get("episode"),
                "episodes": request_data.get("episodes")
            })
        else:
            targets = targets_raw

        if not targets:
            raise ValueError("No targets provided")

        tv_groups = {}
        series_only_targets = []
        movie_targets = []

        for target in targets:
            item_type_val = target.get("item_type")
            season = target.get("season")
            if item_type_val in ["tv", "series", "season", "episode"]:
                if season is None:
                    series_only_targets.append(target)
                    continue
                key = (target.get("tmdb_id"), season)
                if key not in tv_groups:
                    tv_groups[key] = []
                
                eps = target.get("episodes") or []
                if target.get("episode") is not None:
                    eps.append(target.get("episode"))
                
                tv_groups[key].extend(eps)
            else:
                movie_targets.append(target)

        final_item_type = ItemType.MOVIE
        final_status = ItemStatus.MATCHED
        active_match = None

        for target in series_only_targets:
            resolved_item_type, resolved_status = determine_resolved_media_shape("tv", None, target.get("episode"))
            final_item_type = resolved_item_type
            final_status = resolved_status

            match = db.query(MediaMatch).filter(
                MediaMatch.media_item_id == item.id,
                MediaMatch.tmdb_id == target.get("tmdb_id"),
                MediaMatch.series_tmdb_id == target.get("tmdb_id"),
            ).first()

            if not match:
                match = MediaMatch(
                    media_item_id=item.id,
                    tmdb_id=target.get("tmdb_id"),
                    series_tmdb_id=target.get("tmdb_id"),
                    item_type=resolved_item_type,
                    episode_number=target.get("episode"),
                    is_active=True,
                    confidence_score=1.0,
                )
                db.add(match)
            else:
                match.is_active = True
                match.item_type = resolved_item_type
                match.series_tmdb_id = target.get("tmdb_id")
                match.episode_number = target.get("episode")
                match.confidence_score = 1.0

            active_match = match

        for (tmdb_id, season), episodes in tv_groups.items():
            episodes = sorted(list(set(episodes)))
            target_episode = episodes if len(episodes) > 1 else (episodes[0] if episodes else None)
            m_type, resolved_status = determine_resolved_media_shape("tv", season, target_episode)
            final_item_type = m_type
            final_status = resolved_status

            match = db.query(MediaMatch).filter(
                MediaMatch.media_item_id == item.id,
                MediaMatch.tmdb_id == tmdb_id,
                MediaMatch.season_number == season
            ).first()

            if not match:
                match = MediaMatch(
                    media_item_id=item.id,
                    tmdb_id=tmdb_id,
                    series_tmdb_id=tmdb_id,
                    item_type=m_type,
                    season_number=season,
                    episode_number=target_episode,
                    is_active=True,
                    confidence_score=1.0
                )
                db.add(match)
            else:
                match.is_active = True
                match.item_type = m_type
                match.episode_number = target_episode
                match.season_number = season
                match.series_tmdb_id = tmdb_id
                match.confidence_score = 1.0
            
            active_match = match

        for target in movie_targets:
            m_type = ItemType.MOVIE
            final_item_type = m_type
            final_status = ItemStatus.MATCHED

            match = db.query(MediaMatch).filter(
                MediaMatch.media_item_id == item.id,
                MediaMatch.tmdb_id == target.get("tmdb_id"),
                MediaMatch.item_type == m_type
            ).first()

            if not match:
                match = MediaMatch(
                    media_item_id=item.id,
                    tmdb_id=target.get("tmdb_id"),
                    item_type=m_type,
                    is_active=True,
                    confidence_score=1.0
                )
                db.add(match)
            else:
                match.is_active = True
                match.confidence_score = 1.0
            
            active_match = match

        if original_status in [ItemStatus.RENAMED, ItemStatus.ORGANIZED]:
            item.status = original_status
        else:
            item.status = final_status

        item.item_type = final_item_type
        db.commit()
        
        lang = db.query(UserSetting).filter(UserSetting.key == "primary_metadata_language").first()
        fallback = db.query(UserSetting).filter(UserSetting.key == "fallback_metadata_language").first()
        
        enricher = MetadataEnricher(db)
        enricher.enrich_matched_item(
            item, 
            language=lang.value if lang else "en",
            fallback_language=fallback.value if fallback and fallback.value != "none" else None
        )
        
        if original_status in [ItemStatus.RENAMED, ItemStatus.ORGANIZED]:
            try:
                db.refresh(item)
                new_active_match = next((m for m in item.matches if m.is_active), None)
                if new_active_match:
                    formatter = Formatter(FormatterConfig.from_db(db))
                    engine = RenamerEngine(db)
                    
                    batch = ActionBatch(name=f"Manual Correction: {item.filename}")
                    db.add(batch)
                    db.commit()
                    
                    dest_root = formatter.config.library_path if formatter.config.move_to_library and formatter.config.library_path else os.path.dirname(item.current_path)
                    preview = formatter.plan_rename(new_active_match, dest_root)
                    
                    success = engine.execute_single(preview, batch.id)
                    if not success:
                        logger.error(f"Failed to physically rename/move item during manual correction: {item.filename}")
            except Exception as re_err:
                logger.error(f"Error during manual correction renaming: {re_err}")
        
        return active_match.id if active_match else None

    @staticmethod
    def bulk_resolve_metadata(db: Session, request_data: dict):
        item_ids = [int(item_id) for item_id in (request_data.get("item_ids") or [])]
        targets = request_data.get("targets") or []

        if not item_ids:
            raise ValueError("No item_ids provided")
        if not targets:
            raise ValueError("No targets provided")

        updated_match_ids = []

        for item_id in item_ids:
            item = db.query(MediaItem).filter(MediaItem.id == item_id).first()
            if not item:
                continue

            prepared_targets = []
            for target in targets:
                item_type_val = target.get("item_type")
                if item_type_val in ["tv", "series", "season", "episode"]:
                    prepared_targets.append({
                        "tmdb_id": target.get("tmdb_id"),
                        "item_type": item_type_val,
                        "season": target["season"] if "season" in target else (item.fn_season or item.fd_season or item.it_season),
                        "episode": target["episode"] if "episode" in target else (item.fn_episode or item.fd_episode or item.it_episode),
                        "episodes": target.get("episodes"),
                    })
                else:
                    prepared_targets.append(target)

            match_id = MetadataService.resolve_metadata(db, {
                "item_id": item_id,
                "targets": prepared_targets,
            })
            if match_id:
                updated_match_ids.append(match_id)

        return updated_match_ids
