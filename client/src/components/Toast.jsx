import { useEffect } from 'react';
import { motion } from 'motion/react';

const INTER = "'Geist', system-ui, sans-serif";

const VARIANTS = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#2ecc71' },
  warning: { bg: '#fff7ed', border: '#fde68a', text: '#d97706', dot: '#f59e0b' },
  error:   { bg: '#fff0f0', border: '#fca5a5', text: '#e74c3c', dot: '#e74c3c' },
};

export function Toast({ message, variant = 'success', onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3200);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const v = VARIANTS[variant] ?? VARIANTS.success;

  return (
    <motion.div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      initial={{ x: 64, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 64, opacity: 0 }}
      transition={{
        type: 'spring',
        stiffness: 280,
        damping: 24,
      }}
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: v.bg,
        border: `1px solid ${v.border}`,
        color: v.text,
        fontFamily: INTER,
        fontSize: 13,
        fontWeight: 500,
        padding: '12px 16px',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        userSelect: 'none',
        maxWidth: 'min(380px, calc(100vw - 40px))',
        lineHeight: 1.5,
      }}
    >
      <span style={{
        display: 'inline-block', flexShrink: 0,
        width: 7, height: 7, marginTop: 4,
        borderRadius: '50%', background: v.dot,
      }} />
      {message}
    </motion.div>
  );
}
