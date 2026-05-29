import { useEffect } from 'react';

const OUTFIT = "'Geist', system-ui, sans-serif";

const VARIANTS = {
  success: {
    bg:     '#f0fdf4',
    border: '#bbf7d0',
    text:   '#15803d',
    dot:    '#2ecc71',
  },
  warning: {
    bg:     '#fff7ed',
    border: '#fde68a',
    text:   '#d97706',
    dot:    '#f59e0b',
  },
  error: {
    bg:     '#fff0f0',
    border: '#fca5a5',
    text:   '#e74c3c',
    dot:    '#e74c3c',
  },
};

export function Toast({ message, variant = 'success', onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const v = VARIANTS[variant] ?? VARIANTS.success;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
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
        fontFamily: OUTFIT,
        fontSize: 13,
        fontWeight: 500,
        padding: '12px 16px',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        animation: 'toast-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        cursor: 'pointer',
        userSelect: 'none',
        maxWidth: 'min(480px, calc(100vw - 40px))',
        lineHeight: 1.5,
      }}
    >
      <span style={{
        display: 'inline-block', flexShrink: 0,
        width: 7, height: 7, marginTop: 4,
        borderRadius: '50%', background: v.dot,
      }} />
      {message}
    </div>
  );
}
