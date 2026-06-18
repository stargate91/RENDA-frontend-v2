import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from '@/providers/LanguageContext';
import { useUi } from '@/providers/UiProvider';
import DetailPageShell from './components/detail/DetailPageShell';
import EntityDetailTopControls from './components/entityDetail/EntityDetailTopControls';
import EntityDetailStatusSection from './components/entityDetail/EntityDetailStatusSection';
import EntityDetailHeroSection from './components/entityDetail/EntityDetailHeroSection';
import PersonCreditsSections from './components/entityDetail/PersonCreditsSections';
import CollectionDetailSections from './components/entityDetail/CollectionDetailSections';
import usePeopleCollectionDetailController from './usePeopleCollectionDetailController.jsx';
import UniversalImagePickerModal from './modals/UniversalImagePickerModal';
import './PeopleCollectionDetailPage.css';
import './components/detail/UserRatingSection.css';
import './components/detail/panels/BackdropsPanel.css';
export default function PeopleCollectionDetailPage({ type = 'people' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { openModal, closeModal, toast } = useUi();
  const isPeople = type === 'people';
  const {
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
  } = usePeopleCollectionDetailController({
    id,
    isPeople,
    t,
    openModal,
    closeModal,
    toast,
  });

  const handleOpenImagePickerModal = () => {
    const idToUse = isPeople ? item?.id : `collection_${item?.tmdb_id}`;
    if (!idToUse) return;
    openModal({
      title: isPeople ? (t('library.details.changeProfile') || 'Change Profile Picture') : (t('library.details.changePoster') || 'Change Poster'),
      variant: 'wide',
      content: (
        <UniversalImagePickerModal
          entityId={idToUse}
          tmdbId={isPeople ? item.id : item.tmdb_id}
          imageType={isPeople ? 'profile' : 'poster'}
          entityType={isPeople ? 'person' : 'collection'}
          currentPath={isPeople ? item.profile_path : item.poster_path}
          t={t}
          toast={toast}
          onClose={closeModal}
        />
      ),
    });
  };

  return (
    <DetailPageShell
      backdropUrl={backdropUrl}
      backLabel={t('common.back') || 'Back'}
      isLoading={isLoading}
      pageClassName={`entity-detail-page ${isPeople ? 'entity-detail-page--people' : 'entity-detail-page--collection'}`}
      topRightControls={
        <EntityDetailTopControls
          isPeople={isPeople}
          item={item}
          t={t}
          canChoosePeopleBackdrop={canChoosePeopleBackdrop}
          canChooseCollectionBackdrop={canChooseCollectionBackdrop}
          updatePersonStatusMutation={updatePersonStatusMutation}
          handleOpenPeopleBackdropModal={handleOpenPeopleBackdropModal}
          handleOpenCollectionBackdropModal={handleOpenCollectionBackdropModal}
        />
      }
    >
      {hasError && (
        <EntityDetailStatusSection
          title={isPeople ? 'Unable to load person' : 'Unable to load collection'}
          message={queryError?.message || 'The detail request failed.'}
        />
      )}

      {!hasError && !item && !isLoading && (
        <EntityDetailStatusSection
          title={isPeople ? 'Person not found' : 'Collection not found'}
          message={isPeople ? 'No person detail was returned for this route.' : 'No collection detail was returned for this route.'}
        />
      )}

      {!hasError && (
        <EntityDetailHeroSection
          isPeople={isPeople}
          item={item}
          mediaUrl={mediaUrl}
          profileLinks={profileLinks}
          metaPills={metaPills}
          overviewText={overviewText}
          overviewTitle={overviewTitle}
          overviewEmptyText={overviewEmptyText}
          displayRating={displayRating}
          isActivateHovered={isActivateHovered}
          starsStyleSheetText={starsStyleSheetText}
          t={t}
          openModal={openModal}
          setIsActivateHovered={setIsActivateHovered}
          handleToggleFavorite={handleToggleFavorite}
          handleToggleActive={handleToggleActive}
          handleOpenReviewModal={handleOpenReviewModal}
          handlePeopleRatingMouseMove={handlePeopleRatingMouseMove}
          handlePeopleRatingMouseLeave={handlePeopleRatingMouseLeave}
          handlePeopleRatingClick={handlePeopleRatingClick}
          onMediaCardClick={handleOpenImagePickerModal}
        />
      )}

      {!hasError && isPeople && (
        <PersonCreditsSections
          id={id}
          item={item}
          navigate={navigate}
          t={t}
        />
      )}

      {!hasError && !isPeople && (
        <CollectionDetailSections
          item={item}
          navigate={navigate}
          t={t}
        />
      )}
    </DetailPageShell>
  );
}
