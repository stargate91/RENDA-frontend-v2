import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Page from '../../ui/Page';
import Button from '../../ui/Button';
import OrganizerDetailsPanel from './OrganizerDetailsPanel';
import OrganizerHeaderPanel from './OrganizerHeaderPanel';
import OrganizerResultsPanel from './OrganizerResultsPanel';
import { useDiscoveryCountQuery, useDiscoveryQuery, useScanStatusQuery, useSettingsQuery, useStatsQuery } from '../../queries';
import { useUi } from '../../providers/UiProvider';
import { useTranslation } from '../../providers/LanguageProvider';
import {
  normalizeStatusTone,
  PAGE_SIZE_OPTIONS,
} from './organizerMappers';
import { EMPTY_DISCOVERY } from './organizerConstants';
import { useOrganizerActions } from './useOrganizerActions.jsx';
import { useOrganizerColumns } from './useOrganizerColumns.jsx';
import { useOrganizerPageState } from './useOrganizerPageState';
import { useOrganizerTabs } from './useOrganizerTabs';
import { useOrganizerViewModel } from './useOrganizerViewModel';
import { OrganizerModalProvider } from './providers/OrganizerModalProvider';
import { useOrganizerDeleteActions } from './useOrganizerDeleteActions';

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
  const settings = settingsQuery.data || {};
  const isScanActive = Boolean(scanStatus?.active);
  const rawDiscoveryItemCount = discoveryCountQuery.data?.count ?? statsQuery.data?.unmatched;
  const discoveryItemCount = rawDiscoveryItemCount == null ? null : Number(rawDiscoveryItemCount);
  const isDiscoveryCountReady = Number.isFinite(discoveryItemCount);
  const organizerRuleSignature = useMemo(() => JSON.stringify({
    collision_strategy: settings.collision_strategy || 'keep_both',
    collision_duration_tolerance_seconds: settings.collision_duration_tolerance_seconds || '10',
    naming_filename_casing: settings.naming_filename_casing || 'default',
    naming_word_separator: settings.naming_word_separator || 'space',
    naming_movie_template: settings.naming_movie_template || '',
    naming_episode_template: settings.naming_episode_template || '',
    naming_custom_tag: settings.naming_custom_tag || '',
    naming_video_exts: settings.naming_video_exts || '',
    folder_organization_enabled: settings.folder_organization_enabled !== false,
    folder_move_to_library: settings.folder_move_to_library !== false,
    folder_sort_by_type: settings.folder_sort_by_type !== false,
    folder_movies_name: settings.folder_movies_name || '',
    folder_series_name: settings.folder_series_name || '',
    folder_adult_name: settings.folder_adult_name || '',
    folder_create_movie_subdir: settings.folder_create_movie_subdir !== false,
    folder_movie_template: settings.folder_movie_template || '',
    folder_create_show_dir: settings.folder_create_show_dir !== false,
    folder_show_template: settings.folder_show_template || '',
    folder_create_season_dir: settings.folder_create_season_dir !== false,
    folder_season_template: settings.folder_season_template || '',
    folder_create_episode_dir: Boolean(settings.folder_create_episode_dir),
    folder_episode_template: settings.folder_episode_template || '',
    folder_remove_empty: settings.folder_remove_empty !== false,
    folder_create_collection_dir: settings.folder_create_collection_dir !== false,
    folder_collection_mode: settings.folder_collection_mode || '',
    folder_collection_threshold: settings.folder_collection_threshold || '',
    folder_collection_template: settings.folder_collection_template || '',
    extras_enabled: settings.extras_enabled !== false,
    extras_folder_mode: settings.extras_folder_mode || '',
    extras_subfolder_name: settings.extras_subfolder_name || '',
    extras_video_action: settings.extras_video_action || 'rename',
    extras_sub_action: settings.extras_sub_action || 'rename',
    extras_audio_action: settings.extras_audio_action || 'rename',
    extras_img_action: settings.extras_img_action || 'rename',
    extras_meta_action: settings.extras_meta_action || 'rename',
    extras_video_template: settings.extras_video_template || '',
    extras_sub_template: settings.extras_sub_template || '',
    extras_audio_template: settings.extras_audio_template || '',
    extras_img_template: settings.extras_img_template || '',
    extras_meta_template: settings.extras_meta_template || '',
    include_adult: Boolean(settings.include_adult),
  }), [
    settings,
  ]);
  const previousRuleSignatureRef = useRef(organizerRuleSignature);
  const {
    activeExtrasTab,
    activeManualTab,
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
    setActiveManualTab,
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
    dismissedRowIds,
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
    dismissedRowIds,
    scanStatusQuery,
  });

  const { computedExtrasTabs, computedManualTabs, computedMainTabs } = useOrganizerTabs({
    discoveryExtras: discovery.extras,
    t,
    tabCounts,
    dismissedRowIds,
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

  const { refreshOrganizerDiscovery } = useOrganizerDeleteActions({
    t,
    closeModal,
    toast,
    queryClient,
    focusFirstAvailableResult,
    clearSelectedRows,
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
      toast(t('organizer.toasts.refreshRulesFailed'), 'danger');
    });
  }, [
    discoveryQuery.data,
    focusFirstAvailableResult,
    isScanActive,
    organizerRuleSignature,
    queryClient,
    toast,
    refreshOrganizerDiscovery,
    t,
  ]);

  return (
    <OrganizerModalProvider
      focusFirstAvailableResult={focusFirstAvailableResult}
      clearSelectedRows={clearSelectedRows}
      dismissRows={dismissRows}
      selectedRows={selectedRows}
    >
      <OrganizerPageContent
        activeExtrasTab={activeExtrasTab}
        activeManualTab={activeManualTab}
        activeImage={activeImage}
        activeImageIndex={activeImageIndex}
        activeImages={activeImages}
        activeMainTab={activeMainTab}
        activeRow={activeRow}
        currentPage={currentPage}
        handleAdvanceDetailsImage={handleAdvanceDetailsImage}
        handleSortToggle={handleSortToggle}
        handleToggleAll={handleToggleAll}
        handleToggleDetails={handleToggleDetails}
        handleToggleRow={handleToggleRow}
        isDetailsCollapsed={isDetailsCollapsed}
        pageSize={pageSize}
        paginatedRows={paginatedRows}
        searchQuery={searchQuery}
        selectedRowIds={selectedRowIds}
        setActiveExtrasTab={setActiveExtrasTab}
        setActiveManualTab={setActiveManualTab}
        setActiveMainTab={setActiveMainTab}
        setActiveRowId={setActiveRowId}
        setPageAndScrollToTop={setPageAndScrollToTop}
        setPageSize={setPageSize}
        setSearchQuery={setSearchQuery}
        shouldShowDetailsCarousel={shouldShowDetailsCarousel}
        shouldShowDetailsPoster={shouldShowDetailsPoster}
        sortConfig={sortConfig}
        sortedRows={sortedRows}
        totalPages={totalPages}
        settingsQuery={settingsQuery}
        discoveryQuery={discoveryQuery}
        computedExtrasTabs={computedExtrasTabs}
        computedManualTabs={computedManualTabs}
        computedMainTabs={computedMainTabs}
        organizerEmptyState={organizerEmptyState}
        organizerLoadingState={organizerLoadingState}
        shouldShowDetailsPanel={shouldShowDetailsPanel}
        summaryText={summaryText}
        emptyStateActions={emptyStateActions}
        headerActions={headerActions}
        onDropPaths={handleScanPaths}
        isDropzoneDisabled={isScanActive || isBrowseStarting || isLoadingAll || isRenameStarting}
        t={t}
      />
    </OrganizerModalProvider>
  );
}

