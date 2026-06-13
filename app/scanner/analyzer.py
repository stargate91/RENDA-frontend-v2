from guessit import guessit
from typing import Dict, Any, Optional
import re
import hashlib

class Analyzer:
    """
    Guessit-based analyzer for the 'Triple' metadata strategy.
    Evaluates internal titles, filenames, and directory names.
    """

    def analyze_text(self, text: str) -> Dict[str, Any]:
        """
        Runs Guessit analysis on a given string.
        """
        if not text:
            return {}
        # Normalize S1-01 / S02-09 style range-trap to S1E01 / S02E09
        normalized_text = re.sub(r'(?i)\bs(\d+)-(\d+)\b', r'S\1E\2', text)
        try:
            return dict(guessit(normalized_text))
        except Exception as e:
            return {}

    def extract_language(self, text: str) -> Optional[str]:
        """
        Extracts language codes (e.g., 'hu', 'en') from text.
        Checks both 'language' and 'subtitle_language' fields.
        """
        import os
        filename = os.path.basename(text)
        data = self.analyze_text(filename)
        langs = data.get('language') or data.get('subtitle_language')
        
        if isinstance(langs, list) and langs:
            lang = langs[0]
            return getattr(lang, 'alpha2', str(lang))
        elif langs:
            return getattr(langs, 'alpha2', str(langs))
        return None

    def get_triple_data(self, internal_title: Optional[str], filename: str, folder_name: str) -> Dict[str, Any]:
        """
        Executes the 'Triple Analysis' strategy.
        Returns data from the internal file title, the filename, and the immediate parent folder.
        """
        return {
            "it": self.analyze_text(internal_title) if internal_title else {},
            "fn": self.analyze_text(filename),
            "fd": self.analyze_text(folder_name)
        }

    def reconstruct_title(self, data: Dict[str, Any], original_text: str) -> str:
        """
        Reconstructs the movie title by putting back trimmed numbers to their original positions.
        """
        title = data.get('title')
        if not title:
            return None
            
        alt_title = data.get('alternative_title')
        is_tv = data.get('type') in ['episode', 'series']
        if alt_title and is_tv:
            if alt_title.lower() not in title.lower():
                title = f"{title} {alt_title}"
                
        is_movie = data.get('type') == 'movie'
        is_lonely_episode = data.get('type') == 'episode' and not data.get('season')
        
        if not title or not (is_movie or is_lonely_episode):
            return title
            
        episode = data.get('episode')
        part = data.get('part')
        result = str(title)
        
        if episode:
            ep_str = str(episode)
            title_pos = original_text.lower().find(title.lower())
            ep_pos = original_text.lower().find(ep_str)
            
            if ep_pos < title_pos:
                result = f"{ep_str} {result}"
            else:
                result = f"{result} {ep_str}"
                
        if part:
            result = f"{result} {part}"
            
        return result

    def generate_group_hash(self, title: str, year: Any = "", season: Any = "", episode: Any = "") -> str:
        """
        Generates a unique group hash for collision detection.
        """
        if not title:
            return ""
            
        # Normalize title: lowercase, alphanumeric only
        clean_title = re.sub(r'[^a-z0-9]', '', title.lower())
        
        # Handle episode hash (especially for lists)
        if isinstance(episode, list):
            ep_hash = "-".join(map(str, sorted(episode)))
        else:
            ep_hash = str(episode) if episode is not None else ""

        hash_key = f"{clean_title}|{year or ''}|{season or ''}|{ep_hash}"
        return hashlib.md5(hash_key.encode()).hexdigest()
