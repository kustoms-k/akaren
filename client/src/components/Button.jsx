/**
 * Button — single shared button component used on every page.
 *
 * Variants:
 *   primary   — dark fill (#1a1d24 bg, white text)
 *   secondary — white bg, border, dark text
 *   danger    — red-tinted bg, red text
 *   ghost     — no bg, muted text, border on hover
 *
 * Size:
 *   sm  — 12px font, 6/14px padding
 *   md  — 13px font, 9/18px padding  (default)
 *   lg  — 14px font, 11/22px padding
 */

const FONT = "'Geist', system-ui, sans-serif";

const VARIANT_STYLES = {
  primary: {
    background: '#1a1d24',
    color: '#ffffff',
    border: 'none',
  },
  secondary: {
    background: '#ffffff',
    color: '#1a1d24',
    border: '1px solid #ececef',
  },
  danger: {
    background: 'rgba(220,38,38,0.06)',
    color: '#dc2626',
    border: '1px solid rgba(220,38,38,0.22)',
  },
  ghost: {
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid #ececef',
  },
};

const SIZE_STYLES = {
  sm: { fontSize: 12, padding: '6px 14px', borderRadius: 8 },
  md: { fontSize: 13, padding: '9px 18px', borderRadius: 10 },
  lg: { fontSize: 14, padding: '11px 22px', borderRadius: 12 },
};

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  style,
  ...rest
}) {
  const v = VARIANT_STYLES[variant] ?? VARIANT_STYLES.primary;
  const s = SIZE_STYLES[size]    ?? SIZE_STYLES.md;

  return (
    <button
      disabled={disabled}
      style={{
        fontFamily: FONT,
        fontWeight: 600,
        letterSpacing: '0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.15s, box-shadow 0.15s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        whiteSpace: 'nowrap',
        ...v,
        ...s,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
