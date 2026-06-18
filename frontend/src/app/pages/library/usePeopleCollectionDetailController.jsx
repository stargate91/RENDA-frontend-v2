import { useMemo, useState } from 'react';
import Button from '@/ui/Button';
import { useOverridePersonBackdropMutation, useUpdatePersonStatusMutation } from '@/queries/libraryQueries';
import { useOverrideBackdropMutation } from '@/queries/mediaQueries';
import {
  useLibraryCollectionDetailQuery,
  usePersonDetailQuery,
} from '@/queries/metadataQueries';
import { API_BASE } from '@/lib/backend';
import { resolveDetailsImageUrl } from './utils/detailUtils';
import {
  buildEntityMetaPills,
  buildPersonExternalLinks,
} from './peopleCollectionDetailUtils.jsx';
import PersonBackdropPickerModal from './components/entityDetail/PersonBackdropPickerModal';
import {
  CollectionBackdropsPanel,
} from './components/entityDetail/EntityDetailSections';
import ReviewModalContent from './components/detail/modals/ReviewModalContent';

export default function usePeopleCollectionDetailController({
  id,
  isPeople,
  t,
  openModal,
  closeModal,
  toast,
}) {
  const [hoveredRating, setHoveredRating] = useState(null);
  const [isActivateHovered, setIsActivateHovered] = useState(false);

  const personQuery = usePersonDetailQuery(id, { enabled: isPeople && Boolean(id) });
  const collectionQuery = useLibraryCollectionDetailQuery(id, { enabled: !isPeople && Boolean(id) });
  const updatePersonStatusMutation = useUpdatePersonStatusMutation();
  const overrideBackdropMutation = useOverrideBackdropMutation();
  const overridePersonBackdropMutation = useOverridePersonBackdropMutation();

  const item = isPeople ? personQuery.data : collectionQuery.data;
  const isLoading = isPeople ? personQuery.isLoading : collectionQuery.isLoading;
  const queryError = isPeople ? personQuery.error : collectionQuery.error;
  const hasError = isPeople ? personQuery.isError : collectionQuery.isError;
  const overviewTitle = isPeople
    ? (t('library.details.biographyTitle') || 'Biography')
    : (t('library.details.collectionOverviewTitle') || 'Overview');
  const overviewText = item?.biography || item?.overview || '';
  const overviewEmptyText = t('library.details.noOverviewAvailable') || 'No overview available.';
  const externalLinks = useMemo(
    () => (isPeople ? buildPersonExternalLinks(item, t) : []),
    [isPeople, item, t]
  );
  const profileLinks = useMemo(
    () => externalLinks.filter((link) => link.key === 'tmdb' || link.key === 'imdb'),
    [externalLinks]
  );
  const backdropUrl = resolveDetailsImageUrl(item?.backdrop_path, API_BASE, 'backdrop');
  const mediaUrl = resolveDetailsImageUrl(
    isPeople ? item?.profile_path : item?.poster_path,
    API_BASE,
    'poster'
  );
  const metaPills = useMemo(
    () => buildEntityMetaPills({ isPeople, item, t }),
    [isPeople, item, t]
  );
  const currentRating = item?.user_rating ?? null;
  const displayRating = hoveredRating !== null ? hoveredRating : currentRating;
  const starsFillPercent = displayRating ? (displayRating / 10) * 100 : 0;
  const starsStyleSheetText = `.rating-stars-overlay-dynamic { width: ${starsFillPercent}% !important; }`;
  const canChoosePeopleBackdrop = Number(item?.total_movie_credits) > 0
    || Number(item?.total_series_credits) > 0
    || (item?.known_for || []).length > 0;
  const canChooseCollectionBackdrop = Boolean(
    item?.collection_backdrops?.some((bd) => (!bd?.iso_639_1 || bd.iso_639_1 === '') && Number(bd?.width) >= 1280)
    || item?.movies?.some((movie) => movie?.backdrop_path)
  );

  const handlePeopleRatingMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    let val = Math.ceil(percent * 20) / 2;
    val = Math.max(0.5, Math.min(10.0, val));
    setHoveredRating(val);
  };

  const handlePeopleRatingMouseLeave = () => {
    setHoveredRating(null);
  };

  const handlePeopleRatingClick = () => {
    if (!isPeople || hoveredRating === null || !item?.id) {
      return;
    }
    const isSame = currentRating !== null && currentRating !== undefined && Number(currentRating) === Number(hoveredRating);
    updatePersonStatusMutation.mutate({
      personId: item.id,
      payload: {
        user_rating: isSame ? null : hoveredRating,
      },
    });
  };

  const handleToggleFavorite = () => {
    if (!isPeople || !item?.id) {
      return;
    }
    updatePersonStatusMutation.mutate({
      personId: item.id,
      payload: {
        is_favorite: !item?.is_favorite,
      },
    });
  };

  const handleToggleActive = () => {
    if (!isPeople || !item?.id) {
      return;
    }
    updatePersonStatusMutation.mutate({
      personId: item.id,
      payload: {
        is_active: !item?.is_active,
      },
    });
  };

  const handleOpenReviewModal = () => {
    if (!isPeople || !item?.id) {
      return;
    }

    openModal({
      title: t('library.details.writeReview') || 'Write Review',
      content: (
        <ReviewModalContent
          initialComment={item?.user_comment}
          onSave={(newComment) => {
            updatePersonStatusMutation.mutate({
              personId: item.id,
              payload: {
                user_comment: newComment || null,
              },
            });
            closeModal();
          }}
          t={t}
        />
      ),
      footer: (
        <div className="modal-footer-row">
          <Button variant="secondary-neutral" onClick={closeModal}>
            {t('common.close') || 'Close'}
          </Button>
          <Button variant="primary" type="submit" form="review-modal-form">
            {t('common.save') || 'Save'}
          </Button>
        </div>
      ),
    });
  };

  const handleOpenCollectionBackdropModal = () => {
    if (isPeople || !item?.tmdb_id) {
      return;
    }

    openModal({
      title: t('library.details.chooseBackdrop') || 'Choose Backdrop',
      variant: 'extra-wide',
      content: (
        <CollectionBackdropsPanel
          item={item}
          collectionId={item.tmdb_id}
          t={t}
          toast={toast}
          overrideBackdropMutation={overrideBackdropMutation}
        />
      ),
    });
  };

  const handleOpenPeopleBackdropModal = () => {
    if (!isPeople || !item?.id) {
      return;
    }

    openModal({
      title: t('library.details.chooseBackdrop') || 'Choose Backdrop',
      variant: 'extra-wide',
      className: 'person-backdrop-picker-modal',
      content: (
        <PersonBackdropPickerModal
          personId={item.id}
          item={item}
          t={t}
          toast={toast}
          overridePersonBackdropMutation={overridePersonBackdropMutation}
        />
      ),
    });
  };

  return {
    item,
    isLoading,
    queryError,
    hasError,
    overviewTitle,
    overviewText,
    overviewEmptyText,
    profileLinks,
    backdropUrl,
    mediaUrl,
    metaPills,
    displayRating,
    isActivateHovered,
    starsStyleSheetText,
    canChoosePeopleBackdrop,
    canChooseCollectionBackdrop,
    updatePersonStatusMutation,
    setIsActivateHovered,
    handlePeopleRatingMouseMove,
    handlePeopleRatingMouseLeave,
    handlePeopleRatingClick,
    handleToggleFavorite,
    handleToggleActive,
    handleOpenReviewModal,
    handleOpenCollectionBackdropModal,
    handleOpenPeopleBackdropModal,
  };
}