function OrganizerPageContent({
  activeExtrasTab,
  activeManualTab,
  activeImage,
  activeImageIndex,
  activeImages,
  activeMainTab,
  activeRow,
  currentPage,
  handleAdvanceDetailsImage,
  handleSortToggle,
  handleToggleAll,
  handleToggleDetails,
  handleToggleRow,
  isDetailsCollapsed,
  pageSize,
  paginatedRows,
  searchQuery,
  selectedRowIds,
  setActiveExtrasTab,
  setActiveManualTab,
  setActiveMainTab,
  setActiveRowId,
  setPageAndScrollToTop,
  setPageSize,
  setSearchQuery,
  shouldShowDetailsCarousel,
  shouldShowDetailsPoster,
  sortConfig,
  sortedRows,
  totalPages,
  settingsQuery,
  discoveryQuery,
  computedExtrasTabs,
  computedManualTabs,
  computedMainTabs,
  organizerEmptyState,
  organizerLoadingState,
  shouldShowDetailsPanel,
  summaryText,
  emptyStateActions,
  headerActions,
  onDropPaths,
  isDropzoneDisabled,
  t,
}) {
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

  return (
    <Page className="organizer-page">
      <div className={`organizer-main ${isDetailsCollapsed || !shouldShowDetailsPanel ? 'is-details-collapsed' : ''}`}>
        <div className="organizer-main__content">
          <OrganizerHeaderPanel
            activeExtrasTab={activeExtrasTab}
            activeManualTab={activeManualTab}
            activeMainTab={activeMainTab}
            actions={headerActions}
            computedExtrasTabs={computedExtrasTabs}
            computedManualTabs={computedManualTabs}
            computedMainTabs={computedMainTabs}
            onChangeExtrasTab={setActiveExtrasTab}
            onChangeManualTab={setActiveManualTab}
            onChangeMainTab={setActiveMainTab}
            searchPlaceholder={
              activeMainTab === 'manual'
                ? t('organizer.searchPlaceholderManual')
                : activeMainTab === 'movies'
                ? t('organizer.searchPlaceholderMovies')
                : activeMainTab === 'episodes'
                ? t('organizer.searchPlaceholderEpisodes')
                : activeMainTab === 'extras'
                ? t('organizer.searchPlaceholderExtras')
                : t('organizer.searchPlaceholder')
            }
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            title={t('organizer.title')}
          />

          <OrganizerResultsPanel
            activeRowId={activeRow?.id || null}
            columns={columns}
            currentPage={currentPage}
            dropOverlayDescription={t('organizer.dropzone.description')}
            dropOverlayLabel={t('organizer.dropzone.label')}
            onDropPaths={onDropPaths}
            isDropzoneDisabled={isDropzoneDisabled}
            emptyActions={emptyStateActions}
            emptyState={organizerEmptyState}
            emptyText={discoveryQuery.isLoading ? t('organizer.table.emptyLoading') : t('organizer.table.emptyDefault')}
            labels={t('organizer.pagination')}
            loadingState={organizerLoadingState}
            onPageChange={setPageAndScrollToTop}
            onPageSizeChange={setPageSize}
            onRowClick={(row) => setActiveRowId(row.id)}
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
