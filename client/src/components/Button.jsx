import { motion } from 'motion/react';

const INTER  = "'Geist', system-ui, sans-serif";
const ACCENT = '#2d3340';
const SURF   = '#ffffff';
const BORDER = '#ececef';
const TEXT_P = '#1a1d24';
const TEXT_S = '#6b7280';

const SIZES = {
  sm: { fontSize: 12, padding: '5px 12px',  borderRadius: 6,  gap: 5 },
  md: { fontSize: 13, padding: '8px 16px',  borderRadius: 8,  gap: 6 },
  lg: { fontSize: 14, padding: '10px 20px', borderRadius: 10, gap: 7 },
};

const VARIANTS = {
  primary:   { background: ACCENT,                  color: '#ffffff', border: 'none' },
  secondary: { background: SURF,                    color: TEXT_P,    border: `1px solid ${BORDER}` },
  danger:    { background: 'rgba(220,38,38,0.06)',  color: '#dc2626', border: '1px solid rgba(220,38,38,0.25)' },
  ghost:     { background: 'transparent',           color: TEXT_S,    border: `1px solid ${BORDER}` },
};

const HOVER_OPACITY = { primary: 0.88, secondary: 1, danger: 1, ghost: 1 };
const HOVER_BG_OVERRIDE = {
  secondary: '#f4f5f7',
  ghost:     '#f4f5f7',
};

function Spinner({ size = 12 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 12 12"
      style={{ animation: 'spin 0.65s linear infinite', flexShrink: 0 }}
      aria-hidden
    >
      <circle
        cx="6" cy="6" r="4.5"
        fill="none" strokeWidth="1.5"
        stroke="currentColor" strokeOpacity="0.25"
      />
      <path
        d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5"
        fill="none" strokeWidth="1.5"
        stroke="currentColor" strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * variant – primary | secondary | danger | ghost
 * size    – sm | md (default) | lg
 * loading – shows spinner and disables interaction
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  style,
  ...rest
}) {
  const sz = SIZES[size]    ?? SIZES.md;
  const vr = VARIANTS[variant] ?? VARIANTS.primary;
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      whileHover={isDisabled ? undefined : {
        opacity: HOVER_OPACITY[variant] ?? 1,
        background: HOVER_BG_OVERRIDE[variant] ?? vr.background,
      }}
      transition={{ duration: 0.12 }}
      style={{
        fontFamily: INTER,
        fontWeight: variant === 'primary' ? 600 : 500,
        letterSpacing: variant === 'primary' ? '0.005em' : '0',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled && !loading ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: sz.gap,
        whiteSpace: 'nowrap',
        transition: 'opacity 150ms, background 150ms, border-color 150ms',
        lineHeight: 1.4,
        fontSize: sz.fontSize,
        padding: sz.padding,
        borderRadius: sz.borderRadius,
        background: vr.background,
        color: vr.color,
        border: vr.border,
        ...style,
      }}
      {...rest}
    >
      {loading && <Spinner size={sz.fontSize} />}
      {children}
    </motion.button>
  );
}
