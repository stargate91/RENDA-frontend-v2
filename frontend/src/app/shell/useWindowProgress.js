import { useState, useEffect } from 'react';
import { useTranslation } from '../providers/LanguageContext';
import { useImageStatusQuery, useScanStatusQuery, useHydrateStatusQuery } from '../queries';
import {
  getScanProgress,
  formatScanRemaining,
  getScanTaskName,
  getImageProgress,
  formatImageRemaining,
} from './windowProgressUtils';

export default function useWindowProgress() {
  const { t } = useTranslation();
  const scanStatusQuery = useScanStatusQuery();
  const imageStatusQuery = useImageStatusQuery();
  const hydrateStatusQuery = useHydrateStatusQuery();
  
  const scanStatus = scanStatusQuery.data || null;
  const imageStatus = imageStatusQuery.data || null;
  const hydrateStatus = hydrateStatusQuery.data || null;
  
  const isPrimaryActive = Boolean(scanStatus?.active);
  const isPeopleImportActive = isPrimaryActive && scanStatus?.phase === 'people_importing';
  const isScanActive = isPrimaryActive && scanStatus?.phase !== 'sync_language' && scanStatus?.phase !== 'people_importing';
  const isSyncActive = isPrimaryActive && scanStatus?.phase === 'sync_language';
  const isImageActive = Boolean(imageStatus?.active);
  const isHydrateActive = Boolean(hydrateStatus?.active);

  const [scanState, setScanState] = useState({
    lastScanStartTime: null,
    maxScanProgress: 0,
  });

  const startTime = scanStatus?.active ? (scanStatus.start_time || 0) : null;
  const rawProgress = scanStatus?.active ? getScanProgress(scanStatus) : 0;

  useEffect(() => {
    if (!isScanActive) {
      if (scanState.lastScanStartTime !== null || scanState.maxScanProgress !== 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setScanState({
          lastScanStartTime: null,
          maxScanProgress: 0,
        });
      }
    } else if (startTime !== scanState.lastScanStartTime) {
      setScanState({
        lastScanStartTime: startTime,
        maxScanProgress: rawProgress,
      });
    } else if (rawProgress > scanState.maxScanProgress) {
      setScanState((prev) => ({
        ...prev,
        maxScanProgress: rawProgress,
      }));
    }
  }, [isScanActive, startTime, rawProgress, scanState.lastScanStartTime, scanState.maxScanProgress]);

  const currentMaxScanProgress = isScanActive
    ? Math.max(scanState.maxScanProgress, rawProgress)
    : 0;

  const scanProgressData = isPrimaryActive
    ? isSyncActive
      ? {
          taskName: t('progress.sync.running') || 'Syncing metadata languages...',
          progress: Math.round(scanStatus.progress || 0),
          timeRemaining: `${scanStatus.processed_files || 0}/${scanStatus.total_files || 0}`,
          active: true,
          variant: 'primary',
        }
      : {
          taskName: getScanTaskName(scanStatus, t),
          progress: currentMaxScanProgress,
          timeRemaining: formatScanRemaining(scanStatus, currentMaxScanProgress),
          active: true,
          variant: 'primary',
        }
    : null;

  return {
    hasProgress: isPrimaryActive || isImageActive || isHydrateActive,
    scanProgress: isScanActive || isSyncActive ? scanProgressData : null,
    imageProgress: isImageActive
      ? {
          taskName: t('progress.images.downloading'),
          progress: getImageProgress(imageStatus),
          timeRemaining: formatImageRemaining(imageStatus),
          active: true,
          variant: 'sub',
        }
      : null,
    hydrateProgress: isHydrateActive
      ? {
          taskName: t('progress.people.hydrating') || 'Enriching extra people...',
          progress: hydrateStatus.total > 0 ? Math.round((hydrateStatus.current / hydrateStatus.total) * 100) : 0,
          timeRemaining: `${hydrateStatus.current}/${hydrateStatus.total}`,
          active: true,
          variant: 'sub',
        }
      : isPeopleImportActive
      ? {
          taskName: t('progress.people.importing') || 'Importing bulk people...',
          progress: scanStatus.total > 0 ? Math.round((scanStatus.current / scanStatus.total) * 100) : 0,
          timeRemaining: `${scanStatus.current}/${scanStatus.total}`,
          active: true,
          variant: 'sub',
        }
      : null,
    syncProgress: null,
  };
}
