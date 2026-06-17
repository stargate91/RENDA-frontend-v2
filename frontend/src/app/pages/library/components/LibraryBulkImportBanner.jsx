import { Info, X } from 'lucide-react';
import Button from '@/ui/Button';
import { isLibraryPeopleTab } from '@/lib/libraryTabs';

export default function LibraryBulkImportBanner({
  t,
  resolvedTab,
  isAdultMode,
  openBulkImportResolveModal,
  openModal,
  closeModal,
  showBulkImportBanner,
  dismissBulkImportBanner,
}) {
  const handleDismissBulkImportBanner = () => {
    openModal({
      title: t(
        isAdultMode
          ? 'library.addPeople.adultBulkPendingConfirmTitle'
          : 'library.addPeople.bulkPendingConfirmTitle'
      ),
      description: t(
        isAdultMode
          ? 'library.addPeople.adultBulkPendingConfirmDescription'
          : 'library.addPeople.bulkPendingConfirmDescription'
      ),
      variant: 'danger',
      content: (
        <div className="ui-modal__body-text">
          {t(
            isAdultMode
              ? 'library.addPeople.adultBulkPendingConfirmBody'
              : 'library.addPeople.bulkPendingConfirmBody'
          )}
        </div>
      ),
      footer: (
        <div className="library-modal-footer">
          <Button variant="secondary-neutral" onClick={closeModal}>
            {t('common.cancel') || 'Cancel'}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              dismissBulkImportBanner();
              closeModal();
            }}
          >
            {t(
              isAdultMode
                ? 'library.addPeople.adultBulkPendingConfirmConfirm'
                : 'library.addPeople.bulkPendingConfirmConfirm'
            )}
          </Button>
        </div>
      ),
    });
  };

  if (!showBulkImportBanner || !isLibraryPeopleTab(resolvedTab)) {
    return null;
  }

  return (
    <div className="library-bulk-banner">
      <div className="library-bulk-banner__message">
        <span className="library-bulk-banner__icon" aria-hidden="true">
          <Info size={16} />
        </span>
        <span className="library-bulk-banner__text">
          {t(
            isAdultMode
              ? 'library.addPeople.adultBannerPendingActions'
              : 'library.addPeople.bannerPendingActions'
          )}
        </span>
      </div>
      <div className="library-bulk-banner__actions">
        <button
          type="button"
          onClick={openBulkImportResolveModal}
          className="ui-button ui-button--sm ui-button--secondary"
        >
          {t(isAdultMode ? 'library.addPeople.adultResolveMatches' : 'library.addPeople.resolveMatches')}
        </button>
        <button
          type="button"
          aria-label={t('common.close') || 'Close'}
          onClick={handleDismissBulkImportBanner}
          className="library-bulk-banner__dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
