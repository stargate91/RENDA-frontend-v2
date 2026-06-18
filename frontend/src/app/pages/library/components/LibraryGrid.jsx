import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayMediaMutation } from '@/queries';
import api from '@/lib/api';
import Badge from '@/ui/Badge';
import PosterGrid from '@/ui/PosterGrid';
import PosterCard from '@/ui/PosterCard';
import EmptyState from '@/ui/EmptyState';
import Button from '@/ui/Button';
import IconButton from '@/ui/IconButton';
import NavButton from '@/ui/NavButton';
import { resolveMediaImageUrl } from '@/lib/imageUrls';
import {
  getLibraryTagBucketKeys,
  isLibraryMovieTab,
  isLibraryPeopleTab,
  isLibrarySeriesTab,
  isLibraryTagsTab,
} from '@/lib/libraryTabs';
import { isMovieMediaType, isPersonMediaType, isTvLikeMediaType } from '@/lib/mediaTypes';
import { Heart, Pencil, Play, Plus, Trash2, UserPlus } from 'lucide-react';

const renderUserRatingBadge = (item) => {
  const rating = Number(item?.user_rating);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  const label = Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
  return (
    <Badge className="ui-poster-card__user-rating-badge">
      {label}
    </Badge>
  );
};

const renderFavoriteBadge = (item, t) => {
  if (!item?.is_favorite) return null;
  return (
    <div
      className="ui-poster-card__favorite-badge"
      title={t('library.filter.favorite') || 'Favourite'}
      aria-label={t('library.filter.favorite') || 'Favourite'}
    >
      <Heart size={14} fill="currentColor" strokeWidth={2.2} />
    </div>
  );
};

