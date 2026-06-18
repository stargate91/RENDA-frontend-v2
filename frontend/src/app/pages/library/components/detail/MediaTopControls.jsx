import { Image as ImageIcon } from 'lucide-react';
import MetadataRefreshButton from './MetadataRefreshButton';

export default function MediaTopControls({
  t,
  item,
  metadataRefresh,
  handleRefreshMetadata,
  handleOpenBackdropModal,
}) {
  const canRefreshMetadata = Boolean(item && metadataRefresh?.canRefreshMetadata);

  if (!canRefreshMetadata && !handleOpenBackdropModal) {
    return null;
  }

  return (
    <>
      {canRefreshMetadata ? (
        <MetadataRefreshButton
          t={t}
          metadataState={metadataRefresh?.effectiveMetadataState || item?.metadata_state}
          refreshState={item?.refresh_state}
          onRefresh={handleRefreshMetadata}
          disabled={metadataRefresh?.manualMetadataRefresh?.isPending}
          compact
        />
      ) : null}
      {handleOpenBackdropModal ? (
        <button
          type="button"
          onClick={handleOpenBackdropModal}
          className="media-detail-page__side-nav-toggle"
          title={t('library.details.backdrops') || 'Choose Backdrop'}
        >
          <ImageIcon size={18} />
        </button>
      ) : null}
    </>
  );
}
