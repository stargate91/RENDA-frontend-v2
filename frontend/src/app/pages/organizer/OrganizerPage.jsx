import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Play, Search, Trash2, X } from 'lucide-react';
import Page from '../../ui/Page';
import Button from '../../ui/Button';
import FloatingActionBar from '../../ui/FloatingActionBar';
import OrganizerDetailsPanel from './OrganizerDetailsPanel';
import OrganizerHeaderPanel from './OrganizerHeaderPanel';
import OrganizerMatchModalContent from './OrganizerMatchModalContent';
import OrganizerResultsPanel from './OrganizerResultsPanel';
import { useDiscoveryCountQuery, useDiscoveryQuery, useScanStatusQuery, useSettingsQuery, useStatsQuery } from '../../queries/appQueries';
import { fetchJson } from '../../lib/http';
import { showItemInFolder } from '../../lib/ipc';
import { useUi } from '../../providers/UiProvider';
import { useTranslation } from '../../providers/LanguageProvider';
import {
  normalizeStatusTone,
  PAGE_SIZE_OPTIONS,
} from './organizerMappers';
import { EMPTY_DISCOVERY } from './organizerConstants';
import { useOrganizerActions } from './useOrganizerActions';
import { useOrganizerColumns } from './useOrganizerColumns.jsx';
import { useOrganizerDropzone } from './useOrganizerDropzone';
import { useOrganizerPageState } from './useOrganizerPageState';
import { useOrganizerTabs } from './useOrganizerTabs';
import { useOrganizerViewModel } from './useOrganizerViewModel';

const removeDiscoveryRow = (currentDiscovery, row) => {
  if (!currentDiscovery) {
    return currentDiscovery;
  }

  if (row.rawType === 'extra') {
    return {
      ...currentDiscovery,
      extras: (currentDiscovery.extras || []).filter((item) => item.id !== row.itemId),
    };
  }

  const mediaId = row.itemId;
  return {
    ...currentDiscovery,
    manual: (currentDiscovery.manual || []).filter((item) => item.id !== mediaId),
    movies: (currentDiscovery.movies || []).filter((item) => item.id !== mediaId),
    series: (currentDiscovery.series || []).filter((item) => item.id !== mediaId),
    collisions: (currentDiscovery.collisions || []).filter((item) => item.id !== mediaId),
    extras: (currentDiscovery.extras || []).filter((item) => item.parent_id !== mediaId),
  };
};

const removeDiscoveryRows = (currentDiscovery, rows) => rows.reduce(
  (nextDiscovery, row) => removeDiscoveryRow(nextDiscovery, row),
  currentDiscovery,
);

