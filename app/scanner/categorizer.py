from pathlib import Path
from typing import List, Dict, Tuple, Optional
import sys
import os

# We add the root directory to access the models
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.db.models import ExtraCategory, ExtraSubtype

class Categorizer:
    """
    Submodule 2: Categorizes extra files (subtitles, images, etc.) 
    into logical categories and subtypes based on filename keywords and extensions.
    """
    
    # Keyword mapping for automated subtype detection
    SUBTYPE_MAP = {
        'trailer': ExtraSubtype.TRAILER,
        'teaser': ExtraSubtype.TRAILER,
        'sample': ExtraSubtype.SAMPLE,
        'minta': ExtraSubtype.SAMPLE, # Hungarian for 'sample'
        'behind': ExtraSubtype.BEHIND_THE_SCENES,
        'making': ExtraSubtype.BEHIND_THE_SCENES,
        'featurette': ExtraSubtype.FEATURETTE,
        'deleted': ExtraSubtype.DELETED_SCENES,
        'kimaradt': ExtraSubtype.DELETED_SCENES, # Hungarian for 'deleted/omitted'
        'interview': ExtraSubtype.INTERVIEW,
        'riport': ExtraSubtype.INTERVIEW, # Hungarian for 'report/interview'
        'short': ExtraSubtype.SHORT,
        'promo': ExtraSubtype.PROMO,
        'clip': ExtraSubtype.CLIP,
        # Images
        'poster': ExtraSubtype.POSTER,
        'poszter': ExtraSubtype.POSTER, # Hungarian for 'poster'
        'fanart': ExtraSubtype.FANART,
        'backdrop': ExtraSubtype.BACKDROP,
        'hatter': ExtraSubtype.BACKDROP, # Hungarian for 'background'
        'banner': ExtraSubtype.BANNER,
        'thumb': ExtraSubtype.THUMBNAIL,
        'logo': ExtraSubtype.LOGO,
        'clearlogo': ExtraSubtype.CLEARLOGO,
        'disc': ExtraSubtype.DISC,
        'lemez': ExtraSubtype.DISC, # Hungarian for 'disc'
        # Subtitles
        'forced': ExtraSubtype.FORCED,
        'kenyszeritett': ExtraSubtype.FORCED, # Hungarian for 'forced'
        'sdh': ExtraSubtype.SDH,
        'commentary': ExtraSubtype.COMMENTARY_SUB,
        'full': ExtraSubtype.FULL,
        # Audio
        'dub': ExtraSubtype.DUBBED,
        'szinkron': ExtraSubtype.DUBBED, # Hungarian for 'dubbed/sync'
        'original': ExtraSubtype.ORIGINAL,
        'score': ExtraSubtype.ISOLATED_SCORE,
    }

    def categorize(self, file_path: Path, db=None) -> Tuple[ExtraCategory, ExtraSubtype]:
        """
        Determines the category and subtype of a file.
        Uses extensions for primary categorization and keywords for subtype refinement.
        """
        ext = file_path.suffix.lower()
        filename = file_path.stem.lower()
        
        # Load user-defined extensions if db is provided
        sub_exts = ['.srt', '.sub', '.ass', '.ssa', '.vtt']
        audio_exts = ['.mka', '.ac3', '.dts', '.mp3', '.flac', '.wav', '.m4a']
        img_exts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
        meta_exts = ['.nfo', '.xml', '.txt']
        video_exts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v']
        
        if db:
            try:
                from app.db.models import UserSetting
                settings = {s.key: s.value for s in db.query(UserSetting).all()}
                if "extras_sub_exts" in settings: sub_exts = [e.strip() for e in settings["extras_sub_exts"].split(",")]
                if "extras_audio_exts" in settings: audio_exts = [e.strip() for e in settings["extras_audio_exts"].split(",")]
                if "extras_img_exts" in settings: img_exts = [e.strip() for e in settings["extras_img_exts"].split(",")]
                if "extras_meta_exts" in settings: meta_exts = [e.strip() for e in settings["extras_meta_exts"].split(",")]
                if "naming_video_exts" in settings:
                    video_exts = [
                        e.strip().lower() if e.strip().startswith('.') else f".{e.strip().lower()}"
                        for e in settings["naming_video_exts"].split(",") if e.strip()
                    ]
            except:
                pass

        # Primary categorization based on extensions
        category = ExtraCategory.OTHER
        
        if ext in sub_exts:
            category = ExtraCategory.SUBTITLE
        elif ext in audio_exts:
            category = ExtraCategory.AUDIO
        elif ext in img_exts:
            category = ExtraCategory.IMAGE
        elif ext in meta_exts:
            category = ExtraCategory.METADATA
        elif ext in video_exts:
             # Video files can be clips if they aren't the main movie
             # This logic is usually handled by the Scanner (file size check)
             category = ExtraCategory.VIDEO
             
        # Refine subtype based on keywords
        subtype = None
        for keyword, mapped_subtype in self.SUBTYPE_MAP.items():
            if keyword in filename:
                subtype = mapped_subtype
                break
                
        # Guard: DUBBED is audio-only, never applies to subtitles
        if category == ExtraCategory.SUBTITLE and subtype == ExtraSubtype.DUBBED:
            subtype = None
            
        # Context-aware Commentary assignment
        if subtype == ExtraSubtype.COMMENTARY_SUB:
            if category == ExtraCategory.AUDIO:
                subtype = ExtraSubtype.COMMENTARY_AUDIO
            elif category == ExtraCategory.VIDEO:
                subtype = ExtraSubtype.FEATURETTE

        # Special case for Metadata files - they should prioritize their specific type
        if ext == '.nfo': subtype = ExtraSubtype.NFO
        elif ext == '.xml': subtype = ExtraSubtype.XML
        elif ext == '.json': subtype = ExtraSubtype.JSON
        elif ext == '.txt': subtype = ExtraSubtype.TXT
                
        return category, subtype

    def get_language(self, file_path: Path) -> Optional[str]:
        """
        Extracts language tags from the filename (e.g., .hun., .eng.).
        Current implementation is a basic keyword match.
        """
        name = file_path.name.lower()
        if 'hun' in name or 'magyar' in name: return 'hun'
        if 'eng' in name or 'english' in name: return 'eng'
        return None