export default function LibraryGrid({
  t,
  isDataLoading,
  paginatedItems,
  isTags,
  isCollections,
  resolvedTab,
  emptyTitle,
  emptyDescription,
  emptyStateVariant,
  emptyIcon,
  hasActiveFilters,
  onAddPeople,
  onCreateTag,
  onEditTag,
  onDeleteTag,
  focusedTag,
  onFocusTag,
  onExitTagFocus,
  activeSessionMode,
}) {
  const navigate = useNavigate();
  const playMutation = usePlayMediaMutation();

  const getNextOwnedEpisode = (seriesDetail) => {
    const seasons = Array.isArray(seriesDetail?.seasons) ? seriesDetail.seasons : [];

    for (const season of seasons) {
      const ownedEpisodes = (season.episodes || []).filter((episode) => episode.path && !episode.is_missing);
      const inProgress = ownedEpisodes.find((episode) => episode.resume_position > 0);
      if (inProgress) return inProgress;
    }

    for (const season of seasons) {
      const ownedEpisodes = (season.episodes || []).filter((episode) => episode.path && !episode.is_missing);
      const unwatched = ownedEpisodes.find((episode) => !episode.is_watched);
      if (unwatched) return unwatched;
    }

    for (const season of seasons) {
      const ownedEpisodes = (season.episodes || []).filter((episode) => episode.path && !episode.is_missing);
      if (ownedEpisodes.length > 0) return ownedEpisodes[0];
    }

    return null;
  };

  const handlePlayOverlayClick = async (event, item) => {
    event.stopPropagation();

    if (playMutation.isPending) return;

    if (isLibraryMovieTab(resolvedTab)) {
      playMutation.mutate(item.id);
      return;
    }

    if (!isLibrarySeriesTab(resolvedTab)) return;

    try {
      const seriesId = String(item.id).startsWith('series_') ? String(item.id).slice(7) : item.id;
      const seriesDetail = await api.library.getSeriesDetail(seriesId);
      const nextEpisode = getNextOwnedEpisode(seriesDetail);
      if (nextEpisode?.id) {
        playMutation.mutate(nextEpisode.id);
      }
    } catch {
      // Ignore overlay play failures and leave normal card navigation intact.
    }
  };

  const handleItemClick = (item) => {
    if (isTags) return;

    if (isCollections) {
      navigate(`/library/collection/${item.tmdb_id || item.id}`);
    } else if (isLibraryPeopleTab(resolvedTab)) {
      navigate(`/library/people/${item.id}`);
    } else if (isLibraryMovieTab(resolvedTab)) {
      navigate(`/library/movie/${item.id}`);
    } else if (isLibrarySeriesTab(resolvedTab)) {
      navigate(`/library/series/${item.id}`);
    }
  };
  const resolvePosterUrl = (path) => {
    return resolveMediaImageUrl(path, 'poster');
  };



  const getCardProps = (item) => {
    if (isTags) {
      return {
        title: item.name,
        subtitle: t('library.tags.itemsCount', { count: item.total_count }),
        icon: emptyIcon,
      };
    }
    if (isCollections) {
      return {
        title: item.name || item.title,
        subtitle: t('library.collections.partsCount', { owned: item.owned_count, total: item.total_count }),
        imageUrl: resolvePosterUrl(item.displayPoster || item.poster_path),
        icon: emptyIcon,
        ratingImdb: item.rating_imdb,
        ratingTmdb: item.rating,
      };
    }
    if (isLibraryPeopleTab(resolvedTab)) {
      return {
        title: item.name || item.title,
        subtitle: item.people_role ? t(`library.people.roles.${item.people_role}`, { defaultValue: item.people_role }) : '',
        imageUrl: resolvePosterUrl(item.displayPoster || item.poster_path),
        icon: emptyIcon,
        className: 'library-person-card',
        badge: renderUserRatingBadge(item),
        topRightBadge: renderFavoriteBadge(item, t),
      };
    }
    const subtitleParts = [];
    if (item.year) subtitleParts.push(item.year);
    if (item.info) {
      subtitleParts.push(item.info);
    }
    return {
      title: item.title,
      subtitle: subtitleParts.join(' • '),
      imageUrl: resolvePosterUrl(item.displayPoster || item.poster_path || item.local_poster_path),
      icon: emptyIcon,
      backgroundColor: item.color,
      badge: renderUserRatingBadge(item),
      ratingImdb: item.rating_imdb,
      ratingTmdb: item.rating,
      playOverlay: item.in_library !== false && (isLibraryMovieTab(resolvedTab) || isLibrarySeriesTab(resolvedTab))
        ? {
            onClick: (event) => {
              void handlePlayOverlayClick(event, item);
            },
            title: isLibrarySeriesTab(resolvedTab)
              ? (t('library.details.continue') || 'Continue')
              : ((item.resume_position || 0) > 0 ? (t('library.details.resume') || 'Resume') : (t('library.details.play') || 'Play')),
            label: isLibrarySeriesTab(resolvedTab)
              ? (t('library.details.continue') || 'Continue')
              : ((item.resume_position || 0) > 0 ? (t('library.details.resume') || 'Resume') : (t('library.details.play') || 'Play')),
            disabled: playMutation.isPending,
            icon: <Play size={12} fill="currentColor" />,
          }
        : null,
    };
  };

  if (isDataLoading && paginatedItems.length === 0) {
    return (
      <div className="library-content">
        <div className="library-loading">
          <div className="library-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="library-content">
      {focusedTag || paginatedItems.length > 0 ? (
        isTags ? (
          focusedTag ? (
            <div className="library-tag-focus-view">
              <div className="library-tag-focus-view__toolbar">
                <NavButton className="library-tag-focus-view__back" onClick={onExitTagFocus}>
                  {t('library.tags.backToTags') || 'Back to Tags'}
                </NavButton>
              </div>
              <ExpandedTagPanel
                key={focusedTag.name}
                tag={focusedTag}
                t={t}
                resolvePosterUrl={resolvePosterUrl}
                emptyIcon={emptyIcon}
                isFocusMode
                activeSessionMode={activeSessionMode}
              />
            </div>
          ) : (
            <div className="library-tags-grid">
              {paginatedItems.map((item, index) => {
                const samplePreviews = Array.isArray(item.sample_previews) ? item.sample_previews.slice(0, 3) : [];
                const previewCount = samplePreviews.length;
                const singlePreview = previewCount === 1 ? samplePreviews[0] : null;
                 const singlePreviewImage = (() => {
                   if (!singlePreview) return '';
                   const isPerson = isPersonMediaType(singlePreview.kind);
                   if (isPerson) {
                     return singlePreview.backdrop ? resolvePosterUrl(singlePreview.backdrop) : '';
                   }
                   return resolvePosterUrl(singlePreview.backdrop || singlePreview.poster);
                 })();
                return (
                <div
                  key={item.name}
                  role="button"
                  tabIndex={0}
                  className={`library-tag-card ${previewCount > 0 ? `library-tag-card--preview-${Math.min(previewCount, 3)}` : ''}`.trim()}
                  onClick={() => onFocusTag?.(item.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onFocusTag?.(item.name);
                    }
                  }}
                  /* eslint-disable-next-line react/forbid-dom-props */
                  style={{
                    '--tag-color': item.color || 'var(--color-accent)',
                    '--item-index': index,
                  }}
                >
                  {(previewCount > 1 || singlePreviewImage) ? (
                    <div className="library-tag-card__preview" aria-hidden="true">
                      {samplePreviews.map((preview, index) => (
                        <div
                          key={`${item.name}-preview-${index}`}
                          className="library-tag-card__preview-image"
                          /* eslint-disable-next-line react/forbid-dom-props */
                          style={{
                            backgroundImage: `url(${previewCount === 1 ? singlePreviewImage : resolvePosterUrl(preview.poster)})`,
                            backgroundPositionX: preview.position_x != null ? `${preview.position_x}%` : 'center',
                            backgroundPositionY: preview.position_y != null ? `${preview.position_y}%` : 'center',
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className="library-tag-card__actions">
                    <IconButton
                      type="button"
                      size="xs"
                      variant="ghost"
                      label={t('library.tags.editBtn') || 'Edit Tag'}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditTag?.(item);
                      }}
                    >
                      <Pencil size={12} />
                    </IconButton>
                    <IconButton
                      type="button"
                      size="xs"
                      variant="ghost"
                      label={t('library.tags.deleteBtn') || 'Delete Tag'}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteTag?.(item);
                      }}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                  <div className="library-tag-card__color-badge" />
                  <div className="library-tag-card__content">
                    <span className="library-tag-card__name">{item.name}</span>
                    <span className="library-tag-card__count">
                      {t('library.tags.itemsCount', { count: item.total_count })}
                    </span>
                  </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <PosterGrid>
            {paginatedItems.map((item, index) => (
              <PosterCard
                key={item.id}
                customStyle={{ '--item-index': index }}
                onClick={() => handleItemClick(item)}
                isWatched={item.is_watched}
                {...getCardProps(item)}
              />
            ))}
          </PosterGrid>
        )
      ) : (
        <EmptyState
          variant={emptyStateVariant}
          title={emptyTitle}
          description={emptyDescription}
          icon={emptyIcon}
          actions={
            isLibraryPeopleTab(resolvedTab) && onAddPeople && !hasActiveFilters ? (
              <Button variant="primary" size="sm" onClick={onAddPeople}>
                <UserPlus size={16} />
                {t('library.people.addPeopleBtn') || 'Add People'}
              </Button>
            ) : isLibraryTagsTab(resolvedTab) && onCreateTag && !hasActiveFilters ? (
              <Button variant="primary" size="sm" onClick={onCreateTag}>
                <Plus size={16} />
                {t('library.tags.createBtn') || 'Create Tag'}
              </Button>
            ) : null
          }
        />
      )}
    </div>
  );
}

function ExpandedTagPanel({ tag, t, resolvePosterUrl, emptyIcon, isFocusMode = false, activeSessionMode }) {
  const navigate = useNavigate();
  const allItems = useMemo(() => {
    if (Array.isArray(tag.mode_items)) {
      return tag.mode_items;
    }
    return getLibraryTagBucketKeys(activeSessionMode).flatMap((key) => tag[key] || []);
  }, [tag, activeSessionMode]);

  const [visibleCount, setVisibleCount] = useState(20);
  const paginatedItems = allItems.slice(0, visibleCount);
  const hasMore = allItems.length > visibleCount;

  const getCardProps = (item) => {
    const isPerson = isPersonMediaType(item.type);
    if (isPerson) {
      return {
        variant: isFocusMode ? 'overlay-title' : 'default',
        title: item.name || item.title,
        subtitle: item.people_role ? t(`library.people.roles.${item.people_role}`, { defaultValue: item.people_role }) : '',
        imageUrl: resolvePosterUrl(item.displayPoster || item.poster_path),
        icon: emptyIcon,
        className: 'library-person-card',
        badge: renderUserRatingBadge(item),
        topRightBadge: renderFavoriteBadge(item, t),
      };
    }
    const subtitleParts = [];
    if (item.year) subtitleParts.push(item.year);
    if (item.info) subtitleParts.push(item.info);
    return {
      variant: isFocusMode ? 'overlay-title' : 'default',
      title: item.title,
      subtitle: subtitleParts.join(' • '),
      imageUrl: resolvePosterUrl(item.displayPoster || item.poster_path || item.local_poster_path),
      icon: emptyIcon,
      backgroundColor: item.color,
      badge: renderUserRatingBadge(item),
      ratingImdb: item.rating_imdb,
      ratingTmdb: item.rating,
    };
  };

  if (allItems.length === 0) {
    return (
      <div
        className={`library-tag-expanded-panel ${isFocusMode ? 'is-focus-mode' : ''}`.trim()}
        /* eslint-disable-next-line react/forbid-dom-props */
        style={{ '--tag-color': tag.color || 'var(--color-accent)' }}
      >
        {isFocusMode ? (
          <div className="library-tag-expanded-panel__header">
            <div className="library-tag-expanded-panel__title-row">
              <h2 className="library-tag-expanded-panel__title">
                {(t('library.tags.focusTitle') || 'Items tagged with "{name}"').replace('{name}', tag.name)}
              </h2>
            </div>
          </div>
        ) : null}
        <EmptyState
          variant="tag-focus"
          title={(t('library.tags.emptyFocusTitle') || 'This tag is ready to use.').replace('{name}', tag.name)}
          description={(t('library.tags.emptyFocusDescription') || 'Add this tag to movies, shows, or people and they will appear here.').replace('{name}', tag.name)}
        />
      </div>
    );
  }

  return (
    <div
      className={`library-tag-expanded-panel ${isFocusMode ? 'is-focus-mode' : ''}`.trim()}
      /* eslint-disable-next-line react/forbid-dom-props */
      style={{ '--tag-color': tag.color || 'var(--color-accent)' }}
    >
      {isFocusMode ? (
        <div className="library-tag-expanded-panel__header">
          <div className="library-tag-expanded-panel__title-row">
            <h2 className="library-tag-expanded-panel__title">
              {(t('library.tags.focusTitle') || 'Items tagged with "{name}"').replace('{name}', tag.name)}
            </h2>
          </div>
        </div>
      ) : null}
      <PosterGrid>
        {paginatedItems.map((item) => (
          <PosterCard
            key={item.id}
            isWatched={item.is_watched}
            onClick={() => {
              const isPerson = isPersonMediaType(item.type);
              if (isPerson) {
                navigate(`/library/people/${item.id}`);
                return;
              }
              if (isMovieMediaType(item.type)) {
                navigate(`/library/movie/${item.id}`);
              } else if (isTvLikeMediaType(item.type)) {
                navigate(`/library/series/${item.id}`);
              }
            }}
            {...getCardProps(item)}
          />
        ))}
      </PosterGrid>

      {hasMore && (
        <div className="library-grid-load-more">
          <Button variant="secondary" onClick={() => setVisibleCount(prev => prev + 20)}>
            {t('common.showMore') || 'Show More'}
          </Button>
        </div>
      )}
    </div>
  );
}
