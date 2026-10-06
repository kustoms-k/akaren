import { motion } from 'motion/react';

// Colours and sizes come from the brand tokens (index.css, .btn-*); motion only adds the press feedback.

function Spinner({ size = 12 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 12 12"
      style={{ animation: 'spin 0.65s linear infinite', flexShrink: 0 }}
      aria-hidden
    >
      <circle cx="6" cy="6" r="4.5" fill="none" strokeWidth="1.5" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" fill="none" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

const SPINNER = { sm: 12, md: 13, lg: 14 };

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
  className = '',
  ...rest
}) {
  const isDisabled = disabled || loading;
  return (
    <motion.button
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className={`btn btn-${size in SPINNER ? size : 'md'} btn-${variant} ${className}`.trim()}
      style={{ opacity: isDisabled && !loading ? 0.45 : 1, ...style }}
      {...rest}
    >
      {loading && <Spinner size={SPINNER[size] ?? 13} />}
      {/* Wrapped so page translation (which replaces text nodes) can't break React updates. */}
      <span style={{ display: 'contents' }}>{children}</span>
    </motion.button>
  );
}
