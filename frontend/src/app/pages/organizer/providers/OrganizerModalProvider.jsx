import { createContext } from 'react';
import { FolderOpen, Play, Search, Sliders, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '../../../ui/Button';
import FloatingActionBar from '../../../ui/FloatingActionBar';
import OrganizerMatchModalContent from '../OrganizerMatchModalContent';
import OrganizerOverrideModalContent from '../components/OrganizerOverrideModalContent';
import api from '../../../lib/api';
import { showItemInFolder } from '../../../lib/ipc';
import { useUi } from '../../../providers/UiProvider';
import { useTranslation } from '../../../providers/LanguageProvider';
import {
  useOrganizerDeleteActions,
} from '../useOrganizerDeleteActions';

const OrganizerModalContext = createContext(null);

export function OrganizerModalProvider({
  children,
  focusFirstAvailableResult,
  clearSelectedRows,
  dismissRows,
  selectedRows,
}) {
  const { t } = useTranslation();
  const { closeModal, openModal, toast } = useUi();
  const queryClient = useQueryClient();

  const {
    refreshOrganizerDiscovery,
    handleResolveDiscoveryRow,
    handleDeleteDiscoveryRow,
    handleDeleteDiscoveryRows,
  } = useOrganizerDeleteActions({
    t,
    closeModal,
    toast,
    queryClient,
    focusFirstAvailableResult,
    clearSelectedRows,
  });

  const isPlayableOrganizerRow = (row) => {
    if (!row?.sourcePath) {
      return false;
    }
    if (row.rawType === 'extra') {
      return String(row.rawPayload?.category || '').toLowerCase() === 'video';
    }
    return true;
  };

  const handlePreviewRow = async (row) => {
    await api.media.preview(row.sourcePath);
  };

  const openDeleteModal = (row) => {
    const isExtra = row.rawType === 'extra';
    const actionCards = [
      !isExtra ? {
        key: 'ignore',
        label: t('organizer.details.delete.ignore.label'),
        description: t('organizer.details.delete.ignore.description'),
      } : null,
      {
        key: 'db_only',
        label: t('organizer.details.delete.dbOnly.label'),
        description: t(isExtra ? 'organizer.details.delete.dbOnly.descriptionExtra' : 'organizer.details.delete.dbOnly.descriptionMedia'),
      },
      {
        key: 'trash',
        label: t('organizer.details.delete.trash.label'),
        description: t(isExtra ? 'organizer.details.delete.trash.descriptionExtra' : 'organizer.details.delete.trash.descriptionMedia'),
        className: 'ui-modal__action-card--danger',
      },
    ].filter(Boolean);

    openModal({
      title: t('organizer.details.delete.title'),
      description: t(isExtra ? 'organizer.details.delete.descriptionExtra' : 'organizer.details.delete.descriptionMedia'),
      icon: Trash2,
      variant: 'danger',
      content: (
        <div className="ui-modal__actions-list">
          {actionCards.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`ui-modal__action-card ${action.className || ''}`.trim()}
              onClick={() => {
                handleDeleteDiscoveryRow(row, action.key).catch((error) => {
                  toast(error.message || t('organizer.toasts.deleteActionFailed'), 'danger');
                });
              }}
            >
              <div className="ui-modal__action-copy">
                <strong className="ui-modal__action-title">{action.label}</strong>
                <span className="ui-modal__action-description">{action.description}</span>
              </div>
            </button>
          ))}
        </div>
      ),
      footer: (
        <Button variant="secondary-neutral" onClick={closeModal}>
          {t('organizer.details.delete.cancel')}
        </Button>
      ),
    });
  };

  const openBulkDeleteModal = (rows) => {
    const hasExtras = rows.some((row) => row.rawType === 'extra');
    const hasMedia = rows.some((row) => row.rawType !== 'extra');
    const actionCards = [
      hasMedia ? {
        key: 'ignore',
        label: t('organizer.details.delete.ignore.label'),
        description: t('organizer.details.delete.ignore.description'),
      } : null,
      {
        key: 'db_only',
        label: t('organizer.details.delete.dbOnly.label'),
        description: hasMedia && hasExtras
          ? t('organizer.details.bulkDelete.dbOnly.descriptionMixed')
          : hasExtras
            ? t('organizer.details.bulkDelete.dbOnly.descriptionExtra')
            : t('organizer.details.bulkDelete.dbOnly.descriptionMedia'),
      },
      {
        key: 'trash',
        label: t('organizer.details.delete.trash.label'),
        description: hasMedia && hasExtras
          ? t('organizer.details.bulkDelete.trash.descriptionMixed')
          : hasExtras
            ? t('organizer.details.bulkDelete.trash.descriptionExtra')
            : t('organizer.details.bulkDelete.trash.descriptionMedia'),
        className: 'ui-modal__action-card--danger',
      },
    ].filter(Boolean);

    openModal({
      title: t('organizer.details.bulkDelete.title'),
      description: t('organizer.details.bulkDelete.description').replace('{count}', String(rows.length)),
      icon: Trash2,
      variant: 'danger',
      content: (
        <div className="ui-modal__actions-list">
          {actionCards.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`ui-modal__action-card ${action.className || ''}`.trim()}
              onClick={() => {
                handleDeleteDiscoveryRows(rows, action.key).catch((error) => {
                  toast(error.message || t('organizer.toasts.deleteActionFailed'), 'danger');
                });
              }}
            >
              <div className="ui-modal__action-copy">
                <strong className="ui-modal__action-title">{action.label}</strong>
                <span className="ui-modal__action-description">{action.description}</span>
              </div>
            </button>
          ))}
        </div>
      ),
      footer: (
        <Button variant="secondary-neutral" onClick={closeModal}>
          {t('organizer.details.delete.cancel')}
        </Button>
      ),
    });
  };

  const openMatchModal = (row) => {
    openModal({
      title: t('organizer.details.matchModal.title'),
      description: t('organizer.details.matchModal.description'),
      className: 'ui-modal--wide',
      icon: Search,
      content: (
        <OrganizerMatchModalContent
          row={row}
          t={t}
          toast={toast}
          onResolved={() => handleResolveDiscoveryRow(row)}
        />
      ),
      footer: (
        <Button variant="secondary-neutral" onClick={closeModal}>
          {t('organizer.details.delete.cancel')}
        </Button>
      ),
    });
  };

  const openOverrideModal = (row) => {
    openModal({
      title: t('organizer.overrideModal.title').replace('{type}', row.rawType || ''),
      description: t('organizer.overrideModal.description'),
      icon: Sliders,
      content: (
        <OrganizerOverrideModalContent
          row={row}
          onClose={closeModal}
          toast={toast}
          api={api}
        />
      ),
      footer: (
        <>
          <Button variant="secondary-neutral" type="button" onClick={closeModal}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="organizer-override-form">
            Apply Overrides
          </Button>
        </>
      ),
    });
  };

  const rowActions = [
    {
      key: 'match',
      label: t('organizer.actions.match'),
      icon: Search,
      isVisible: (row) => row.rawType !== 'extra',
      onClick: (row) => openMatchModal(row),
    },
    {
      key: 'override',
      label: t('organizer.actions.override'),
      icon: Sliders,
      onClick: (row) => openOverrideModal(row),
    },
    {
      key: 'preview',
      label: t('organizer.actions.preview'),
      icon: Play,
      isVisible: isPlayableOrganizerRow,
      onClick: async (row) => {
        try {
          await handlePreviewRow(row);
        } catch (error) {
          toast(error.message || t('organizer.toasts.previewFailed'), 'danger');
        }
      },
    },
    {
      key: 'show-in-folder',
      label: t('organizer.actions.showInFolder'),
      icon: FolderOpen,
      onClick: async (row) => {
        const result = await showItemInFolder(row.sourcePath);
        if (!result?.success) {
          toast(result?.error || t('organizer.toasts.showInFolderFailed'), 'danger');
        }
      },
    },
    {
      key: 'dismiss',
      label: t('organizer.actions.dismiss'),
      icon: X,
      isVisible: (row) => row.rawType !== 'extra',
      onClick: (row) => dismissRows([row.id]),
    },
    {
      key: 'delete',
      label: t('organizer.details.delete.title'),
      tooltip: t('organizer.actions.delete'),
      icon: Trash2,
      className: 'is-danger',
      onClick: (row) => openDeleteModal(row),
    },
  ];

  const bulkActionBar = (
    <FloatingActionBar
      visible={selectedRows.length > 0}
      title={t('organizer.bulkBar.title').replace('{count}', String(selectedRows.length))}
      actions={[
        !selectedRows.some((row) => row.rawType === 'extra') ? {
          key: 'dismiss',
          label: t('organizer.actions.dismiss'),
          icon: X,
          onClick: () => {
            dismissRows(selectedRows.map((r) => r.id));
            clearSelectedRows();
          },
          disabled: selectedRows.length === 0,
        } : null,
        {
          key: 'delete',
          label: t('organizer.actions.delete'),
          icon: Trash2,
          className: 'is-danger',
          onClick: () => openBulkDeleteModal(selectedRows),
          disabled: selectedRows.length === 0,
        },
        {
          key: 'clear',
          label: t('organizer.bulkBar.clear'),
          icon: X,
          onClick: clearSelectedRows,
          disabled: selectedRows.length === 0,
        },
      ].filter(Boolean)}
    />
  );

  const contextValue = {
    openDeleteModal,
    openBulkDeleteModal,
    openMatchModal,
    openOverrideModal,
    rowActions,
    bulkActionBar,
    refreshOrganizerDiscovery,
  };

  return (
    <OrganizerModalContext.Provider value={contextValue}>
      {children}
    </OrganizerModalContext.Provider>
  );
}

export { OrganizerModalContext };
