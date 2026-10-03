import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ToastContext } from '../lib/toast.js';

const VARIANTS = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#22c55e' },
  warning: { bg: '#fff7ed', border: '#fde68a', text: '#b45309', dot: '#f59e0b' },
  error:   { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', dot: '#ef4444' },
};

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const show = useCallback((message, variant = 'success') => setToast({ message, variant, key: Date.now() }), []);
  const dismiss = useCallback(() => setToast(null), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <AnimatePresence>
        {toast && <Toast key={toast.key} message={toast.message} variant={toast.variant} onDismiss={dismiss} />}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

function Toast({ message, variant, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, variant === 'error' ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [onDismiss, variant]);

  const v = VARIANTS[variant] ?? VARIANTS.success;
  return (
    <motion.div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      onClick={onDismiss}
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -8, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      style={{
        position: 'fixed', top: 16, right: 16, zIndex: 9999,
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: v.bg, border: `1px solid ${v.border}`, color: v.text,
        fontSize: 13, fontWeight: 500, padding: '12px 16px', borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'pointer', maxWidth: 'min(400px, calc(100vw - 32px))', lineHeight: 1.5,
      }}
    >
      <span style={{ width: 7, height: 7, marginTop: 6, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />
      {message}
    </motion.div>
  );
}
