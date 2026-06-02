const INTER  = "'Geist', system-ui, sans-serif";
const ACCENT = '#2d3340';
const SURF   = '#ffffff';
const BORDER = '#ececef';
const TEXT_P = '#1a1d24';
const TEXT_S = '#6b7280';

const SIZES = {
  sm: { fontSize: 12, padding: '5px 12px',  borderRadius: 6 },
  md: { fontSize: 13, padding: '8px 16px',  borderRadius: 8 },
  lg: { fontSize: 14, padding: '10px 20px', borderRadius: 8 },
};

const VARIANTS = {
  primary:   { background: ACCENT,                  color: '#ffffff', border: 'none' },
  secondary: { background: SURF,                    color: TEXT_P,    border: `1px solid ${BORDER}` },
  danger:    { background: 'rgba(220,38,38,0.06)',  color: '#dc2626', border: '1px solid rgba(220,38,38,0.25)' },
  ghost:     { background: 'transparent',           color: TEXT_S,    border: `1px solid ${BORDER}` },
};

/**
 * variant – primary | secondary | danger | ghost
 * size    – sm | md (default) | lg
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  type = 'button',
  style,
  ...rest
}) {
  const sz = SIZES[size]    ?? SIZES.md;
  const vr = VARIANTS[variant] ?? VARIANTS.primary;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: INTER,
        fontWeight: variant === 'primary' ? 600 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        transition: 'opacity 150ms',
        lineHeight: 1.4,
        ...sz,
        background: vr.background,
        color: vr.color,
        border: vr.border,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
