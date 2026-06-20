from typing import Optional

class LibraryFilterSortService:
    def filter_media_cards(
        self,
        tab: str,
        items: list[dict],
        search: str = "",
        selected_tags: Optional[list[str]] = None,
        selected_genre: Optional[str] = None,
        selected_decade: Optional[str] = "all",
        selected_year: Optional[int] = "all",
        filter_favorite: str = "all",
        filter_watched: str = "all",
        filter_ownership: str = "owned",
        filter_gender: str = "all",
    ) -> list[dict]:
        normalized_search = (search or "").lower().strip()
        selected_tags = selected_tags or []
        filtered = []
        selected_year_number = None
        if selected_year not in (None, "", "all"):
            try:
                selected_year_number = int(selected_year)
            except (TypeError, ValueError):
                selected_year_number = None
        selected_decade_start = None
        if selected_decade not in (None, "", "all"):
            try:
                selected_decade_start = int(str(selected_decade).replace("s", ""))
            except (TypeError, ValueError):
                selected_decade_start = None

        for item in items:
            title = str(item.get("title") or item.get("displayTitle") or "").lower()
            name = str(item.get("name") or "").lower()
            display_title = str(item.get("displayTitle") or "").lower()
            matches_search = not normalized_search or normalized_search in title or normalized_search in name or normalized_search in display_title
            item_tags = item.get("custom_tags") if isinstance(item.get("custom_tags"), list) else []
            matches_tags = not selected_tags or all(tag in item_tags for tag in selected_tags)
            
            item_genres = item.get("genres") if isinstance(item.get("genres"), list) else []
            matches_genre = not selected_genre or selected_genre == "all" or selected_genre in item_genres
            item_year = item.get("year")
            try:
                item_year = int(item_year) if item_year is not None else None
            except (TypeError, ValueError):
                item_year = None
            matches_year = selected_year_number is None or item_year == selected_year_number
            matches_decade = selected_decade_start is None or (
                item_year is not None and selected_decade_start <= item_year <= selected_decade_start + 9
            )

            matches_favorite = filter_favorite != "favorites" or item.get("is_favorite") is True

            matches_watched = True
            if filter_watched == "unwatched":
                matches_watched = item.get("is_watched") is False
            elif filter_watched == "watched":
                matches_watched = item.get("is_watched") is True

            matches_ownership = True
            if tab in {"movies", "series", "adult", "adult_series", "scenes", "adult_scenes"}:
                owned = item.get("in_library") is not False
                if filter_ownership == "owned":
                    matches_ownership = owned
                elif filter_ownership == "unowned":
                    matches_ownership = not owned

            matches_gender = True
            if tab in {"actors", "directors", "people", "adult_people"}:
                if filter_gender == "female":
                    matches_gender = item.get("gender") == 1
                elif filter_gender == "male":
                    matches_gender = item.get("gender") == 2

            if matches_search and matches_tags and matches_genre and matches_year and matches_decade and matches_favorite and matches_watched and matches_ownership and matches_gender:
                filtered.append(item)

        return filtered


    def sort_media_cards(self, items: list[dict], sort_by: str) -> list[dict]:
        def _title(item):
            return str(item.get("displayTitle") or item.get("title") or "")

        def _person_name(item):
            return str(item.get("name") or item.get("displayTitle") or item.get("title") or "").lower()

        if sort_by == "title_desc":
            return sorted(items, key=_title, reverse=True)
        if sort_by == "year_desc":
            return sorted(items, key=lambda item: item.get("year") or 0, reverse=True)
        if sort_by == "year_asc":
            return sorted(items, key=lambda item: item.get("year") or 0)
        if sort_by == "rating_desc":
            return sorted(items, key=lambda item: item.get("rating") or 0, reverse=True)
        if sort_by == "rating_asc":
            return sorted(items, key=lambda item: item.get("rating") or 0)
        if sort_by == "rating_imdb_desc":
            return sorted(items, key=lambda item: item.get("rating_imdb") or 0, reverse=True)
        if sort_by == "rating_imdb_asc":
            return sorted(items, key=lambda item: item.get("rating_imdb") or 0)
        if sort_by == "user_rating_desc":
            return sorted(items, key=lambda item: item.get("user_rating") or 0, reverse=True)
        if sort_by == "user_rating_asc":
            return sorted(items, key=lambda item: item.get("user_rating") or 0)
        if sort_by == "added_desc":
            return sorted(items, key=lambda item: item.get("added_at") or "", reverse=True)
        if sort_by == "added_asc":
            return sorted(items, key=lambda item: item.get("added_at") or "")
        if sort_by == "duration_desc":
            return sorted(items, key=lambda item: item.get("duration") or 0, reverse=True)
        if sort_by == "duration_asc":
            return sorted(items, key=lambda item: item.get("duration") or 0)
        if sort_by == "last_watched_desc":
            return sorted(items, key=lambda item: item.get("last_watched_at") or "", reverse=True)
        if sort_by == "last_watched_asc":
            return sorted(items, key=lambda item: item.get("last_watched_at") or "")
        if sort_by == "size_desc":
            return sorted(items, key=lambda item: item.get("file_size") or 0, reverse=True)
        if sort_by == "size_asc":
            return sorted(items, key=lambda item: item.get("file_size") or 0)
        if sort_by == "release_date_desc":
            return sorted(items, key=lambda item: item.get("release_date") or "", reverse=True)
        if sort_by == "release_date_asc":
            return sorted(items, key=lambda item: item.get("release_date") or "")
        if sort_by == "birthday_desc":
            return sorted(items, key=lambda item: item.get("birthday") or "0000-00-00", reverse=True)
        if sort_by == "birthday_asc":
            return sorted(items, key=lambda item: item.get("birthday") or "9999-99-99")
        if sort_by in ("name", "name_asc"):
            return sorted(items, key=_person_name)
        if sort_by == "name_desc":
            return sorted(items, key=_person_name, reverse=True)
        if sort_by in ("library_count", "library_count_desc"):
            return sorted(items, key=lambda item: (item.get("library_count") or 0, item.get("rating") or 0), reverse=True)
        if sort_by == "library_count_asc":
            return sorted(items, key=lambda item: (item.get("library_count") or 0, item.get("rating") or 0))
        return sorted(items, key=_title)
