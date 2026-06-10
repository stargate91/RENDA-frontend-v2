import { ArrowRight } from 'lucide-react';
import Checkbox from '../../ui/Checkbox';
import StatusPill from '../../ui/StatusPill';
import Tooltip from '../../ui/Tooltip';
import { mapCollisionStrategyLabel, shouldShowCollisionStrategy } from './organizerMappers';

export function buildOrganizerColumns({
  activeExtrasTab,
  activeMainTab,
  collisionStrategy,
  handleToggleAll,
  handleToggleRow,
  normalizeStatusTone,
  paginatedRows,
  renderSortableLabel,
  selectedRowIds,
  t,
  onOpenMatch,
}) {
  const columns = [
    {
      key: 'select',
      label: (
        <div onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={paginatedRows.length > 0 && paginatedRows.every((row) => selectedRowIds.has(row.id))}
            onChange={handleToggleAll}
          />
        </div>
      ),
      width: '48px',
      align: 'center',
      render: (value, row) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={selectedRowIds.has(row.id)}
            onChange={() => handleToggleRow(row.id)}
          />
        </div>
      ),
    },
    { key: 'source', label: renderSortableLabel(t('organizer.table.originalFilename'), 'source'), width: '500px' },
    {
      key: 'target',
      label: renderSortableLabel(t('organizer.table.proposedFilename'), 'target'),
      width: '500px',
      render: (value, row) => {
        const isManualReview = activeMainTab === 'manual';

        const content = (() => {
          if (row.rawType === 'extra') {
            const unmatchedParentStatuses = ['new', 'uncertain', 'no_match', 'multiple', 'error'];
            if (row.parentStatus && unmatchedParentStatuses.includes(row.parentStatus.toLowerCase())) {
              return <span className="organizer-target-note organizer-target-note--warning">{t('organizer.table.targetNotes.fixParentFirst')}</span>;
            }
            if (row.rawAction === 'skip') {
              return <span className="organizer-target-note organizer-target-note--muted">{t('organizer.table.targetNotes.skip')}</span>;
            }
            if (row.rawAction === 'delete') {
              return <span className="organizer-target-note organizer-target-note--danger">{t('organizer.table.targetNotes.delete')}</span>;
            }
          }
          return (
            <span className="organizer-target-proposed">
              <ArrowRight size={14} className="organizer-target-arrow" />
              {value}
            </span>
          );
        })();

        if (isManualReview && row.rawType !== 'extra') {
          return (
            <div className="organizer-target-cell">
              <button
                type="button"
                className="organizer-target-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMatch(row);
                }}
              >
                {t('organizer.actions.fixMatch')}
              </button>
            </div>
          );
        }

        return content;
      },
    },
  ];

  if (activeMainTab === 'extras') {
    if (activeExtrasTab === 'bonus' || activeExtrasTab === 'images') {
      columns.push({ key: 'category', label: renderSortableLabel(t('organizer.table.subcategory'), 'category'), align: 'center' });
    } else if (activeExtrasTab === 'subtitles' || activeExtrasTab === 'audio') {
      columns.push({ key: 'category', label: renderSortableLabel(t('organizer.table.subcategory'), 'category'), align: 'center' });
      columns.push({ key: 'language', label: renderSortableLabel(t('organizer.table.language'), 'language'), align: 'center' });
    } else if (activeExtrasTab === 'metadata') {
      columns.push({ key: 'extension', label: renderSortableLabel(t('organizer.table.extension'), 'extension'), align: 'center' });
    }
  } else {
    if (activeMainTab === 'manual') {
      columns.push({
        key: 'type',
        label: renderSortableLabel(t('organizer.table.type'), 'type'),
        align: 'center',
        hideOnHover: true,
        render: (value) => (
          <span className="organizer-type-text">
            {value}
          </span>
        ),
      });
    }
    columns.push({
      key: 'status',
      label: activeMainTab === 'manual' ? renderSortableLabel(t('organizer.table.status'), 'status') : t('organizer.table.status'),
      align: 'center',
      render: (value, row) => (
        <span className="organizer-status-cell">
          <StatusPill tone={normalizeStatusTone(value, t)}>{value}</StatusPill>
          {(row.rawType === 'movie' || row.rawType === 'episode') && shouldShowCollisionStrategy(row) ? (
            <StatusPill className="organizer-status-cell__policy" tone="default">
              {mapCollisionStrategyLabel(row.rawAction || collisionStrategy, t)}
            </StatusPill>
          ) : null}
          {row.rawStatus === 'uncertain' && row.rawType === 'series' ? (
            <Tooltip content={t('organizer.status.missingSeasonTooltip')} side="top" delay={250}>
              <StatusPill className="organizer-status-cell__policy" tone="default">
                {t('organizer.status.missingSeason')}
              </StatusPill>
            </Tooltip>
          ) : null}
          {row.rawStatus === 'uncertain' && (row.rawType === 'series' || row.rawType === 'season') ? (
            <Tooltip content={t('organizer.status.missingEpisodeTooltip')} side="top" delay={250}>
              <StatusPill className="organizer-status-cell__policy" tone="default">
                {t('organizer.status.missingEpisode')}
              </StatusPill>
            </Tooltip>
          ) : null}
        </span>
      ),
    });
  }

  return columns;
}
