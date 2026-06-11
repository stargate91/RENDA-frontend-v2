import enum

class ItemType(enum.Enum):
    MOVIE = "movie"; SERIES = "series"; SEASON = "season"; EPISODE = "episode"; PERSON = "person"

class ItemStatus(enum.Enum):
    NEW = "new"; NO_MATCH = "no_match"; UNCERTAIN = "uncertain"; MULTIPLE = "multiple"
    MATCHED = "matched"; ORGANIZED = "organized"; RENAMED = "renamed"; ERROR = "error"; IGNORED = "ignored"
    MISSING = "missing"

class ImageStatus(enum.Enum):
    NONE = "none"; PENDING = "pending"; DOWNLOADING = "downloading"; COMPLETED = "completed"; FAILED = "failed"

class MovieEdition(enum.Enum):
    NONE = "none"; THEATRICAL = "theatrical"; DIRECTORS_CUT = "directors_cut"
    EXTENDED = "extended"; UNRATED = "unrated"; REMASTERED = "remastered"
    SPECIAL = "special"; ULTIMATE = "ultimate"; COLLECTORS_EDITION = "collectors_edition"; FAN_EDIT = "fan_edit"

class MediaSource(enum.Enum):
    NONE = "none"; BLURAY = "bluray"; WEB = "web"; DVD = "dvd"; TV = "tv"; CAM = "cam"

class MediaAudioType(enum.Enum):
    NONE = "none"; MONO = "mono"; STEREO = "stereo"; SURROUND = "surround"
    DUAL_AUDIO = "dual_audio"; MULTI_AUDIO = "multi_audio"

class PartType(enum.Enum):
    """The type of text preceding the 'part'."""
    NONE = "none"; CD = "CD"; PART = "Part"; DISC = "Disc"; VOLUME = "Volume"

class PartStyle(enum.Enum):
    """The formatting style of the part number."""
    NONE = "none"        # Use global default
    ARABIC = "arabic"    # 1, 2, 3
    ALPHA = "alpha"      # A, B, C
    ROMAN = "roman"      # I, II, III

class ActionType(enum.Enum):
    RENAME = "rename"; MOVE = "move"; COPY = "copy"; DELETE = "delete"
    METADATA_UPDATE = "metadata_update"; IDENTIFY = "identify"

class ActionStatus(enum.Enum):
    SUCCESS = "success"; FAILED = "failed"; PENDING = "pending"; UNDONE = "undone"

class ExtraCategory(enum.Enum):
    VIDEO = "video"; IMAGE = "image"; METADATA = "metadata"; SUBTITLE = "subtitle"; AUDIO = "audio"; OTHER = "other"

class ExtraSubtype(enum.Enum):
    TRAILER = "trailer"; SAMPLE = "sample"; BEHIND_THE_SCENES = "behind_the_scenes"
    FEATURETTE = "featurette"; DELETED_SCENES = "deleted_scenes"; INTERVIEW = "interview"
    SCENE_COMPARISON = "scene_comparison"; SHORT = "short"; PROMO = "promo"; CLIP = "clip"
    POSTER = "poster"; FANART = "fanart"; DISC = "disc"; BACKDROP = "backdrop"
    BANNER = "banner"; THUMBNAIL = "thumbnail"; LOGO = "logo"; CLEARLOGO = "clearlogo"
    CHARACTER_ART = "character_art"; FULL = "full"; FORCED = "forced"; SDH = "sdh"
    HEARING_IMPAIRED = "hearing_impaired"; COMMENTARY_SUB = "commentary_sub"; LYRICS = "lyrics"
    DUBBED = "dubbed"; ORIGINAL = "original"; COMMENTARY_AUDIO = "commentary_audio"
    DESCRIPTIVE = "descriptive"; ISOLATED_SCORE = "isolated_score"
    NFO = "nfo"; XML = "xml"; JSON = "json"; TXT = "txt"; URL = "url"; OTHER = "other"

