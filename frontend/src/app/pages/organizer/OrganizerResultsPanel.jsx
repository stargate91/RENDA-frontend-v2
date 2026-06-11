import EmptyState from '../../ui/EmptyState';
import PaginationBar from '../../ui/PaginationBar';
import Spinner from '../../ui/Spinner';
import Table from '../../ui/Table';

import { useOrganizerModals } from './useOrganizerModals';

export default function OrganizerResultsPanel({
  activeRowId,
  columns,
  currentPage,
  dropOverlayDescription,
  dropOverlayLabel,
  isDropActive = false,
  dropzoneProps,
  emptyActions,
  emptyState,
  emptyText,
  labels,
  loadingState,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  pageSize,
  pageSizeOptions,
  rows,
  showPageSizes = false,
  summaryText,
  totalItems = 0,
  totalPages,
}) {
  const {
    bulkActionBar,
    rowActions,
    selectedRows,
    openBulkDeleteModal,
    openMatchModal,
    openBulkOverrideModal,
    dismissRows,
    clearSelectedRows,
  } = useOrganizerModals();
  const shouldShowPagination = totalItems > 20;

  return (
    <div className="organizer-results" {...dropzoneProps}>
      {dropzoneProps ? (
        <div className={`organizer-drop-overlay${isDropActive ? ' is-active' : ''}`}>
          <div className="organizer-drop-overlay__panel">
            <span className="organizer-drop-overlay__label">{dropOverlayLabel}</span>
            <span className="organizer-drop-overlay__description">{dropOverlayDescription}</span>
          </div>
        </div>
      ) : null}
      {loadingState ? (
        <div className="organizer-results organizer-results--empty">
          <div className="organizer-empty-state organizer-empty-state--loading">
            <Spinner
              className="organizer-spinner-state"
              label={loadingState.label}
              description={loadingState.description}
            />
          </div>
        </div>
      ) : emptyState ? (
        <div className="organizer-results organizer-results--empty">
          <EmptyState
            actions={emptyActions}
            className="organizer-empty-state"
            description={emptyState.description}
            icon={emptyState.icon}
            title={emptyState.title}
          />
        </div>
      ) : (
        <>
          {bulkActionBar}
          {shouldShowPagination ? (
            <PaginationBar
              summaryText={summaryText}
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              pageSizeOptions={pageSizeOptions}
              showPageSizes={showPageSizes}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
              labels={labels}
            />
          ) : null}

          <div className="organizer-table-block">
            <div className="organizer-content">
              <Table
                columns={columns}
                rows={rows}
                activeRowId={activeRowId}
                onRowClick={onRowClick}
                emptyText={emptyText}
                rowActions={rowActions}
                selectedRows={selectedRows}
                openBulkDeleteModal={openBulkDeleteModal}
                openMatchModal={openMatchModal}
                openBulkOverrideModal={openBulkOverrideModal}
                dismissRows={dismissRows}
                clearSelectedRows={clearSelectedRows}
              />
            </div>

            {shouldShowPagination ? (
              <PaginationBar
                summaryText={summaryText}
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                onPageChange={onPageChange}
                labels={labels}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
