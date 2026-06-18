import { LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';

export default function MetadataRefreshButton({
  t,
  metadataState,
  refreshState,
  onRefresh,
  disabled = false,
  compact = false,
}) {
  const normalizedState = String(metadataState || '').toLowerCase();
  const status = String(refreshState?.status || '').toLowerCase();
  const isRefreshing = normalizedState === 'refreshing' || status === 'refreshing' || status === 'started';
  const isFailed = normalizedState === 'failed' || status === 'failed';
  const isPartial = normalizedState === 'partial';
  const label = isRefreshing
    ? (t('common.refreshing') || 'Refreshing')
    : isFailed
      ? (t('common.retry') || 'Retry')
      : isPartial
        ? (t('common.refresh') || 'Refresh')
        : (t('common.refresh') || 'Refresh');

  const icon = isRefreshing
    ? <LoaderCircle size={16} className="spin" />
    : isFailed
      ? <TriangleAlert size={16} />
      : <RefreshCw size={16} />;

  const title = isRefreshing
    ? label
    : isFailed
      ? (t('library.details.metadataRefreshFailed') || 'Refresh failed, try again')
      : isPartial
        ? (t('library.details.metadataRefreshPartial') || 'Metadata is partial, refresh available')
        : (t('library.details.metadataRefreshReady') || 'Metadata is ready, refresh available');

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={disabled || isRefreshing}
      className="media-detail-page__side-nav-toggle"
      title={title}
      aria-label={compact ? label : title}
    >
      {icon}
      {!compact ? label : null}
    </button>
  );
}
