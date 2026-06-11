import { memo } from 'react';
import Tooltip from './Tooltip';
import IconButton from './IconButton';
import './Table.css';

function TableHeader({ columns }) {
  return (
    <thead>
      <tr>
        {columns.map((col) => (
          <th
            key={col.key}
            style={col.width ? { width: col.width, maxWidth: col.width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}
            className={col.align ? `text-${col.align}` : ''}
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
            className={col.align ? `text-${col.align}` : ''}
            style={col.width ? { width: col.width, maxWidth: col.width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}
          >
            <div className="ui-table__cell-content">
              <span className={`ui-table__cell-value ${hideOnHoverClass}`.trim()}>
                {isEmpty ? '-' : renderedValue}
              </span>
              {hasActionsInCell ? (
                <div className="ui-table__row-actions" onClick={(event) => event.stopPropagation()}>
                  {visibleRowActions.map((action) => (
                    <Tooltip key={action.key} content={action.tooltip || action.label} side="top" delay={250}>
                      <IconButton
                        type="button"
                        className={`ui-table__row-action ${action.className || ''}`.trim()}
                        onClick={() => action.onClick(row)}
                        label={action.tooltip || action.label}
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
}) {
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
                activeRowId={activeRowId}
                rowActions={rowActions}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
