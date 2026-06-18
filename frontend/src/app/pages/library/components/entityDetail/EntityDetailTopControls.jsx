import { Image as ImageIcon } from 'lucide-react';
import PeopleTagPopover from './PeopleTagPopover';

export default function EntityDetailTopControls({
  isPeople,
  item,
  t,
  canChoosePeopleBackdrop,
  canChooseCollectionBackdrop,
  updatePersonStatusMutation,
  handleOpenPeopleBackdropModal,
  handleOpenCollectionBackdropModal,
}) {
  if (isPeople) {
    return (
      <div className="entity-detail-page__top-controls">
        <PeopleTagPopover
          item={item}
          t={t}
          updatePersonStatusMutation={updatePersonStatusMutation}
        />
        {canChoosePeopleBackdrop ? (
          <button
            type="button"
            onClick={handleOpenPeopleBackdropModal}
            className="media-detail-page__side-nav-toggle"
            title={t('library.details.backdrops') || 'Choose Backdrop'}
          >
            <ImageIcon size={18} />
          </button>
        ) : null}
      </div>
    );
  }

  if (!canChooseCollectionBackdrop) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleOpenCollectionBackdropModal}
      className="media-detail-page__side-nav-toggle"
      title={t('library.details.backdrops') || 'Choose Backdrop'}
    >
      <ImageIcon size={18} />
    </button>
  );
}
