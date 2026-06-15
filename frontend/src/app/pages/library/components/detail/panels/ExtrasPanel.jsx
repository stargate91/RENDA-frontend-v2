import { FolderOpen } from 'lucide-react';
import Button from '@/ui/Button';
import { useMediaDetailContext } from '../MediaDetailContext';
import './PanelsCommon.css';
import './ExtrasPanel.css';
import { showItemInFolder } from '@/lib/ipc';


export default function ExtrasPanel() {
  const { state, t, toast } = useMediaDetailContext();
  const {
    item,
    isMovie
  } = state;

  const formatExtraValue = (value) => String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const extras = item.extras || [];
  const extraGroups = isMovie
    ? [{ label: null, items: extras }]
    : extras.reduce((groups, extra) => {
      const label = extra.parent_label || t('library.details.extras') || 'Extras';
      const existingGroup = groups.find((group) => group.label === label);

      if (existingGroup) {
        existingGroup.items.push(extra);
      } else {
        groups.push({ label, items: [extra] });
      }

      return groups;
    }, []);
  const getExtraMeta = (extra) => {
    const meta = [];

    if (extra.category) {
      meta.push(formatExtraValue(extra.category));
    }

    if (extra.subtype && extra.category !== 'metadata') {
      meta.push(formatExtraValue(extra.subtype));
    }

    if (extra.language) {
      meta.push(String(extra.language).toUpperCase());
    }

    return meta.join(' · ');
  };

  return (
    <div className="details-panel details-panel--custom extras-panel">
      <h4 className="details-panel__section-title">
        {t('library.details.extras') || 'Film Extras'}
      </h4>
      <div className="extras-panel__list">
        {extraGroups.map((group, groupIndex) => (
          <div
            key={group.label || `extras-group-${groupIndex}`}
            className="extras-panel__group"
          >
            {group.label ? (
              <span className="tags-panel__section-subtitle extras-panel__group-title">
                {group.label}
              </span>
            ) : null}
            {group.items.map((extra) => (
              <div key={extra.id} className="details-panel__section extras-panel__section">
                <div className="extras-panel__header">
                  <div className="extras-panel__header-copy">
                    <div className="extras-panel__title-row">
                      <div className="extras-panel__filename" title={extra.name}>
                        {extra.name}
                      </div>
                    </div>
                    {extra.path ? (
                      <div className="extras-panel__path" title={extra.path}>
                        {extra.path}
                      </div>
                    ) : null}
                    {getExtraMeta(extra) ? (
                      <span className="extras-panel__inline-meta" title={getExtraMeta(extra)}>
                        {getExtraMeta(extra)}
                      </span>
                    ) : null}
                  </div>
                  {extra.path ? (
                    <Button
                      variant="secondary-neutral"
                      size="sm"
                      className="extras-panel__browse-btn"
                      onClick={async () => {
                        const result = await showItemInFolder(extra.path);
                        if (!result?.success) {
                          toast(result?.error || t('organizer.toasts.showInFolderFailed'), 'danger');
                        }
                      }}
                      title={t('library.details.showInFolder') || 'Show in Folder'}
                    >
                      <FolderOpen size={14} />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ))}
        {extras.length === 0 && (
          <div className="details-panel__no-ratings">
            {t('library.details.noExtraFilesFound') || 'No extra files found.'}
          </div>
        )}
      </div>
    </div>
  );
}
