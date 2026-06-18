import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useTranslation } from '../providers/LanguageContext';
import { METADATA_REFRESH_UTILITY_EVENT } from '../queries/metadataQueries';

const formatTargetLabel = (targetType, t) => {
  const value = String(targetType || '').toLowerCase();
  if (value === 'person') return t('library.details.person') || 'Person';
  if (value === 'collection') return t('library.details.collection') || 'Collection';
  if (value === 'item' || value === 'movie') return t('library.movies') || 'Movie';
  if (value === 'series' || value === 'tv' || value === 'library-series') return t('library.series') || 'Series';
  return value || 'Metadata';
};

export default function MetadataRefreshStatus() {
  const { t } = useTranslation();
  const [status, setStatus] = useState({ active: false, count: 0, items: [] });

  useEffect(() => {
    const handleStatus = (event) => {
      setStatus(event.detail || { active: false, count: 0, items: [] });
    };
    window.addEventListener(METADATA_REFRESH_UTILITY_EVENT, handleStatus);
    return () => window.removeEventListener(METADATA_REFRESH_UTILITY_EVENT, handleStatus);
  }, []);

  if (!status.active) {
    return null;
  }

  const firstItem = status.items?.[0];
  const text = status.count > 1
    ? `${t('common.refreshing') || 'Refreshing'} metadata (${status.count})`
    : `${t('common.refreshing') || 'Refreshing'} ${formatTargetLabel(firstItem?.targetType, t)} metadata`;

  return (
    <div className="shell__utility-bar-center" role="status" aria-live="polite">
      <div className="shell__refresh-status-pill">
        <LoaderCircle size={14} className="spin" />
        <span>{text}</span>
      </div>
    </div>
  );
}
