import requests
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from ..db.models import UserSetting

logger = logging.getLogger(__name__)

class AdultGraphQLClient:
    """
    GraphQL client to communicate with StashDB, FansDB, and THEPornDB.
    """
    def __init__(self, db: Session, prefix: str):
        self.db = db
        self.prefix = prefix  # e.g., 'stashdb', 'fansdb', 'theporndb'

    def _get_config(self) -> tuple[str, str]:
        endpoint_setting = self.db.query(UserSetting).filter(UserSetting.key == f"{self.prefix}_endpoint").first()
        api_key_setting = self.db.query(UserSetting).filter(UserSetting.key == f"{self.prefix}_api_key").first()
        
        endpoint = (endpoint_setting.value or "").strip() if endpoint_setting else ""
        api_key = (api_key_setting.value or "").strip() if api_key_setting else ""
        
        # Fallbacks if not set in DB settings
        if not endpoint:
            if self.prefix == "stashdb":
                endpoint = "https://stashdb.org/graphql"
            elif self.prefix == "fansdb":
                endpoint = "https://fansdb.cc/graphql"
            elif self.prefix == "theporndb":
                endpoint = "https://theporndb.net/graphql"
                
        return endpoint, api_key

    def execute_query(self, query: str, variables: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        endpoint, api_key = self._get_config()
        if not endpoint:
            logger.warning(f"GraphQL endpoint for {self.prefix} is not configured.")
            return None

        headers = {
            "Content-Type": "application/json",
        }
        if api_key:
            headers["ApiKey"] = api_key

        try:
            response = requests.post(
                endpoint,
                json={"query": query, "variables": variables or {}},
                headers=headers,
                timeout=15
            )
            if response.status_code != 200:
                logger.error(f"GraphQL API returned status {response.status_code}: {response.text}")
            response.raise_for_status()
            res_data = response.json()
            if "errors" in res_data:
                logger.error(f"GraphQL errors from {self.prefix}: {res_data['errors']}")
                return None
            return res_data.get("data")
        except Exception as e:
            logger.error(f"Error querying {self.prefix} GraphQL API: {e}")
            return None

    def search_performers(self, query_str: str) -> List[Dict[str, Any]]:
        gql_query = """
        query SearchPerformers($name: String!) {
          searchPerformer(term: $name) {
            id
            name
            disambiguation
            aliases
            gender
            birthdate: birth_date
            death_date
            country
            images {
              url
            }
          }
        }
        """
        data = self.execute_query(gql_query, {"name": query_str})
        if not data or "searchPerformer" not in data:
            return []
        return data["searchPerformer"] or []

    def get_performer_details(self, performer_id: str) -> Optional[Dict[str, Any]]:
        if self.prefix not in ["stashdb", "fansdb", "theporndb"]:
            return None
            
        cache_key = f"/{self.prefix}/performer/{performer_id}"
        from app.db.models import TMDBCache
        from datetime import datetime, timedelta
        
        cache = self.db.query(TMDBCache).filter(TMDBCache.cache_key == cache_key).first()
        if cache and cache.updated_at > datetime.utcnow() - timedelta(hours=24):
            return cache.raw_data

        gql_query = """
        query GetPerformer($id: ID!) {
          findPerformer(id: $id) {
            id
            name
            disambiguation
            aliases
            gender
            birthdate: birth_date
            death_date
            country
            ethnicity
            eye_color
            hair_color
            height
            measurements {
              cup_size
              band_size
              waist
              hip
            }
            tattoos {
              location
              description
            }
            piercings {
              location
              description
            }
            images {
              url
            }
            urls {
              url
              site {
                name
              }
            }
          }
        }
        """
        data = self.execute_query(gql_query, {"id": performer_id})
        if not data or "findPerformer" not in data:
            if cache:
                return cache.raw_data
            return None
        
        performer = data["findPerformer"]
        if performer and "measurements" in performer:
            m = performer["measurements"]
            if isinstance(m, dict):
                parts = []
                band = m.get("band_size")
                cup = m.get("cup_size")
                bust = ""
                if band:
                     bust += str(band)
                if cup:
                     bust += str(cup)
                if bust:
                     parts.append(bust)
                
                waist = m.get("waist")
                if waist:
                     parts.append(str(waist))
                
                hip = m.get("hip")
                if hip:
                     parts.append(str(hip))
                
                performer["measurements"] = "-".join(parts) if parts else None
                
        if performer:
            if not cache:
                cache = TMDBCache(
                    cache_key=cache_key,
                    locale="en",
                    raw_data=performer
                )
                self.db.add(cache)
            else:
                cache.raw_data = performer
                cache.updated_at = datetime.utcnow()
            self.db.commit()

        return performer

    def get_performer_scenes(self, performer_id: str, page: int = 1, per_page: int = 60) -> tuple[List[Dict[str, Any]], int]:
        if self.prefix not in ["stashdb", "fansdb"]:
            return [], 0
            
        cache_key = f"/{self.prefix}/performer/{performer_id}/scenes?page={page}&per_page={per_page}"
        from app.db.models import TMDBCache
        from datetime import datetime, timedelta
        
        cache = self.db.query(TMDBCache).filter(TMDBCache.cache_key == cache_key).first()
        if cache and cache.updated_at > datetime.utcnow() - timedelta(hours=24):
            raw = cache.raw_data or {}
            return raw.get("scenes") or [], raw.get("count") or 0

        gql_query = """
        query QueryScenes($input: SceneQueryInput!) {
          queryScenes(input: $input) {
            count
            scenes {
              id
              title
              date
              duration
              urls {
                url
                site {
                  name
                }
              }
              images {
                url
              }
              studio {
                id
                name
              }
            }
          }
        }
        """
        variables = {
            "input": {
                "performers": {
                    "value": [performer_id],
                    "modifier": "INCLUDES"
                },
                "page": page,
                "per_page": per_page,
                "direction": "DESC",
                "sort": "DATE"
            }
        }
        try:
            data = self.execute_query(gql_query, variables)
            if not data or "queryScenes" not in data:
                if cache:
                    raw = cache.raw_data or {}
                    return raw.get("scenes") or [], raw.get("count") or 0
                return [], 0
            res = data["queryScenes"]
            scenes = res.get("scenes") or []
            count = res.get("count") or 0
            
            if not cache:
                cache = TMDBCache(
                    cache_key=cache_key,
                    locale="en",
                    raw_data={"scenes": scenes, "count": count}
                )
                self.db.add(cache)
            else:
                cache.raw_data = {"scenes": scenes, "count": count}
                cache.updated_at = datetime.utcnow()
            self.db.commit()
            
            return scenes, count
        except Exception as e:
            logger.error(f"Error fetching performer scenes: {e}")
            if cache:
                raw = cache.raw_data or {}
                return raw.get("scenes") or [], raw.get("count") or 0
            return [], 0

    def get_scene_details(self, scene_id: str) -> Optional[Dict[str, Any]]:
        if self.prefix not in ["stashdb", "fansdb"]:
            return None
            
        gql_query = """
        query GetScene($id: ID!) {
          findScene(id: $id) {
            id
            title
            details
            date
            duration
            images {
              url
            }
            studio {
              id
              name
              images {
                url
              }
              parent {
                id
                name
                images {
                  url
                }
              }
            }
            performers {
              performer {
                id
                name
                gender
                images {
                  url
                }
              }
            }
            tags {
              id
              name
            }
          }
        }
        """
        try:
            data = self.execute_query(gql_query, {"id": scene_id})
            if not data or "findScene" not in data:
                return None
            return data["findScene"]
        except Exception as e:
            logger.error(f"Error fetching scene details: {e}")
            return None

