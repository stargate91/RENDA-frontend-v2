import logging
from typing import List, Any, Dict
from .tech_mapping import map_resolution

logger = logging.getLogger(__name__)

class TechParser:
    """
    Handles parsing and formatting of technical media properties 
    (Resolution, Codecs, Sources, HDR, etc.).
    """

    @staticmethod
    def _resolution_sort_key(value: str) -> int:
        if not value:
            return 0

        text = str(value).strip().lower()
        if "x" in text:
            try:
                return int(text.split("x")[-1].strip().rstrip("p"))
            except ValueError:
                return 0
        if text.endswith("k"):
            try:
                return int(float(text[:-1]) * 1000)
            except ValueError:
                return 0
        if text.endswith("p"):
            digits = "".join(ch for ch in text if ch.isdigit())
            return int(digits) if digits else 0
        digits = "".join(ch for ch in text if ch.isdigit())
        return int(digits) if digits else 0

    @staticmethod
    def parse_resolution(resolution: str) -> str:
        """Standardizes resolution strings (e.g., 1920x1080 -> 1080p)."""
        if not resolution: return ""
        if "x" in resolution.lower() and "p" not in resolution.lower():
            try:
                parts = resolution.lower().split("x")
                if len(parts) == 2:
                    w, h = int(parts[0]), int(parts[1])
                    return map_resolution(w, h)
            except: pass
        return resolution

    @staticmethod
    def format_enum_val(enum_obj) -> str:
        """Formats internal enum values for display (e.g., directors_cut -> Director's Cut)."""
        if not enum_obj or enum_obj.value == "none": return ""
        val = enum_obj.value.replace("_", " ").title()
        val = val.replace("Directors Cut", "Director's Cut")
        val = val.replace("Collectors Edition", "Collector's Edition")
        val = val.replace("Collectors", "Collector's Edition")
        return val

    @staticmethod
    def format_source(source_enum) -> str:
        """Special formatting for media sources."""
        if not source_enum or source_enum.value == "none": return ""
        val = source_enum.value.upper()
        if val == "BLURAY": return "BluRay"
        if val == "WEB": return "WEB-DL"
        return val

    @staticmethod
    def calculate_mixed_resolution(items: List[Any]) -> str:
        """Calculates a representative resolution for a collection of items."""
        res_list = sorted(
            list(set(i.resolution for i in items if i.resolution)),
            key=TechParser._resolution_sort_key
        )
        if not res_list: return ""
        if len(res_list) == 1: return res_list[0]
        if len(res_list) == 2: return f"{res_list[0]}-{res_list[1]}"
        return "Mixed"

    @staticmethod
    def get_tech_context(item: Any) -> Dict[str, Any]:
        """Returns a standardized technical context dictionary."""
        res = TechParser.parse_resolution(getattr(item, "resolution", ""))
        bit_depth = getattr(item, "bit_depth", None)
        framerate = getattr(item, "framerate", None)
        video_bitrate = getattr(item, "video_bitrate", None)
        
        # We populate both CamelCase (expected by templates) and lowercase (expected by some code/tests) keys
        return {
            "Resolution": res,
            "resolution": res,
            "VideoCodec": getattr(item, "video_codec", "") or "",
            "video_codec": getattr(item, "video_codec", "") or "",
            "AudioCodec": getattr(item, "audio_codec", "") or "",
            "audio_codec": getattr(item, "audio_codec", "") or "",
            "AudioChannels": getattr(item, "audio_channels", "") or "",
            "audio_channels": getattr(item, "audio_channels", "") or "",
            "BitDepth": f"{bit_depth}bit" if bit_depth else "",
            "bit_depth": f"{bit_depth}bit" if bit_depth else "",
            "HDR": getattr(item, "hdr_type", "") or "",
            "hdr": getattr(item, "hdr_type", "") or "",
            "Framerate": str(framerate) if framerate else "",
            "framerate": str(framerate) if framerate else "",
            "VideoBitrate": f"{round(video_bitrate / 1000)}kbps" if video_bitrate else "",
            "video_bitrate": f"{round(video_bitrate / 1000)}kbps" if video_bitrate else "",
        }
