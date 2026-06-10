import { createContext, useContext, useMemo, useState } from 'react';
import ToastViewport from '../ui/ToastViewport';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

const UiContext = createContext(null);

export const UiProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);

  const value = useMemo(() => ({
    toast: (title, tone = 'default') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current, { id, title, tone }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 3200);
    },
    openModal: (nextModal) => setModal(nextModal),
    closeModal: () => setModal(null),
  }), []);

  return (
    <UiContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} />
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
            Close
          </Button>
        )}
      >
        {modal?.content || null}
      </Modal>
    </UiContext.Provider>
  );
};

export const useUi = () => {
  const value = useContext(UiContext);
  if (!value) {
    throw new Error('useUi must be used within UiProvider');
  }
  return value;
};
