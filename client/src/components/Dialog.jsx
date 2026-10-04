import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

/**
 * Modal dialog. Closes on Escape and backdrop click; focus moves into the dialog
 * on open and back to the previously focused element on close.
 * Rendered in a portal on <body>: a transformed ancestor (e.g. a page transition) would
 * otherwise become the containing block for position: fixed and push the dialog off-screen.
 */
export function Dialog({ open, onClose, title, description, children, footer, wide = false }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => {
      const first = panel.current?.querySelector('input, select, textarea, button');
      (first ?? panel.current)?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={panel}
            className={wide ? 'dialog dialog-wide' : 'dialog'}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="dialog-head">
              <h2 className="t-heading">{title}</h2>
              {description && <p className="t-muted" style={{ marginTop: 4, fontSize: 13 }}>{description}</p>}
            </div>
            <div className="dialog-body">{children}</div>
            {footer && <div className="dialog-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
