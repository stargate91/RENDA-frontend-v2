import UtilityButton from '../../ui/UtilityButton';
import Button from '../../ui/Button';
import MediaCard from '../../ui/MediaCard';
import { ChevronLeft, ChevronRight, FileJson } from 'lucide-react';
import { API_BASE } from '../../lib/backend';
import { useTranslation } from '../../providers/LanguageProvider';
import { useUi } from '../../providers/UiProvider';
import { useFullMetadataQuery } from '../../queries/organizerQueries';
import '../../styles/OrganizerDetailsPanel.css';

const getImageLabel = (image, t) => t(`organizer.details.imageKinds.${image?.label || 'poster'}`);

const resolveOrganizerImageUrl = (path) => {
  if (!path) {
    return '';
  }
  if (String(path).startsWith('http://') || String(path).startsWith('https://')) {
    return path;
  }
  return `${API_BASE}${path}`;
};

export default function OrganizerDetailsPanel({
  activeImage,
  activeImageIndex,
  activeImages,
  activeRow,
  isDetailsCollapsed,
  onAdvanceImage,
  onToggleDetails,
  shouldShowDetailsCarousel,
  shouldShowDetailsPoster,
}) {
  const { t } = useTranslation();
  const { openModal, toast } = useUi();

  const { refetch: refetchFullMetadata } = useFullMetadataQuery(activeRow?.itemId, {
    enabled: false,
  });

  const buildInspectPayload = async () => {
    if (!activeRow) {
      return '';
    }

    if (activeRow.rawType === 'extra') {
      return JSON.stringify({
        kind: 'extra',
        summary: {
          id: activeRow.itemId,
          source: activeRow.source,
          target: activeRow.target,
          source_path: activeRow.sourcePath,
          target_path: activeRow.targetPath,
        },
        discovery: activeRow.rawPayload,
      }, null, 2);
    }

    const { data: metadata, error } = await refetchFullMetadata();
    if (error) {
      throw error;
    }

    return JSON.stringify({
      kind: activeRow.rawType,
      summary: {
        id: activeRow.itemId,
        source: activeRow.source,
        target: activeRow.target,
        source_path: activeRow.sourcePath,
        target_path: activeRow.targetPath,
        status: activeRow.rawStatus,
        action: activeRow.rawAction || null,
        has_collision: activeRow.hasCollision,
      },
      discovery: activeRow.rawPayload,
      metadata,
    }, null, 2);
  };

  const handleOpenInspect = async () => {
    if (!activeRow) {
      return;
    }

    try {
      const inspectJson = await buildInspectPayload();

      const handleCopyInspect = async () => {
        try {
          await navigator.clipboard.writeText(inspectJson);
          toast('JSON copied to clipboard', 'success');
        } catch {
          toast('Failed to copy JSON', 'danger');
        }
      };

      const handleDownloadInspect = () => {
        const blob = new Blob([inspectJson], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${activeRow.source || 'organizer-item'}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      };

      openModal({
        title: t('organizer.details.inspect.title'),
        description: t('organizer.details.inspect.description'),
        icon: FileJson,
        content: (
          <pre className="organizer-details__inspect-json">
            {inspectJson}
          </pre>
        ),
        footer: (
          <>
            <Button
              type="button"
              variant="secondary-neutral"
              onClick={handleCopyInspect}
            >
              {t('organizer.details.inspect.copy')}
            </Button>
            <Button
              type="button"
              variant="secondary-neutral"
              onClick={handleDownloadInspect}
            >
              {t('organizer.details.inspect.download')}
            </Button>
          </>
        ),
      });
    } catch (error) {
      toast(error.message || 'Failed to load inspection data', 'danger');
    }
  };

  return (
    <aside className="organizer-details" aria-label={t('organizer.details.title')}>
      <div className="organizer-details__sticky-container">
        <div className="organizer-details__toggle-row">
          <UtilityButton
            type="button"
            className="organizer-details__toggle"
            size="sm"
            aria-label={isDetailsCollapsed ? t('organizer.details.expand') : t('organizer.details.collapse')}
            onClick={onToggleDetails}
          >
            {isDetailsCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </UtilityButton>
        </div>

        <div className="organizer-details__panel">
          <div className="organizer-details__header">
            <span className="organizer-details__title">{t('organizer.details.title')}</span>
          </div>

          {activeRow ? (
            <div className="organizer-details__content">
              {shouldShowDetailsPoster ? (
                activeImages.length > 1 ? (
                  <button
                    type="button"
                    className="organizer-details__poster-card has-image"
                    onClick={onAdvanceImage}
                  >
                    <img
                      src={resolveOrganizerImageUrl(activeImage.path)}
                      alt={getImageLabel(activeImage, t)}
                      className="organizer-details__poster-image"
                    />
                    {shouldShowDetailsCarousel ? (
                      <div className="organizer-details__poster-dots" aria-hidden="true">
                        {activeImages.map((image, index) => (
                          <span
                            key={`${image.path}-${index}`}
                            className={`organizer-details__poster-dot${index === activeImageIndex ? ' is-active' : ''}`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </button>
                ) : (
                  <div className="organizer-details__poster-card">
                    {activeImage ? (
                      <img
                        src={resolveOrganizerImageUrl(activeImage.path)}
                        alt={getImageLabel(activeImage, t)}
                        className="organizer-details__poster-image"
                      />
                    ) : (
                      <div className="organizer-details__poster-placeholder">
                        {t('organizer.details.posterPlaceholder')}
                      </div>
                    )}
                  </div>
                )
              ) : null}
              <MediaCard className="organizer-details__field">
                <span className="organizer-details__label">{t('organizer.details.fields.source')}</span>
                <span className="organizer-details__value" title={activeRow.sourcePath}>{activeRow.sourcePath}</span>
              </MediaCard>
              {(() => {
                const unmatchedStatuses = ['new', 'no_match', 'uncertain', 'multiple', 'error'];
                const isUnmatchedExtra = activeRow.rawType === 'extra' && activeRow.parentStatus && unmatchedStatuses.includes(activeRow.parentStatus.toLowerCase());
                const isUnmatchedMedia = activeRow.rawType !== 'extra' && unmatchedStatuses.includes(activeRow.rawStatus);
                
                if (isUnmatchedMedia || isUnmatchedExtra) {
                  return null;
                }
                
                return (
                  <MediaCard className="organizer-details__field">
                    <span className="organizer-details__label">{t('organizer.details.fields.target')}</span>
                    <span className="organizer-details__value" title={activeRow.targetPath}>{activeRow.targetPath}</span>
                  </MediaCard>
                );
              })()}
              <div className="organizer-details__actions">
                <Button
                  type="button"
                  variant="secondary-neutral"
                  size="sm"
                  className="organizer-details__inspect-button"
                  onClick={handleOpenInspect}
                >
                  {t('organizer.details.inspect.open')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="organizer-details__empty">{t('organizer.details.empty')}</div>
          )}
        </div>
      </div>
    </aside>
  );
}
