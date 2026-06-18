import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useFullMetadataQuery, usePersonDetailQuery, useLibraryCollectionDetailQuery } from '@/queries/metadataQueries';
import { useTranslation } from '@/providers/LanguageContext';
import { resolveDetailsImageUrl } from '../../utils/detailUtils';
import { buildTmdbImageUrl, TMDB_IMAGE_SIZES } from '@/lib/imageUrls';
import { API_BASE } from '@/lib/backend';
import EmptyState from '@/ui/EmptyState';
import BackdropCard from '@/ui/BackdropCard';
import '../detail/panels/BackdropsPanel.css'; // Reuse existing backdrop panel grid styles

export default function TMDBImageGrid({
  itemId,
  mediaType,
  imageType = 'backdrop', // 'backdrop' | 'poster' | 'logo'
  customImages,
  currentPath,
  onSelect,
  isPending,
  pendingPath,
  initialVisibleCount,
  visibleStep,
  t,
}) {
  const { locale } = useTranslation();
  const isPerson = mediaType === 'person';
  const isCollection = mediaType === 'collection';
  const [visibleCount, setVisibleCount] = useState(() => initialVisibleCount ?? Number.POSITIVE_INFINITY);
  const loadMoreRef = useRef(null);
  const metadataLanguage = locale === 'en' ? 'en-US' : locale;

  // Extract clean ID if it starts with collection_
  const cleanItemId = useMemo(() => {
    if (typeof itemId === 'string' && itemId.startsWith('collection_')) {
      return itemId.replace('collection_', '');
    }
    return itemId;
  }, [itemId]);

  const { data: fullMetadata, isLoading: isLoadingMetadata } = useFullMetadataQuery(cleanItemId, mediaType, {
    enabled: !customImages && Boolean(cleanItemId) && !isPerson && !isCollection,
    language: metadataLanguage,
  });

  const { data: personDetail, isLoading: isLoadingPerson } = usePersonDetailQuery(cleanItemId, {
    enabled: !customImages && Boolean(cleanItemId) && isPerson,
  });

  const { data: collectionDetail, isLoading: isLoadingCollection } = useLibraryCollectionDetailQuery(cleanItemId, {
    enabled: !customImages && Boolean(cleanItemId) && isCollection,
    language: metadataLanguage,
  });

  const isLoading = isLoadingMetadata || isLoadingPerson || isLoadingCollection;

  const images = useMemo(() => {
    if (customImages) return customImages;

    if (isPerson) {
      if (!personDetail?.images) return [];
      return personDetail.images.map((img) => ({
        file_path: img,
        width: 0,
        height: 0,
        vote_average: 0,
      }));
    }

    if (isCollection) {
      const collectionPosterOptions = Array.isArray(collectionDetail?.collection_posters)
        ? collectionDetail.collection_posters
        : Array.isArray(collectionDetail?.posters)
          ? collectionDetail.posters
          : Array.isArray(collectionDetail?.images?.posters)
            ? collectionDetail.images.posters
            : [];

      return collectionPosterOptions.map((img) => ({
        file_path: img.file_path || img.poster_path || img.path,
        width: img.width,
        height: img.height,
        vote_average: img.vote_average,
      }));
    }

    const activeMatch = fullMetadata?.matches?.find((m) => m.is_active);
    const apiResponse = activeMatch
      ? Object.values(activeMatch.api_responses || {})[0] ||
        Object.values(activeMatch.series_api_responses || {})[0]
      : null;

    if (!apiResponse?.images) return [];

    let rawList = [];
    if (imageType === 'backdrop') {
      rawList = apiResponse.images.backdrops || [];
    } else if (imageType === 'poster') {
      rawList = apiResponse.images.posters || [];
    } else if (imageType === 'logo') {
      rawList = apiResponse.images.logos || [];
    }

    // Filter and map standard TMDB images
    return rawList.map((img) => ({
      file_path: img.file_path,
      width: img.width,
      height: img.height,
      vote_average: img.vote_average,
    }));
  }, [fullMetadata, personDetail, collectionDetail, imageType, customImages, isPerson, isCollection]);

  const normalizedCurrent = useMemo(() => {
    if (!currentPath) return '';
    const parts = currentPath.split('/');
    return parts[parts.length - 1].toLowerCase();
  }, [currentPath]);

  const selectedIndex = useMemo(
    () => images.findIndex((img) => {
      const path = img.file_path || img.backdrop_path || img.poster_path || img.logo_path;
      if (!path || !normalizedCurrent) return false;
      return path.split('/').pop().toLowerCase() === normalizedCurrent;
    }),
    [images, normalizedCurrent]
  );

  useEffect(() => {
    const baseVisibleCount = initialVisibleCount ?? Number.POSITIVE_INFINITY;
    const minimumVisibleCount = selectedIndex >= 0
      ? Math.max(baseVisibleCount, selectedIndex + 1)
      : baseVisibleCount;
    setVisibleCount(minimumVisibleCount);
  }, [images, initialVisibleCount, selectedIndex]);

  const displayedImages = useMemo(
    () => images.slice(0, visibleCount),
    [images, visibleCount]
  );

  const hasMore = displayedImages.length < images.length;

  const handleLoadMore = () => {
    const step = visibleStep ?? initialVisibleCount ?? 16;
    setVisibleCount((prev) => Math.min(images.length, prev + step));
  };

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current || !Number.isFinite(visibleCount)) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      {
        root: null,
        rootMargin: '240px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, visibleCount, images.length]);

  const handleSelectImage = (path) => {
    if (onSelect) {
      onSelect(path);
    }
  };

  if (isLoading) {
    return (
      <div className="backdrops-grid">
        {Array.from({ length: 8 }).map((_, index) => (
          <BackdropCard key={`skeleton-${index}`} disabled={true} />
        ))}
      </div>
    );
  }

  return (
    <div className="backdrops-panel">
      <div className={`backdrops-grid ${imageType === 'logo' ? 'backdrops-grid--logo' : ''}`}>
        {displayedImages.map((img, idx) => {
          const path = img.file_path || img.backdrop_path || img.poster_path || img.logo_path;
          if (!path) return null;

          // Determine sizes and urls based on imageType
          let thumbUrl = '';
          if (imageType === 'backdrop') {
            thumbUrl = path.startsWith('/')
              ? buildTmdbImageUrl(path, TMDB_IMAGE_SIZES.backdropThumb)
              : resolveDetailsImageUrl(path, API_BASE, 'backdrop');
          } else if (imageType === 'poster') {
            thumbUrl = path.startsWith('/')
              ? buildTmdbImageUrl(path, isPerson ? TMDB_IMAGE_SIZES.personThumb : TMDB_IMAGE_SIZES.posterThumb)
              : resolveDetailsImageUrl(path, API_BASE, isPerson ? 'person' : 'poster');
          } else {
            // Logo or generic
            thumbUrl = buildTmdbImageUrl(path, TMDB_IMAGE_SIZES.posterThumb);
          }

          const normalizedPath = path.split('/').pop().toLowerCase();
          const isSelected = normalizedCurrent !== '' && normalizedCurrent === normalizedPath;
          const isImagePending = isPending && pendingPath === path;

          const infoLeft = img.width && img.height ? `${img.width}×${img.height}` : '';
          const infoRight = img.vote_average ? `★ ${img.vote_average.toFixed(1)}` : '';

          return (
            <BackdropCard
              key={`${path}-${idx}`}
              imageUrl={thumbUrl}
              alt={`${imageType} ${idx + 1}`}
              isSelected={isSelected}
              isPending={isImagePending}
              infoLeft={infoLeft}
              infoRight={infoRight}
              onClick={() => handleSelectImage(path)}
              className={imageType === 'logo' ? 'ui-backdrop-card--logo' : (imageType === 'poster' ? 'ui-backdrop-card--poster' : '')}
            />
          );
        })}

        {images.length === 0 && (
          <EmptyState
            variant="detail-panel"
            icon={ImageOff}
            className="backdrops-panel__empty-state"
            title={t?.('library.details.noImagesAvailable') || `No ${imageType} options found.`}
          />
        )}

        {hasMore && (
          <div ref={loadMoreRef} className="backdrops-panel__load-more-trigger" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
