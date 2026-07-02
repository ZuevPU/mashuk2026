import { createContext, useContext, useState, ReactNode } from 'react';

interface ModalContextType {
  setModal: (modal: ReactNode | null) => void;
}

export const ModalContext = createContext<ModalContextType>({ setModal: () => {} });

export const useAppModal = () => useContext(ModalContext);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<ReactNode | null>(null);

  return (
    <ModalContext.Provider value={{ setModal }}>
      {children}
      {modal}
    </ModalContext.Provider>
  );
};
