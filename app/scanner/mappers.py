from typing import Optional
from ..db.models import MediaSource, MovieEdition, MediaAudioType

def map_guessit_source(source_str: Optional[str]) -> MediaSource:
    if not source_str:
        return MediaSource.NONE
    s = str(source_str).lower()
    if "bluray" in s or "blu-ray" in s or "bd" in s or "bdr" in s:
        return MediaSource.BLURAY
    if "web" in s or "dl" in s:
        return MediaSource.WEB
    if "dvd" in s:
        return MediaSource.DVD
    if "tv" in s or "hdtv" in s:
        return MediaSource.TV
    if "cam" in s or "ts" in s or "telesync" in s:
        return MediaSource.CAM
    return MediaSource.NONE

def map_guessit_edition(edition_str: Optional[str]) -> MovieEdition:
    if not edition_str:
        return MovieEdition.NONE
    e = str(edition_str).lower()
    if "theatrical" in e:
        return MovieEdition.THEATRICAL
    if "director" in e:
        return MovieEdition.DIRECTORS_CUT
    if "extended" in e:
        return MovieEdition.EXTENDED
    if "unrated" in e:
        return MovieEdition.UNRATED
    if "remastered" in e:
        return MovieEdition.REMASTERED
    if "special" in e:
        return MovieEdition.SPECIAL
    if "ultimate" in e:
        return MovieEdition.ULTIMATE
    if "collector" in e:
        return MovieEdition.COLLECTORS_EDITION
    if "fan" in e:
        return MovieEdition.FAN_EDIT
    return MovieEdition.NONE

def map_guessit_audio_type(other_list: Optional[list], languages: Optional[list]) -> MediaAudioType:
    if other_list:
        for val in other_list:
            if not isinstance(val, str): continue
            val_lower = val.lower()
            if "dual" in val_lower:
                return MediaAudioType.DUAL_AUDIO
            if "multi" in val_lower:
                return MediaAudioType.MULTI_AUDIO
    if languages:
        langs_list = languages if isinstance(languages, (list, tuple, set)) else [languages]
        if len(langs_list) == 2:
            return MediaAudioType.DUAL_AUDIO
        if len(langs_list) >= 3:
            return MediaAudioType.MULTI_AUDIO
    return MediaAudioType.NONE
