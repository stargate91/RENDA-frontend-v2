import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/ui/Button';
import { useOverridePersonBackdropMutation, useUploadPersonBackdropMutation, useUpdatePersonStatusMutation } from '@/queries/libraryQueries';
import { useOverrideBackdropMutation, useUploadBackdropMutation } from '@/queries/mediaQueries';
import {
  useLibraryCollectionDetailQuery,
  usePersonDetailQuery,
} from '@/queries/metadataQueries';
import { useLibraryModeStore } from '@/stores/useLibraryModeStore';
import { API_BASE } from '@/lib/backend';
import { resolveDetailsImageUrl } from './utils/detailUtils';
import {
  buildEntityMetaPills,
  buildEntityExtraMetaPills,
  buildPersonExternalLinks,
} from './peopleCollectionDetailUtils.jsx';
import { getPosterImagePath, getProfileImagePath } from '@/lib/imageUrls';
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
  const uploadBackdropMutation = useUploadBackdropMutation();
  const overridePersonBackdropMutation = useOverridePersonBackdropMutation();
  const uploadPersonBackdropMutation = useUploadPersonBackdropMutation();

  const item = isPeople ? personQuery.data : collectionQuery.data;
  const isLoading = isPeople ? personQuery.isLoading : collectionQuery.isLoading;
  const queryError = isPeople ? personQuery.error : collectionQuery.error;
  const hasError = isPeople ? personQuery.isError : collectionQuery.isError;

  const navigate = useNavigate();
  const sessionMode = useLibraryModeStore((state) => state.sessionMode);

  useEffect(() => {
    if (!isLoading && (!item || (item && item.is_adult)) && sessionMode !== 'nsfw') {
      navigate('/dashboard', { replace: true });
    }
  }, [isLoading, item, sessionMode, navigate]);

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
    () => {
      if (isPeople && item?.is_adult) {
        const order = ['imdb', 'tmdb', 'stashdb', 'fansdb', 'theporndb'];
        const chosen = [];
        for (const key of order) {
          const found = externalLinks.find((link) => link.key === key);
          if (found) {
            chosen.push(found);
            if (chosen.length === 2) {
              break;
            }
          }
        }
        return chosen;
      }
      return externalLinks.filter((link) => link.key === 'tmdb' || link.key === 'imdb');
    },
    [externalLinks, isPeople, item?.is_adult]
  );
  const extraLinks = useMemo(
    () => {
      if (!isPeople) return [];
      const profileLinkKeys = profileLinks.map((pl) => pl.key);
      return externalLinks.filter((link) => !profileLinkKeys.includes(link.key));
    },
    [isPeople, externalLinks, profileLinks]
  );
  const backdropUrl = resolveDetailsImageUrl(item?.backdrop_path, API_BASE, 'backdrop');
  const mediaUrl = resolveDetailsImageUrl(
    isPeople ? getProfileImagePath(item) : getPosterImagePath(item),
    API_BASE,
    isPeople ? 'person' : 'poster'
  );
  const metaPills = useMemo(
    () => buildEntityMetaPills({ isPeople, item, t }),
    [isPeople, item, t]
  );
  const extraMetaPills = useMemo(
    () => buildEntityExtraMetaPills({ isPeople, item, t }),
    [isPeople, item, t]
  );
  const currentRating = item?.user_rating ?? null;
  const displayRating = hoveredRating !== null ? hoveredRating : currentRating;
  const starsFillPercent = displayRating ? (displayRating / 10) * 100 : 0;
  const starsStyleSheetText = `.rating-stars-overlay-dynamic { width: ${starsFillPercent}% !important; }`;
  const canChoosePeopleBackdrop = isPeople;
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
          uploadBackdropMutation={uploadBackdropMutation}
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
          uploadPersonBackdropMutation={uploadPersonBackdropMutation}
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
    extraLinks,
    backdropUrl,
    mediaUrl,
    metaPills,
    extraMetaPills,
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
