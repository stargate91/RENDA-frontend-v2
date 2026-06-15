import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useScanStatusQuery } from '@/queries';

const getBulkImportBannerStorageKey = (isAdultMode) =>
  isAdultMode ? 'showBulkImportBanner:nsfw' : 'showBulkImportBanner:sfw';
const getBulkImportResolveStatePrefix = (isAdultMode) =>
  `bulkImportResolvedRows:${isAdultMode ? 'nsfw' : 'sfw'}:`;

export function useLibraryBulkImport({ isAdultMode, isPeopleTab }) {
  const queryClient = useQueryClient();
  const [showBulkImportBanner, setShowBulkImportBanner] = useState(() =>
    localStorage.getItem(getBulkImportBannerStorageKey(isAdultMode)) === 'true'
  );
  const [prevIsAdultMode, setPrevIsAdultMode] = useState(isAdultMode);

  if (isAdultMode !== prevIsAdultMode) {
    setPrevIsAdultMode(isAdultMode);
    setShowBulkImportBanner(localStorage.getItem(getBulkImportBannerStorageKey(isAdultMode)) === 'true');
  }

  const scanStatusQuery = useScanStatusQuery({ enabled: isPeopleTab });
  const prevPeopleImportCurrent = useRef(0);

  // Invalidate queries when bulk import is active and progressing
  useEffect(() => {
    const data = scanStatusQuery.data;
    if (!data) {
      return;
    }

    if (data.active && data.phase === 'people_importing') {
      const current = Number(data.current || 0);
      if (current > prevPeopleImportCurrent.current) {
        prevPeopleImportCurrent.current = current;
        queryClient.invalidateQueries({ queryKey: ['library'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      }
    } else {
      prevPeopleImportCurrent.current = 0;
    }
  }, [queryClient, scanStatusQuery.data]);

  // Listen to bulk import complete events
  useEffect(() => {
    const handlePeopleBulkImportComplete = (event) => {
      if (event.detail?.hasUnresolved && Boolean(event.detail?.adultOnly) === isAdultMode) {
        setShowBulkImportBanner(true);
      }
    };

    window.addEventListener('people-bulk-import-complete', handlePeopleBulkImportComplete);
    return () => {
      window.removeEventListener('people-bulk-import-complete', handlePeopleBulkImportComplete);
    };
  }, [isAdultMode]);

  const dismissBulkImportBanner = () => {
    setShowBulkImportBanner(false);
    localStorage.removeItem(getBulkImportBannerStorageKey(isAdultMode));
    try {
      const resolveStatePrefix = getBulkImportResolveStatePrefix(isAdultMode);
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(resolveStatePrefix)) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore storage cleanup failures.
    }
  };

  return {
    showBulkImportBanner,
    dismissBulkImportBanner,
  };
}
