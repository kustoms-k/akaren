import { motion } from 'motion/react';

const BASE = {
  background: '#ffffff',
  border: '1px solid #ececef',
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
  overflow: 'hidden',
};

/**
 * Card — surface container used on every page.
 *
 * Props:
 *   hover   boolean  — enable y-lift on hover (default true)
 *   style   object   — merged with base styles
 *   children
 */
export function Card({ hover = true, style, children, ...rest }) {
  const merged = { ...BASE, ...style };

  if (!hover) {
    return <div style={merged} {...rest}>{children}</div>;
  }

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      style={merged}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * CardHeader — top strip with title + optional right slot.
 */
export function CardHeader({ title, right, style }) {
  return (
    <div style={{
      padding: '14px 20px',
      borderBottom: '1px solid #ececef',
      background: '#fafbfc',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
      ...style,
    }}>
      <span style={{
        fontFamily: "'Geist', system-ui, sans-serif",
        fontSize: 13, fontWeight: 600, color: '#1a1d24',
      }}>
        {title}
      </span>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
    </div>
  );
}

/**
 * CardBody — padded content area.
 */
export function CardBody({ children, style }) {
  return (
    <div style={{ padding: '20px', ...style }}>{children}</div>
  );
}
