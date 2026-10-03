import { createContext, useContext } from 'react';

export const ToastContext = createContext(() => {});

/** `const toast = useToast(); toast('Sparat')` or `toast('Något gick fel', 'error')`. */
export const useToast = () => useContext(ToastContext);
