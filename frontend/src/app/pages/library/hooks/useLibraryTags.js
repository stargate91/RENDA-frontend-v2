import { useMemo } from 'react';
import { useTagsQuery } from '@/queries/libraryQueries';

export function useLibraryTags({ activeSessionMode }) {
  const isNsfw = activeSessionMode === 'nsfw';
  const { data: tagsData, isLoading: isTagsLoading } = useTagsQuery(isNsfw);

  const processedTags = useMemo(() => {
    if (!tagsData) return [];
    const isNsfw = activeSessionMode === 'nsfw';
    return tagsData
      .map(tag => {
        const localCount = isNsfw
          ? (tag.adult?.length || 0) + (tag.adult_series?.length || 0) + (tag.adult_people?.length || 0)
          : (tag.movies?.length || 0) + (tag.series?.length || 0) + (tag.people?.length || 0);

        const modeItems = isNsfw
          ? [...(tag.adult || []), ...(tag.adult_series || []), ...(tag.adult_people || [])]
          : [...(tag.movies || []), ...(tag.series || []), ...(tag.people || [])];

        const hasCustomImages = Array.isArray(tag.custom_images) && tag.custom_images.length > 0;
        const localPreviews = hasCustomImages
          ? tag.sample_previews
          : (() => {
              const list = [];
              const seenPosters = new Set();
              for (const item of modeItems) {
                const poster = item.displayPoster || item.local_poster_path || item.poster_path;
                const backdrop = item.local_backdrop_path || item.backdrop_path;
                if ((poster || backdrop) && !seenPosters.has(poster)) {
                  list.push({
                    poster,
                    backdrop,
                    kind: item.type,
                  });
                  seenPosters.add(poster);
                  if (list.length >= 3) break;
                }
              }
              return list;
            })();

        return {
          ...tag,
          total_count: localCount,
          sample_previews: localPreviews,
        };
      });
  }, [tagsData, activeSessionMode]);

  return {
    tagsData,
    processedTags,
    isTagsLoading,
  };
}
