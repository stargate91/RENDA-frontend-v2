import { memo, useMemo } from 'react';
import { EyeOff, Trash2, Search, Sliders, X } from 'lucide-react';
import { useTranslation } from '../providers/LanguageProvider';
import Tooltip from './Tooltip';
import IconButton from './IconButton';
import ContextMenu from './ContextMenu';
import { useContextMenu } from './useContextMenu';
import './Table.css';

function TableHeader({ columns }) {
  return (
    <thead>
      <tr>
        {columns.map((col) => (
          <th
            key={col.key}
            width={col.width || undefined}
            className={`${col.align ? `text-${col.align}` : ''} ${col.width ? 'ui-table__cell--truncate' : ''}`.trim()}
          >
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

const TableRow = memo(function TableRow({
  row,
  columns,
  onRowClick,
  onContextMenu,
  activeRowId,
  rowActions = [],
}) {
  const lastColumnKey = columns[columns.length - 1]?.key;
  const hasRowActions = rowActions.length > 0;
  const visibleRowActions = hasRowActions
    ? rowActions.filter((action) => (action.isVisible ? action.isVisible(row) : true))
    : [];

  return (
    <tr
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, row) : undefined}
      className={`${onRowClick ? 'is-clickable' : ''} ${activeRowId === row.id ? 'is-active' : ''}`.trim()}
    >
      {columns.map((col) => {
        const rawValue = row[col.key];
        const renderedValue = col.render ? col.render(rawValue, row) : rawValue;
        const hasActionsInCell = visibleRowActions.length > 0 && col.key === lastColumnKey;
        const hideOnHoverClass = (hasActionsInCell || col.hideOnHover) ? 'hide-on-hover' : '';
        const isEmpty = renderedValue === undefined || renderedValue === null || renderedValue === '';

        return (
          <td
            key={col.key}
            width={col.width || undefined}
            className={`${col.align ? `text-${col.align}` : ''} ${col.width ? 'ui-table__cell--truncate' : ''}`.trim()}
          >
            <div className="ui-table__cell-content">
              <span className={`ui-table__cell-value ${hideOnHoverClass}`.trim()}>
                {isEmpty ? '-' : renderedValue}
              </span>
              {hasActionsInCell ? (
                <div className="ui-table__row-actions" onClick={(event) => event.stopPropagation()}>
                  {visibleRowActions.map((action) => (
                    <Tooltip key={action.key} content={action.tooltip || action.label} side="top">
                      <IconButton
                        type="button"
                        className={`ui-table__row-action ${action.className || ''}`.trim()}
                        onClick={() => action.onClick(row)}
                        label={action.tooltip || action.label}
                        title={null}
                        size="sm"
                      >
                        <action.icon size={15} />
                      </IconButton>
                    </Tooltip>
                  ))}
                </div>
              ) : null}
            </div>
          </td>
        );
      })}
    </tr>
  );
});

export default function Table({
  columns,
  rows = [],
  onRowClick,
  activeRowId = null,
  emptyText = 'No data available',
  rowActions = [],
  selectedRows = [],
  openBulkDeleteModal,
  openMatchModal,
  openBulkOverrideModal,
  dismissRows,
  clearSelectedRows,
}) {
  const {
    contextMenu,
    handleRowContextMenu,
    closeContextMenu,
    activeRow,
    useBulkActions,
  } = useContextMenu(selectedRows);

  const { t } = useTranslation();

  const contextMenuItems = useMemo(() => {
    const items = [];
    if (!activeRow) return items;

    if (useBulkActions) {
      const hasExtras = selectedRows.some((r) => r.rawType === 'extra');
      const allSameType = selectedRows.every((r) => r.rawType === selectedRows[0].rawType);

      if (!hasExtras && dismissRows && clearSelectedRows) {
        items.push({
          key: 'bulk-dismiss',
          label: t('organizer.actions.dismissBulk') || 'Remove',
          icon: EyeOff,
          onClick: () => {
            dismissRows(selectedRows.map((r) => r.id));
            clearSelectedRows();
          },
        });
      }

      if (openBulkDeleteModal) {
        items.push({
          key: 'bulk-delete',
          label: t('organizer.actions.delete') || 'Delete',
          icon: Trash2,
          className: 'is-danger',
          onClick: () => openBulkDeleteModal(selectedRows),
        });
      }

      if (!hasExtras && openMatchModal) {
        items.push({
          key: 'bulk-match',
          label: t('organizer.actions.match') || 'Match',
          icon: Search,
          onClick: () => openMatchModal(null, selectedRows),
        });
      }

      if (allSameType && openBulkOverrideModal) {
        items.push({
          key: 'bulk-override',
          label: t('organizer.actions.override') || 'Override',
          icon: Sliders,
          onClick: () => openBulkOverrideModal(selectedRows),
        });
      }

      if (clearSelectedRows) {
        items.push({ divider: true });
        items.push({
          key: 'bulk-clear',
          label: t('organizer.bulkBar.clear') || 'Clear selection',
          icon: X,
          onClick: clearSelectedRows,
        });
      }
    } else if (rowActions.length > 0) {
      const visibleActions = rowActions.filter((action) => (action.isVisible ? action.isVisible(activeRow) : true));
      
      visibleActions.forEach((action) => {
        if ((action.key === 'dismiss' || action.key === 'delete') && items.length > 0 && !items[items.length - 1].divider) {
          items.push({ divider: true });
        }
        
        items.push({
          key: action.key,
          label: action.tooltip || action.label,
          icon: action.icon,
          className: action.className || '',
          onClick: () => action.onClick(activeRow),
        });
      });
    }

    return items;
  }, [activeRow, useBulkActions, selectedRows, dismissRows, clearSelectedRows, openBulkDeleteModal, openMatchModal, openBulkOverrideModal, rowActions, t]);

  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <TableHeader columns={columns} />
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="ui-table__empty">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                row={row}
                columns={columns}
                onRowClick={onRowClick}
                onContextMenu={handleRowContextMenu}
                activeRowId={activeRowId}
                rowActions={rowActions}
              />
            ))
          )}
        </tbody>
      </table>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
