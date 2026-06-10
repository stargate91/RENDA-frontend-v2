import { useTranslation } from '../providers/LanguageProvider';
import { useImageStatusQuery, useScanStatusQuery } from '../queries/appQueries';

const PHASE_RANGES = {
  collecting: [0, 28],
  probing: [28, 52],
  enriching: [52, 76],
  resolving: [76, 100],
  organizing: [0, 100],
};

const clampPercent = (value) => Math.max(0, Math.min(100, value));

const getPhaseProgress = (status) => {
  if (!status?.active) {
    return 0;
  }

  const total = Number(status.total) || 0;
  const current = Number(status.current) || 0;
  if (total <= 0) {
    return 0;
  }

  return clampPercent(current / total);
};

const getScanProgress = (status) => {
  if (!status?.active) {
    return 0;
  }

  const phaseProgress = getPhaseProgress(status);
  const range = PHASE_RANGES[status.phase];

  if (!range) {
    return clampPercent(Math.round(phaseProgress * 100));
  }

  const [start, end] = range;
  return clampPercent(Math.round(start + ((end - start) * phaseProgress)));
};

let lastScanStartTime = null;
let maxScanProgress = 0;

const formatScanRemaining = (status, progress) => {
  if (!status?.active) {
    return '--:--';
  }

  const startTime = Number(status.start_time) || 0;

  if (!startTime || progress <= 0 || progress >= 100) {
    return '--:--';
  }

  const elapsedSeconds = Math.max(0, Date.now() / 1000 - startTime);
  if (!elapsedSeconds) {
    return '--:--';
  }

  const estimatedRemaining = Math.max(0, Math.round((elapsedSeconds / progress) * (100 - progress)));
  const minutes = String(Math.floor(estimatedRemaining / 60)).padStart(2, '0');
  const seconds = String(estimatedRemaining % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const getScanTaskName = (status, t) => {
  if (!status?.active) {
    return t('progress.ready');
  }

  if (status.message) {
    return status.message;
  }

  const phaseLabelKey = `progress.scan.${status.phase}`;
  const phaseLabel = t(phaseLabelKey);
  return phaseLabel === phaseLabelKey ? t('progress.working') : phaseLabel;
};

const getImageProgress = (status) => {
  if (!status?.active) {
    return 0;
  }

  const progress = Number(status.progress);
  if (Number.isFinite(progress)) {
    return clampPercent(Math.round(progress));
  }

  const total = Number(status.total) || 0;
  const completed = Number(status.completed) || 0;
  if (total <= 0) {
    return 0;
  }

  return clampPercent(Math.round((completed / total) * 100));
};

const formatImageRemaining = (status) => {
  if (!status?.active) {
    return '--:--';
  }

  const progress = getImageProgress(status);
  if (progress <= 0 || progress >= 100) {
    return '--:--';
  }

  return `${Number(status.completed) || 0}/${Number(status.total) || 0}`;
};

export default function useWindowProgress() {
  const { t } = useTranslation();
  const scanStatusQuery = useScanStatusQuery();
  const imageStatusQuery = useImageStatusQuery();
  const scanStatus = scanStatusQuery.data || null;
  const imageStatus = imageStatusQuery.data || null;
  const isScanActive = Boolean(scanStatus?.active);
  const isImageActive = Boolean(imageStatus?.active);

  if (!isScanActive) {
    lastScanStartTime = null;
    maxScanProgress = 0;
  }

  const scanProgressData = isScanActive
    ? (() => {
        const startTime = scanStatus.start_time || 0;
        if (startTime !== lastScanStartTime) {
          lastScanStartTime = startTime;
          maxScanProgress = 0;
        }
        const rawProgress = getScanProgress(scanStatus);
        if (rawProgress > maxScanProgress) {
          maxScanProgress = rawProgress;
        }
        return {
          taskName: getScanTaskName(scanStatus, t),
          progress: maxScanProgress,
          timeRemaining: formatScanRemaining(scanStatus, maxScanProgress),
          active: true,
        };
      })()
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

