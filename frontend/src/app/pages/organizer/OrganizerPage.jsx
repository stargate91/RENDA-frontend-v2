import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Page from '../../ui/Page';
import Button from '../../ui/Button';
import OrganizerDetailsPanel from './OrganizerDetailsPanel';
import OrganizerHeaderPanel from './OrganizerHeaderPanel';
import OrganizerResultsPanel from './OrganizerResultsPanel';
import { useDiscoveryCountQuery, useDiscoveryQuery, useScanStatusQuery, useSettingsQuery, useStatsQuery } from '../../queries/appQueries';
import { useUi } from '../../providers/UiProvider';
import { useTranslation } from '../../providers/LanguageProvider';
import {
  normalizeStatusTone,
  PAGE_SIZE_OPTIONS,
} from './organizerMappers';
import { EMPTY_DISCOVERY } from './organizerConstants';
import { useOrganizerActions } from './useOrganizerActions.jsx';
import { useOrganizerColumns } from './useOrganizerColumns.jsx';
import { useOrganizerDropzone } from './useOrganizerDropzone';
import { useOrganizerPageState } from './useOrganizerPageState';
import { useOrganizerTabs } from './useOrganizerTabs';
import { useOrganizerViewModel } from './useOrganizerViewModel';
import { useOrganizerModals } from './useOrganizerModals.jsx';

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
    dismissRows,
    restoreDismissedRows,
    dismissedCount,
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
    openModal,
    closeModal,
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

  const headerActions = (hasVisibleItems || dismissedCount > 0) ? (
    <>
      {dismissedCount > 0 ? (
        <Button
          variant="secondary-neutral"
          size="sm"
          className="organizer-panel__browse-btn"
          onClick={restoreDismissedRows}
        >
          {t('organizer.buttons.restoreDismissed')} ({dismissedCount})
        </Button>
      ) : null}
      {hasVisibleItems ? (
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
      ) : null}
    </>
  ) : null;

  const {
    openMatchModal,
    rowActions,
    bulkActionBar,
    refreshOrganizerDiscovery,
  } = useOrganizerModals({
    t,
    closeModal,
    openModal,
    toast,
    queryClient,
    focusFirstAvailableResult,
    clearSelectedRows,
    dismissRows,
    selectedRows,
  });

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
    onOpenMatch: (row) => openMatchModal(row),
  });

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
  }, [
    discoveryQuery.data,
    focusFirstAvailableResult,
    isScanActive,
    organizerRuleSignature,
    queryClient,
    toast,
    refreshOrganizerDiscovery,
  ]);

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
