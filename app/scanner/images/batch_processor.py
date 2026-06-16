import os
import time
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import Session
from ...db.models import MediaMatch, Person, ImageStatus, ItemType
from ...utils.logger import logger


class ImageBatchProcessorMixin:
    @staticmethod
    def reset_stale_tasks(db: Session):
        """Resets any stuck 'DOWNLOADING' tasks back to 'PENDING' on startup."""
        try:
            db.query(MediaMatch).filter(MediaMatch.image_status == ImageStatus.DOWNLOADING).update({"image_status": ImageStatus.PENDING})
            db.query(MediaMatch).filter(MediaMatch.backdrop_status == ImageStatus.DOWNLOADING).update({"backdrop_status": ImageStatus.PENDING})
            db.query(Person).filter(Person.image_status == ImageStatus.DOWNLOADING).update({"image_status": ImageStatus.PENDING})
            db.commit()
        except Exception as e:
            logger.error(f"Failed to reset stale image tasks: {e}")
            db.rollback()

    def process_all(self, max_workers: int = 5):
        """Executes all pending downloads and processing in parallel."""
        for attempt in range(3):
            # Check if there is any pending work before starting the heavy executors
            has_media = self.db.query(MediaMatch.id).filter(MediaMatch.image_status == ImageStatus.PENDING).first() is not None
            has_backdrops = self.db.query(MediaMatch.id).filter(MediaMatch.backdrop_status == ImageStatus.PENDING).first() is not None
            has_persons = self.db.query(Person.id).filter(Person.image_status == ImageStatus.PENDING).first() is not None
            has_alts = self.db.query(Person.id).filter(
                Person.image_status.in_([ImageStatus.COMPLETED, ImageStatus.FAILED]),
                Person.images == None
            ).first() is not None
            
            if not (has_media or has_backdrops or has_persons or has_alts):
                if attempt == 0:
                    return
                break
            
            logger.info(f"ImageWorker (Attempt {attempt + 1}/3): Starting download process ({max_workers} threads)...")
            
            if has_media:
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    # 1. Media assets (Posters, Stills)
                    self.process_pending_media(executor)
                    
            if has_persons:
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    # 2. People primary profiles (Top 20 + Creators)
                    self.process_pending_persons(executor)
                    
            if has_backdrops:
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    # 3. Backdrops (Large images)
                    self.process_pending_backdrops(executor)
                    
            if has_persons or has_alts:
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    # 4. People alternate profiles (Remaining images for top actors)
                    self.process_person_alternate_images(executor)

            if attempt < 2:
                # Find failed items and reset to PENDING for the next attempt
                failed_media = self.db.query(MediaMatch).filter(MediaMatch.image_status == ImageStatus.FAILED).all()
                failed_backdrops = self.db.query(MediaMatch).filter(MediaMatch.backdrop_status == ImageStatus.FAILED).all()
                failed_persons = self.db.query(Person).filter(Person.image_status == ImageStatus.FAILED).all()
                
                if not failed_media and not failed_backdrops and not failed_persons:
                    break
                
                logger.info(f"ImageWorker: Retrying {len(failed_media)} failed media, {len(failed_backdrops)} backdrops, {len(failed_persons)} persons...")
                
                for m in failed_media:
                    m.image_status = ImageStatus.PENDING
                for m in failed_backdrops:
                    m.backdrop_status = ImageStatus.PENDING
                for p in failed_persons:
                    p.image_status = ImageStatus.PENDING
                self.db.commit()
                
                # Small cooling delay before retry
                time.sleep(1.5)
        
        logger.info("ImageWorker: All pending tasks completed.")

    def process_pending_media(self, executor):
        """Processes pending movie/series images in batches."""
        while True:
            matches = self.db.query(MediaMatch.id).filter(
                MediaMatch.image_status == ImageStatus.PENDING
            ).limit(50).all()
            
            if not matches:
                break

            match_ids = [m[0] for m in matches]
            
            # Mark as DOWNLOADING in the main thread
            self.db.query(MediaMatch).filter(MediaMatch.id.in_(match_ids)).update(
                {"image_status": ImageStatus.DOWNLOADING}, synchronize_session=False
            )
            self.db.commit()

            futures = []
            for mid in match_ids:
                futures.append(executor.submit(self._download_match_images, mid))
            
            for future in futures:
                future.result()

    def _download_match_images(self, match_id: int):
        """Downloads all images for a single media match (threaded)."""
        from ...db.base import Session as DbSession
        local_db = DbSession()
        try:
            match = local_db.query(MediaMatch).filter(MediaMatch.id == match_id).first()
            if not match:
                return
                
            success = False
            has_pending = False
            has_any_path = False
            for loc in match.localizations:
                # A. POSTERS
                if loc.poster_path:
                    has_any_path = True
                    remote_filename = loc.poster_path.lstrip("/")
                    if loc.local_poster_path and remote_filename not in loc.local_poster_path:
                        loc.local_poster_path = None
                    if not loc.local_poster_path:
                        local_p = self.download_image(loc.poster_path, "posters", size="w500")
                        if local_p:
                            loc.local_poster_path = local_p
                            success = True
                        else:
                            has_pending = True
                    else:
                        success = True
                
                if loc.series_poster_path:
                    has_any_path = True
                    remote_series_filename = loc.series_poster_path.lstrip("/")
                    if loc.local_series_poster_path and remote_series_filename not in loc.local_series_poster_path:
                        loc.local_series_poster_path = None
                    if not loc.local_series_poster_path:
                        local_sp = self.download_image(loc.series_poster_path, "posters", size="w500")
                        if local_sp:
                            loc.local_series_poster_path = local_sp
                            success = True
                        else:
                            has_pending = True
                    else:
                        success = True

                if loc.logo_path:
                    has_any_path = True
                    remote_logo_filename = loc.logo_path.lstrip("/")
                    if loc.local_logo_path and remote_logo_filename not in loc.local_logo_path:
                        loc.local_logo_path = None
                    if not loc.local_logo_path:
                        local_logo = self.download_image(loc.logo_path, "logos", size="original")
                        if local_logo:
                            loc.local_logo_path = local_logo
                            success = True
                        else:
                            has_pending = True
                    else:
                        success = True

                # B. STILLS
                if loc.still_path:
                    has_any_path = True
                    remote_still_filename = loc.still_path.lstrip("/")
                    if loc.local_still_path and remote_still_filename not in loc.local_still_path:
                        loc.local_still_path = None
                    if not loc.local_still_path:
                        local_s = self.download_image(loc.still_path, "stills", size="w400")
                        if local_s:
                            loc.local_still_path = local_s
                            success = True
                        else:
                            has_pending = True
                    else:
                        success = True
                
                # C. ALL STILLS (Gallery for multi-part episodes)
                if loc.all_stills:
                    has_any_path = True
                    local_stills = list(loc.local_all_stills or [])
                    updated_stills = False
                    
                    for s_path in loc.all_stills:
                        # Check if the image is already downloaded
                        filename = s_path.lstrip("/")
                        if any(filename in str(ls) for ls in local_stills):
                            continue
                            
                        local_s = self.download_image(s_path, "stills", size="w400")
                        if local_s:
                            local_stills.append(local_s)
                            updated_stills = True
                            success = True
                        else:
                            has_pending = True
                    
                    if updated_stills:
                        loc.local_all_stills = local_stills
                        
            # D. SEASON POSTERS (TV shows only)
            series_id = match.series_tmdb_id if match.item_type == ItemType.EPISODE else (match.tmdb_id if match.item_type == ItemType.SERIES else None)
            if series_id:
                try:
                    from ...db.models import TMDBCache
                    tmdb_caches = local_db.query(TMDBCache).filter(
                        TMDBCache.tmdb_id == series_id,
                        TMDBCache.cache_key.like(f"/tv/{series_id}%")
                    ).all()
                    tmdb_cache = None
                    for cache in tmdb_caches:
                        ck = cache.cache_key or ""
                        if ck == f"/tv/{series_id}" or ck.startswith(f"/tv/{series_id}?"):
                            tmdb_cache = cache
                            break
                    if tmdb_cache and isinstance(tmdb_cache.raw_data, dict):
                        seasons = tmdb_cache.raw_data.get("seasons", [])
                        for s in seasons:
                            s_poster = s.get("poster_path")
                            if s_poster:
                                self.download_image(s_poster, "posters", size="w500")
                except Exception as e:
                    logger.error(f"Failed to download season posters for series {series_id}: {e}")

            # E. COMPANY LOGOS
            try:
                if match.companies:
                    companies_updated = False
                    updated_companies = []
                    for comp in match.companies:
                        if hasattr(comp, "get"):
                            logo_path = comp.get("logo_path")
                            if logo_path:
                                local_logo = comp.get("local_logo_path")
                                if not local_logo or not os.path.exists(local_logo):
                                    local_logo = self.download_image(logo_path, "logos", size="original")
                                    if local_logo:
                                        comp = dict(comp)
                                        comp["local_logo_path"] = local_logo
                                        companies_updated = True
                        updated_companies.append(comp)
                    if companies_updated:
                        match.companies = updated_companies
            except Exception as e:
                logger.error(f"Failed to download company logos for match {match_id}: {e}")

            # F. NETWORK LOGOS
            try:
                if match.networks:
                    networks_updated = False
                    updated_networks = []
                    for net in match.networks:
                        if hasattr(net, "get"):
                            logo_path = net.get("logo_path")
                            if logo_path:
                                local_logo = net.get("local_logo_path")
                                if not local_logo or not os.path.exists(local_logo):
                                    local_logo = self.download_image(logo_path, "logos", size="original")
                                    if local_logo:
                                        net = dict(net)
                                        net["local_logo_path"] = local_logo
                                        networks_updated = True
                        updated_networks.append(net)
                    if networks_updated:
                        match.networks = updated_networks
            except Exception as e:
                logger.error(f"Failed to download network logos for match {match_id}: {e}")

            # Only mark COMPLETED if everything downloaded; PENDING if some failed
            if has_pending:
                match.image_status = ImageStatus.PENDING
            elif success or not has_any_path:
                match.image_status = ImageStatus.COMPLETED
            else:
                match.image_status = ImageStatus.FAILED
            local_db.commit()
        except Exception as e:
            logger.error(f"Error downloading images for match ID {match_id}: {e}")
            local_db.rollback()
            try:
                match = local_db.query(MediaMatch).filter(MediaMatch.id == match_id).first()
                if match:
                    match.image_status = ImageStatus.FAILED
                    local_db.commit()
            except:
                pass
        finally:
            local_db.close()

    def process_pending_backdrops(self, executor):
        """Processes pending backdrops (large images) in batches."""
        while True:
            matches = self.db.query(MediaMatch.id).filter(
                MediaMatch.backdrop_status == ImageStatus.PENDING
            ).limit(50).all()
            
            if not matches:
                break

            match_ids = [m[0] for m in matches]
            
            self.db.query(MediaMatch).filter(MediaMatch.id.in_(match_ids)).update(
                {"backdrop_status": ImageStatus.DOWNLOADING}, synchronize_session=False
            )
            self.db.commit()

            futures = []
            for mid in match_ids:
                futures.append(executor.submit(self._download_match_backdrops, mid))
            
            for future in futures:
                future.result()

    def _download_match_backdrops(self, match_id: int):
        """Downloads only the wide backdrop image for a match."""
        from ...db.base import Session as DbSession
        local_db = DbSession()
        try:
            match = local_db.query(MediaMatch).filter(MediaMatch.id == match_id).first()
            if not match: return
                
            success = True # assume success if no paths exist
            for loc in match.localizations:
                if loc.backdrop_path:
                    remote_bd_filename = loc.backdrop_path.lstrip("/")
                    if loc.local_backdrop_path and remote_bd_filename not in loc.local_backdrop_path:
                        loc.local_backdrop_path = None
                    if not loc.local_backdrop_path:
                        local_b = self.download_image(loc.backdrop_path, "backdrops", size="w1280")
                        if local_b:
                            loc.local_backdrop_path = local_b
                        else:
                            success = False
                else:
                    pass

            match.backdrop_status = ImageStatus.COMPLETED if success else ImageStatus.FAILED
            local_db.commit()
        except Exception as e:
            logger.error(f"Error downloading backdrops for match ID {match_id}: {e}")
            local_db.rollback()
            try:
                match = local_db.query(MediaMatch).filter(MediaMatch.id == match_id).first()
                if match:
                    match.backdrop_status = ImageStatus.FAILED
                    local_db.commit()
            except:
                pass
        finally:
            local_db.close()

    def process_pending_persons(self, executor):
        """Processes pending person profiles in batches (Primary image)."""
        while True:
            persons = self.db.query(Person.id).filter(
                Person.image_status == ImageStatus.PENDING
            ).limit(100).all()
            
            if not persons:
                break

            person_ids = [p[0] for p in persons]
            
            self.db.query(Person).filter(Person.id.in_(person_ids)).update(
                {"image_status": ImageStatus.DOWNLOADING}, synchronize_session=False
            )
            self.db.commit()

            futures = []
            for pid in person_ids:
                futures.append(executor.submit(self._download_person_image, pid))
            
            for future in futures:
                future.result()

    def process_person_alternate_images(self, executor):
        """Processes alternate images for persons."""
        while True:
            # Persons that have primary image processed, but alt images not fetched yet (images == None)
            persons = self.db.query(Person.id).filter(
                Person.image_status.in_([ImageStatus.COMPLETED, ImageStatus.FAILED]),
                Person.images == None
            ).limit(50).all()
            
            if not persons:
                break
                
            person_ids = [p[0] for p in persons]
            
            # Temporary set to empty list to prevent re-querying if it crashes
            self.db.query(Person).filter(Person.id.in_(person_ids)).update(
                {"images": []}, synchronize_session=False
            )
            self.db.commit()

            futures = []
            for pid in person_ids:
                futures.append(executor.submit(self._download_person_alternate_images, pid))
                
            for future in futures:
                future.result()

    def _download_person_alternate_images(self, person_id: int):
        """Downloads additional profile pictures for a person."""
        from ...db.base import Session as DbSession
        from ...api.tmdb_client import TMDBClient
        
        profile_path = None
        local_db = DbSession()
        try:
            person = local_db.query(Person).filter(Person.id == person_id).first()
            if person:
                profile_path = person.profile_path
        except Exception as e:
            logger.error(f"Error reading person for alternate images (ID: {person_id}): {e}")
        finally:
            local_db.close()
            
        if profile_path is None:
            return

        downloaded_paths = []
        try:
            api_db = DbSession()
            try:
                api = TMDBClient(api_db)
                data = api.get_person_images(person_id)
            finally:
                api_db.close()
                
            profiles = data.get("profiles", [])
            count = 0
            for profile in profiles:
                file_path = profile.get("file_path")
                if not file_path or file_path == profile_path:
                    continue
                    
                local_path = self.download_image(file_path, "persons", size="h632")
                if local_path:
                    downloaded_paths.append(local_path)
                    count += 1
                
                if count >= 10:
                    break
        except Exception as e:
            logger.error(f"Error fetching/downloading alt images (ID: {person_id}): {e}")
            return

        local_db = DbSession()
        try:
            person = local_db.query(Person).filter(Person.id == person_id).first()
            if person:
                person.images = downloaded_paths
                local_db.commit()
        except Exception as e:
            logger.error(f"Error committing alternate person images (ID: {person_id}): {e}")
            local_db.rollback()
        finally:
            local_db.close()

    def _download_person_image(self, person_id: int):
        """Downloads a single person's profile image (threaded)."""
        from ...db.base import Session as DbSession
        
        profile_path = None
        local_profile_path = None
        local_db = DbSession()
        try:
            person = local_db.query(Person).filter(Person.id == person_id).first()
            if person:
                profile_path = person.profile_path
                local_profile_path = person.local_profile_path
        finally:
            local_db.close()

        if not profile_path:
            local_db = DbSession()
            try:
                person = local_db.query(Person).filter(Person.id == person_id).first()
                if person:
                    person.image_status = ImageStatus.COMPLETED
                    local_db.commit()
            finally:
                local_db.close()
            return

        if local_profile_path:
            return

        local_path = self.download_image(profile_path, "persons", size="h632")

        local_db = DbSession()
        try:
            person = local_db.query(Person).filter(Person.id == person_id).first()
            if person:
                if local_path:
                    person.local_profile_path = local_path
                    person.image_status = ImageStatus.COMPLETED
                else:
                    person.image_status = ImageStatus.FAILED
                local_db.commit()
        except Exception as e:
            logger.error(f"Error updating person image (ID: {person_id}): {e}")
            local_db.rollback()
        finally:
            local_db.close()
