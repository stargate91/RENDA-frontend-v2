import { useState, useEffect } from 'react';
import { useTranslation } from '../providers/LanguageProvider';
import { useImageStatusQuery, useScanStatusQuery } from '../queries';
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
  const scanStatus = scanStatusQuery.data || null;
  const imageStatus = imageStatusQuery.data || null;
  const isScanActive = Boolean(scanStatus?.active);
  const isImageActive = Boolean(imageStatus?.active);

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

  const scanProgressData = isScanActive
    ? {
        taskName: getScanTaskName(scanStatus, t),
        progress: currentMaxScanProgress,
        timeRemaining: formatScanRemaining(scanStatus, currentMaxScanProgress),
        active: true,
      }
    : null;

  return {
    hasProgress: isScanActive || isImageActive,
    scanProgress: scanProgressData,
    imageProgress: isImageActive
      ? {
          taskName: t('progress.images.downloading'),
          progress: getImageProgress(imageStatus),
          timeRemaining: formatImageRemaining(imageStatus),
          active: true,
          variant: 'sub',
        }
      : null,
  };
}
