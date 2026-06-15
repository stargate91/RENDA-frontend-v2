import { useMemo } from 'react';
import { useAllTagsQuery, useTagsQuery } from '@/queries/libraryQueries';

export function useLibraryTags({ activeSessionMode }) {
  const isNsfw = activeSessionMode === 'nsfw';
  const { data: tagsData, isLoading: isTagsLoading } = useTagsQuery(isNsfw);
  const { data: allTags = [], isLoading: isAllTagsLoading } = useAllTagsQuery(isNsfw);

  const processedTags = useMemo(() => {
    const usageTags = Array.isArray(tagsData) ? tagsData : [];
    const allDefinedTags = Array.isArray(allTags) ? allTags : [];
    const isNsfw = activeSessionMode === 'nsfw';
    const usageByName = new Map(
      usageTags.map((tag) => [tag.name?.toLowerCase?.() || '', tag])
    );

    const mergedTags = [...allDefinedTags];
    const seen = new Set();

    usageTags.forEach((tag) => {
      const key = tag.name?.toLowerCase?.() || '';
      if (!key || allDefinedTags.some((definedTag) => (definedTag.name?.toLowerCase?.() || '') === key)) {
        return;
      }
      mergedTags.push(tag);
    });

    return mergedTags
      .filter((tag) => {
        const key = tag.name?.toLowerCase?.() || '';
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((definedTag) => {
        const usageTag = usageByName.get(definedTag.name?.toLowerCase?.() || '') || definedTag;
        const tag = {
          ...definedTag,
          ...usageTag,
          custom_images: usageTag.custom_images ?? definedTag.custom_images,
          color: usageTag.color ?? definedTag.color,
        };
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
          mode_items: modeItems,
          sample_previews: localPreviews,
        };
      });
  }, [tagsData, allTags, activeSessionMode]);

  return {
    tagsData,
    processedTags,
    isTagsLoading: isTagsLoading || isAllTagsLoading,
  };
}
