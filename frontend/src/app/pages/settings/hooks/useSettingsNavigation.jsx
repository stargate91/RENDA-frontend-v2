import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ORGANIZATION_TAB_IDS, SETTINGS_TAB_IDS } from '../settingsConstants.js';

export default function useSettingsNavigation(form) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(SETTINGS_TAB_IDS.GENERAL);
  const [isOrgExpanded, setIsOrgExpanded] = useState(true);

  const isOrganizationTabActive = useMemo(
    () => ORGANIZATION_TAB_IDS.includes(activeTab),
    [activeTab]
  );

  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  useEffect(() => {
    if (!isOrganizationTabActive) {
      setIsOrgExpanded(false);
    }
  }, [isOrganizationTabActive]);

  useEffect(() => {
    if (!form.folder_organization_enabled && activeTab === SETTINGS_TAB_IDS.COLLECTIONS) {
      setActiveTab(SETTINGS_TAB_IDS.PRESETS);
    }
    if (
      !form.folder_move_to_library &&
      [SETTINGS_TAB_IDS.FOLDER_STRUCTURE, SETTINGS_TAB_IDS.COLLECTIONS].includes(activeTab)
    ) {
      setActiveTab(SETTINGS_TAB_IDS.PRESETS);
    }
  }, [form.folder_move_to_library, form.folder_organization_enabled, activeTab]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClose]);

  return {
    activeTab,
    setActiveTab,
    isOrgExpanded,
    setIsOrgExpanded,
    isOrganizationTabActive,
    organizationTabs: ORGANIZATION_TAB_IDS,
    handleClose,
  };
}
