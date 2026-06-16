import ast

def _get_series_keywords(cached_series, base_match):
    if base_match and base_match.keywords:
        return base_match.keywords
    keywords_data = (cached_series or {}).get("keywords", {})
    if isinstance(keywords_data, dict):
        keyword_list = keywords_data.get("results") or keywords_data.get("keywords") or []
        if isinstance(keyword_list, list):
            return [keyword.get("name") for keyword in keyword_list if isinstance(keyword, dict) and keyword.get("name")]
    return []

def _collect_episode_numbers(episode_number):
    if isinstance(episode_number, list):
        values = episode_number
    elif isinstance(episode_number, str):
        raw_value = episode_number.strip()
        if not raw_value:
            values = []
        elif raw_value.startswith("[") and raw_value.endswith("]"):
            try:
                parsed_value = ast.literal_eval(raw_value)
            except (SyntaxError, ValueError):
                parsed_value = None
            if isinstance(parsed_value, list):
                values = parsed_value
            else:
                values = []
        else:
            values = []
            for chunk in raw_value.replace("&", ",").split(","):
                part = chunk.strip()
                if not part:
                    continue
                if "-" in part:
                    bounds = [segment.strip() for segment in part.split("-", 1)]
                    try:
                        start = int(bounds[0])
                        end = int(bounds[1])
                    except (TypeError, ValueError):
                        values.append(part)
                        continue
                    if start <= end:
                        values.extend(range(start, end + 1))
                    else:
                        values.extend(range(end, start + 1))
                    continue
                values.append(part)
    else:
        values = [episode_number]

    normalized = set()
    for value in values:
        try:
            if value is None:
                continue
            normalized.add(int(value))
        except (TypeError, ValueError):
            continue
    return normalized

def _normalize_episode_number_field(episode_number):
    normalized = sorted(_collect_episode_numbers(episode_number))
    if not normalized:
        return episode_number
    if len(normalized) == 1:
        return normalized[0]
    return normalized

def _primary_episode_number(episode_number):
    normalized = sorted(_collect_episode_numbers(episode_number))
    if normalized:
        return normalized[0]
    try:
        return int(episode_number)
    except (TypeError, ValueError):
        return episode_number

def _is_special_season(season):
    if not isinstance(season, dict):
        return False
    season_number = season.get("season_number")
    try:
        return int(season_number) == 0
    except (TypeError, ValueError):
        return False

def _annotate_season_availability(seasons):
    for season in seasons:
        episodes = season.get("episodes") or []
        available_episode_numbers = set()
        total_episode_numbers = set()
        for episode in episodes:
            episode_numbers = _collect_episode_numbers(episode.get("episode_number"))
            if not episode_numbers:
                continue
            total_episode_numbers.update(episode_numbers)
            if episode.get("in_library") is not False and not episode.get("is_missing"):
                available_episode_numbers.update(episode_numbers)
        available_count = len(available_episode_numbers)
        total_count = len(total_episode_numbers)
        missing_count = 0 if _is_special_season(season) else max(0, total_count - available_count)
        season["available_episode_count"] = available_count
        season["total_episode_count"] = total_count
        season["missing_episode_count"] = missing_count
        for episode in episodes:
            if "in_library" not in episode:
                episode["in_library"] = True
            if "is_missing" not in episode:
                episode["is_missing"] = episode.get("in_library") is False

def _annotate_series_availability(series_data):
    seasons = series_data.get("seasons") or []
    non_special_seasons = [season for season in seasons if not _is_special_season(season)]
    available_count = sum(int(season.get("available_episode_count") or 0) for season in non_special_seasons)
    total_count = sum(int(season.get("total_episode_count") or 0) for season in non_special_seasons)
    missing_count = max(0, total_count - available_count)
    series_data["available_episode_count"] = available_count
    series_data["total_episode_count"] = total_count
    series_data["missing_episode_count"] = missing_count
