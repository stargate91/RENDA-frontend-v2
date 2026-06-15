import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import ToastViewport from '../ui/ToastViewport';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useTranslation } from './LanguageContext';

const UiContext = createContext(null);

export const UiProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const { t } = useTranslation();

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(() => ({
    toast: (title, tone = 'default') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const wordCount = String(title || '').split(/\s+/).filter(Boolean).length;
      const duration = Math.max(3000, 2000 + (wordCount * 300));
      setToasts((current) => [...current, { id, title, tone, duration }]);
    },
    removeToast,
    openModal: (nextModal) => setModal(nextModal),
    closeModal: () => setModal(null),
  }), [removeToast]);

  return (
    <UiContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onRemoveToast={removeToast} />
      <Modal
        open={Boolean(modal)}
        title={modal?.title}
        description={modal?.description}
        variant={modal?.variant}
        className={modal?.className}
        icon={modal?.icon}
        onClose={() => setModal(null)}
        footer={modal?.footer ?? (
          <Button variant="secondary-neutral" onClick={() => setModal(null)}>
            {t('common.close')}
          </Button>
        )}
      >
        {modal?.content || null}
      </Modal>
    </UiContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUi = () => {
  const value = useContext(UiContext);
  if (!value) {
    throw new Error('useUi must be used within UiProvider');
  }
  return value;
};