export default function OrganizerPage() {
  const { t } = useTranslation();
  const { closeModal, openModal, toast } = useUi();
  const queryClient = useQueryClient();
  const discoveryQuery = useDiscoveryQuery();
  const discoveryCountQuery = useDiscoveryCountQuery();
  const statsQuery = useStatsQuery();
  const settingsQuery = useSettingsQuery();
  const scanStatusQuery = useScanStatusQuery();
  const discovery = discoveryQuery.data || EMPTY_DISCOVERY;
  const scanStatus = scanStatusQuery.data || null;
  const isScanActive = Boolean(scanStatus?.active);
  const rawDiscoveryItemCount = discoveryCountQuery.data?.count ?? statsQuery.data?.unmatched;
  const discoveryItemCount = rawDiscoveryItemCount == null ? null : Number(rawDiscoveryItemCount);
  const isDiscoveryCountReady = Number.isFinite(discoveryItemCount);
  const organizerRuleSignature = useMemo(() => JSON.stringify({
    collision_strategy: settingsQuery.data?.collision_strategy || 'keep_both',
    collision_duration_tolerance_seconds: settingsQuery.data?.collision_duration_tolerance_seconds || '10',
    extras_video_action: settingsQuery.data?.extras_video_action || 'rename',
    extras_sub_action: settingsQuery.data?.extras_sub_action || 'rename',
    extras_audio_action: settingsQuery.data?.extras_audio_action || 'rename',
    extras_img_action: settingsQuery.data?.extras_img_action || 'rename',
    extras_meta_action: settingsQuery.data?.extras_meta_action || 'rename',
  }), [
    settingsQuery.data?.collision_duration_tolerance_seconds,
    settingsQuery.data?.collision_strategy,
    settingsQuery.data?.extras_audio_action,
    settingsQuery.data?.extras_img_action,
    settingsQuery.data?.extras_meta_action,
    settingsQuery.data?.extras_sub_action,
    settingsQuery.data?.extras_video_action,
  ]);
  const previousRuleSignatureRef = useRef(organizerRuleSignature);
  const {
    activeExtrasTab,
    activeImage,
    activeImageIndex,
    activeImages,
    activeMainTab,
    activeRow,
    currentPage,
    focusFirstAvailableResult,
    handleAdvanceDetailsImage,
    handleSortToggle,
    handleToggleAll,
    handleToggleDetails,
    handleToggleRow,
    isDetailsCollapsed,
    pageSize,
    pageStart,
    pageEnd,
    paginatedRows,
    searchQuery,
    selectedRows,
    selectedRowIds,
    clearSelectedRows,
    setActiveExtrasTab,
    setActiveMainTab,
    setActiveRowId,
    setPageAndScrollToTop,
    setPageSize,
    setSearchQuery,
    shouldShowDetailsCarousel,
    shouldShowDetailsPoster,
    sortConfig,
    sortedRows,
    tabCounts,
    totalPages,
  } = useOrganizerPageState({ discovery, t });

  const {
    handleBrowseAndScan,
    handleLoadAll,
    handleRename,
    handleScanPaths,
    isBrowseStarting,
    isLoadingAll,
    isRenameStarting,
  } = useOrganizerActions({
    defaultScanDir: settingsQuery.data?.default_scan_dir,
    discoveryCountQuery,
    discoveryQuery,
    isScanActive,
    onResultsReady: focusFirstAvailableResult,
    queryClient,
    t,
    toast,
  });
  const { dropzoneProps, isDropActive } = useOrganizerDropzone({
    disabled: isScanActive || isBrowseStarting || isLoadingAll || isRenameStarting,
    onDropPaths: handleScanPaths,
  });

  const { computedExtrasTabs, computedMainTabs } = useOrganizerTabs({
    discoveryExtras: discovery.extras,
    t,
    tabCounts,
  });

  const {
    browseButtonLabel,
    emptyState: organizerEmptyState,
    hasDatabaseItems,
    hasVisibleItems,
    loadAllButtonLabel,
    loadRestButtonLabel,
    loadingState: organizerLoadingState,
    renameButtonLabel,
    shouldShowDetailsPanel,
    shouldShowLoadRest,
    summaryText,
  } = useOrganizerViewModel({
    discovery,
    discoveryItemCount,
    isBrowseStarting,
    isDiscoveryCountReady,
    isLoadingAll,
    isRenameStarting,
    isScanActive,
    pageEnd,
    pageStart,
    scanPhase: scanStatus?.phase,
    sortedRows,
    t,
  });

  const emptyStateActions = organizerEmptyState ? (
    <>
      {hasDatabaseItems ? (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBrowseAndScan}
            disabled={isScanActive || isBrowseStarting}
          >
            {browseButtonLabel}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleLoadAll}
            disabled={isLoadingAll}
          >
            {loadAllButtonLabel}
          </Button>
        </>
      ) : (
        <Button
          variant="primary"
          size="sm"
          onClick={handleBrowseAndScan}
          disabled={isScanActive || isBrowseStarting}
        >
          {browseButtonLabel}
        </Button>
      )}
    </>
  ) : null;

  const headerActions = hasVisibleItems ? (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="organizer-panel__browse-btn"
        onClick={handleBrowseAndScan}
        disabled={isScanActive || isBrowseStarting}
      >
        {browseButtonLabel}
      </Button>
      {shouldShowLoadRest ? (
        <Button
          variant="secondary"
          size="sm"
          className="organizer-panel__browse-btn"
          onClick={handleLoadAll}
          disabled={isLoadingAll}
        >
          {loadRestButtonLabel}
        </Button>
      ) : null}
      <Button
        variant="primary"
        size="sm"
        className="organizer-panel__browse-btn"
        onClick={handleRename}
        disabled={isScanActive || isRenameStarting}
      >
        {renameButtonLabel}
      </Button>
    </>
  ) : null;

  const { columns } = useOrganizerColumns({
    activeExtrasTab,
    activeMainTab,
    collisionStrategy: settingsQuery.data?.collision_strategy,
    handleSortToggle,
    handleToggleAll,
    handleToggleRow,
    normalizeStatusTone,
    paginatedRows,
    selectedRowIds,
    sortConfig,
    t,
  });
  const refreshOrganizerDiscovery = async () => {
    const data = await fetchJson('/api/discovery');
    queryClient.setQueryData(['discovery'], data);
    focusFirstAvailableResult(data);
    queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

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
    await fetchJson('/api/media/preview', {
      method: 'POST',
      body: JSON.stringify({ file_path: row.sourcePath }),
    });
  };

  const handleResolveDiscoveryRow = async () => {
    await refreshOrganizerDiscovery();
    closeModal();
  };

  const handleDeleteDiscoveryRow = async (row, mode) => {
    closeModal();
    const previousDiscovery = queryClient.getQueryData(['discovery']);
    const nextDiscovery = removeDiscoveryRow(previousDiscovery, row);
    if (nextDiscovery) {
      queryClient.setQueryData(['discovery'], nextDiscovery);
      focusFirstAvailableResult(nextDiscovery);
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }

    try {
      await fetchJson('/api/discovery/delete', {
        method: 'POST',
        body: JSON.stringify({
          item_ids: row.rawType === 'extra' ? [] : [row.itemId],
          extra_ids: row.rawType === 'extra' ? [row.itemId] : [],
          mode,
        }),
      });
      await refreshOrganizerDiscovery();
      toast(t('organizer.toasts.deleteActionSuccess'), 'success');
    } catch (error) {
      if (previousDiscovery) {
        queryClient.setQueryData(['discovery'], previousDiscovery);
        focusFirstAvailableResult(previousDiscovery);
      }
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      throw error;
    }
  };

  const handleDeleteDiscoveryRows = async (rows, mode) => {
    closeModal();
    clearSelectedRows();
    const previousDiscovery = queryClient.getQueryData(['discovery']);
    const nextDiscovery = removeDiscoveryRows(previousDiscovery, rows);
    if (nextDiscovery) {
      queryClient.setQueryData(['discovery'], nextDiscovery);
      focusFirstAvailableResult(nextDiscovery);
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }

    try {
      await fetchJson('/api/discovery/delete', {
        method: 'POST',
        body: JSON.stringify({
          item_ids: rows.filter((row) => row.rawType !== 'extra').map((row) => row.itemId),
          extra_ids: rows.filter((row) => row.rawType === 'extra').map((row) => row.itemId),
          mode,
        }),
      });
      await refreshOrganizerDiscovery();
      toast(t('organizer.toasts.deleteActionSuccess'), 'success');
    } catch (error) {
      if (previousDiscovery) {
        queryClient.setQueryData(['discovery'], previousDiscovery);
        focusFirstAvailableResult(previousDiscovery);
      }
      queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      throw error;
    }
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
          onResolved={handleResolveDiscoveryRow}
        />
      ),
      footer: (
        <Button variant="secondary-neutral" onClick={closeModal}>
          {t('organizer.details.delete.cancel')}
        </Button>
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
      label: 'Show in Folder',
      icon: FolderOpen,
      onClick: async (row) => {
        const result = await showItemInFolder(row.sourcePath);
        if (!result?.success) {
          toast(result?.error || t('organizer.toasts.showInFolderFailed'), 'danger');
        }
      },
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
      ]}
    />
  );

  useEffect(() => {
    if (previousRuleSignatureRef.current === organizerRuleSignature) {
      return;
    }

    previousRuleSignatureRef.current = organizerRuleSignature;

    if (!discoveryQuery.data || isScanActive) {
      return;
    }

    refreshOrganizerDiscovery().catch(() => {
      toast('Failed to refresh organizer rules', 'danger');
    });
  }, [discoveryQuery.data, focusFirstAvailableResult, isScanActive, organizerRuleSignature, queryClient, toast]);

  return (
    <Page className="organizer-page">
      <div className={`organizer-main ${isDetailsCollapsed || !shouldShowDetailsPanel ? 'is-details-collapsed' : ''}`}>
        <div className="organizer-main__content">
          <OrganizerHeaderPanel
            activeExtrasTab={activeExtrasTab}
            activeMainTab={activeMainTab}
            actions={headerActions}
            computedExtrasTabs={computedExtrasTabs}
            computedMainTabs={computedMainTabs}
            onChangeExtrasTab={setActiveExtrasTab}
            onChangeMainTab={setActiveMainTab}
            searchPlaceholder={t('organizer.searchPlaceholder')}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            title={t('organizer.title')}
          />

          <OrganizerResultsPanel
            activeRowId={activeRow?.id || null}
            bulkActionBar={bulkActionBar}
            columns={columns}
            currentPage={currentPage}
            dropOverlayDescription={t('organizer.dropzone.description')}
            dropOverlayLabel={t('organizer.dropzone.label')}
            dropzoneProps={dropzoneProps}
            isDropActive={isDropActive}
            emptyActions={emptyStateActions}
            emptyState={organizerEmptyState}
            emptyText={discoveryQuery.isLoading ? t('organizer.table.emptyLoading') : t('organizer.table.emptyDefault')}
            labels={t('organizer.pagination')}
            loadingState={organizerLoadingState}
            onPageChange={setPageAndScrollToTop}
            onPageSizeChange={setPageSize}
            onRowClick={(row) => setActiveRowId(row.id)}
            rowActions={rowActions}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            rows={paginatedRows}
            showPageSizes
            summaryText={summaryText}
            totalItems={sortedRows.length}
            totalPages={totalPages}
          />
        </div>

        {shouldShowDetailsPanel ? (
          <OrganizerDetailsPanel
            activeImage={activeImage}
            activeImageIndex={activeImageIndex}
            activeImages={activeImages}
            activeRow={activeRow}
            isDetailsCollapsed={isDetailsCollapsed}
            onAdvanceImage={handleAdvanceDetailsImage}
            onToggleDetails={handleToggleDetails}
            shouldShowDetailsCarousel={shouldShowDetailsCarousel}
            shouldShowDetailsPoster={shouldShowDetailsPoster}
          />
        ) : null}
      </div>
    </Page>
  );
}
