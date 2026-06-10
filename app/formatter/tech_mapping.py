"""
Technikai adatok mappelése FFprobe nyers értékekből scene-standard nevekre.
A Formatter és a Probe modul is használja.
"""

# ============================================================================
# RESOLUTION
# ============================================================================
def map_resolution(width: int, height: int) -> str:
    """FFprobe width/height -> scene-standard resolution."""
    if not width or not height:
        return ""
    
    # Based on height (the smaller one for portrait videos)
    h = min(width, height) if width > height else height
    w = max(width, height)
    
    if w >= 7000: return "8K"
    if w >= 3500: return "2160p"
    if w >= 2500: return "1440p"
    if w >= 1800: return "1080p"
    if w >= 1200: return "720p"
    if w >= 700 and h >= 500: return "576p"
    if w >= 640: return "480p"
    return f"{h}p"


# ============================================================================
# VIDEO CODEC
# ============================================================================
_VIDEO_CODEC_MAP = {
    "h264": "x264",
    "avc1": "x264",
    "hevc": "x265",
    "h265": "x265",
    "av1": "AV1",
    "vp9": "VP9",
    "vp8": "VP8",
    "mpeg2video": "MPEG2",
    "mpeg4": "MPEG4",
    "wmv3": "WMV",
    "vc1": "VC-1",
    "theora": "Theora",
}

def map_video_codec(codec_name: str) -> str:
    """FFprobe codec_name -> scene-standard video codec."""
    if not codec_name:
        return ""
    return _VIDEO_CODEC_MAP.get(codec_name.lower(), codec_name.upper())


# ============================================================================
# AUDIO CODEC
# ============================================================================
_AUDIO_CODEC_MAP = {
    "aac": "AAC",
    "ac3": "DD",
    "eac3": "DD+",
    "dts": "DTS",
    "truehd": "TrueHD",
    "flac": "FLAC",
    "opus": "Opus",
    "vorbis": "Vorbis",
    "mp3": "MP3",
    "mp2": "MP2",
    "wmav2": "WMA",
}

# DTS profiles (refined based on the profile field)
_DTS_PROFILE_MAP = {
    "DTS-HD MA": "DTS-HD.MA",
    "DTS-HD HRA": "DTS-HD.HRA",
    "DTS Express": "DTS-Express",
    "DTS:X": "DTS-X",
}

def map_audio_codec(codec_name: str, profile: str = None) -> str:
    """FFprobe codec_name + profile -> scene-standard audio codec."""
    if not codec_name:
        return ""
    
    key = codec_name.lower()
    
    # Special DTS profiles
    if key == "dts" and profile:
        return _DTS_PROFILE_MAP.get(profile, "DTS")
    
    # TrueHD + Atmos detection (derived from side_data)
    # This needs to be handled on the caller side because the Atmos flag is in the stream metadata
    
    # PCM variants
    if key.startswith("pcm_"):
        return "PCM"
    
    return _AUDIO_CODEC_MAP.get(key, codec_name.upper())


# ============================================================================
# AUDIO CHANNELS
# ============================================================================
_CHANNEL_MAP = {
    1: "1.0",
    2: "2.0",
    3: "2.1",
    6: "5.1",
    7: "6.1",
    8: "7.1",
}

def map_audio_channels(channels: int) -> str:
    """FFprobe channels count -> scene-standard channel count."""
    if not channels:
        return ""
    return _CHANNEL_MAP.get(channels, f"{channels}ch")


# ============================================================================
# HDR
# ============================================================================
def map_hdr(color_transfer: str = None, color_primaries: str = None, 
            side_data: list = None, has_dovi: bool = False) -> str:
    """FFprobe color/HDR data -> scene-standard HDR type."""
    if has_dovi:
        return "DV"
    
    if side_data:
        for sd in side_data:
            sd_type = sd.get("side_data_type", "")
            if "HDR10+" in sd_type or "HDR Dynamic" in sd_type:
                return "HDR10+"
            if "Mastering display" in sd_type or "SMPTE ST 2086" in sd_type:
                return "HDR10"
            if "Content light" in sd_type:
                return "HDR10"
    
    if color_transfer:
        ct = color_transfer.lower()
        if "smpte2084" in ct or "st2084" in ct:
            return "HDR10"
        if "arib-std-b67" in ct or "hlg" in ct:
            return "HLG"
    
    return ""


# ============================================================================
# BIT DEPTH
# ============================================================================
def map_bit_depth(bits_per_raw_sample: str = None, pix_fmt: str = None) -> str:
    """FFprobe bit depth -> scene-standard format."""
    if bits_per_raw_sample:
        try:
            bits = int(bits_per_raw_sample)
            if bits > 8:
                return f"{bits}bit"
        except:
            pass
    
    # Fallback: based on pixel format
    if pix_fmt:
        fmt = pix_fmt.lower()
        if "10le" in fmt or "10be" in fmt or "p010" in fmt:
            return "10bit"
        if "12le" in fmt or "12be" in fmt:
            return "12bit"
    
    return ""
