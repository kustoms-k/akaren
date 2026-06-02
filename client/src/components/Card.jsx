const SURF   = '#ffffff';
const BORDER = '#ececef';

const SHADOWS = {
  default:  '0 1px 4px rgba(0,0,0,0.06)',
  elevated: '0 4px 16px rgba(0,0,0,0.10)',
  flat:     'none',
};

/**
 * Variants: default | elevated | flat
 * padding  – pass a number (px) or CSS string; default is none (children handle their own)
 * overflow – CSS overflow value; defaults to 'visible'
 */
export function Card({ children, variant = 'default', padding, overflow, style }) {
  return (
    <div style={{
      background: SURF,
      border: `1px solid ${BORDER}`,
      borderRadius: 12,
      boxShadow: SHADOWS[variant] ?? SHADOWS.default,
      overflow: overflow ?? 'visible',
      ...(padding != null ? { padding } : {}),
      ...style,
    }}>
      {children}
    </div>
  );
}
