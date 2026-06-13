import PosterGrid from '@/ui/PosterGrid';
import PosterCard from '@/ui/PosterCard';
import EmptyState from '@/ui/EmptyState';
import { API_BASE } from '@/lib/backend';

export default function LibraryGrid({
  t,
  isDataLoading,
  paginatedItems,
  isTags,
  isCollections,
  resolvedTab,
  emptyTitle,
  emptyDescription,
  emptyIcon,
}) {
  const resolvePosterUrl = (path) => {
    if (!path) return '';
    if (String(path).startsWith('http://') || String(path).startsWith('https://')) {
      return path;
    }
    if (String(path).startsWith('/') && !String(path).startsWith('/images/')) {
      return `https://image.tmdb.org/t/p/w342${path}`;
    }
    return `${API_BASE}${path}`;
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
    if (resolvedTab === 'people' || resolvedTab === 'adult_people') {
      return {
        title: item.title,
        subtitle: item.people_role ? t(`library.people.roles.${item.people_role}`, { defaultValue: item.people_role }) : '',
        imageUrl: resolvePosterUrl(item.displayPoster || item.poster_path),
        icon: emptyIcon,
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
      ratingImdb: item.rating_imdb,
      ratingTmdb: item.rating,
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
      {paginatedItems.length > 0 ? (
        <PosterGrid>
          {paginatedItems.map((item) => (
            <PosterCard
              key={isTags ? item.name : item.id}
              {...getCardProps(item)}
            />
          ))}
        </PosterGrid>
      ) : (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          icon={emptyIcon}
        />
      )}
    </div>
  );
}
