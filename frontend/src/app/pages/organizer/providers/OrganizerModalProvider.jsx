import { createContext } from 'react';
import { useOrganizerModalActions } from '../useOrganizerModalActions';

const OrganizerModalContext = createContext(null);

export function OrganizerModalProvider({
  children,
  focusFirstAvailableResult,
  clearSelectedRows,
  dismissRows,
  selectedRows,
}) {
  const {
    openDeleteModal,
    openBulkDeleteModal,
    openMatchModal,
    openOverrideModal,
    openBulkOverrideModal,
    rowActions,
    bulkActionBar,
    refreshOrganizerDiscovery,
  } = useOrganizerModalActions({
    focusFirstAvailableResult,
    clearSelectedRows,
    dismissRows,
    selectedRows,
  });

  const contextValue = {
    openDeleteModal,
    openBulkDeleteModal,
    openMatchModal,
    openOverrideModal,
    openBulkOverrideModal,
    rowActions,
    bulkActionBar,
    refreshOrganizerDiscovery,
    selectedRows,
    dismissRows,
    clearSelectedRows,
  };

  return (
    <OrganizerModalContext.Provider value={contextValue}>
      {children}
    </OrganizerModalContext.Provider>
  );
}

export { OrganizerModalContext };
