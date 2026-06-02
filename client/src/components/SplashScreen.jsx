import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useLanguage } from '../context/LanguageContext.jsx';

const FONT = "'Geist', system-ui, sans-serif";
const SESSION_KEY = 'akaren_splash_v3';

// Inline the mark so we can imperatively animate the route path
function SplashMark({ size = 64 }) {
  const routeRef = useRef(null);

  useEffect(() => {
    const path = routeRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    // Route draws after the mark springs in (~280ms)
    const timer = setTimeout(() => {
      path.animate(
        [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
        { duration: 600, easing: 'cubic-bezier(0,0,0.2,1)', fill: 'forwards' },
      );
    }, 280);
    return () => clearTimeout(timer);
  }, []);

  const c  = '#1a1d24';
  const sw = Math.max(1.5, size * 0.08);
  const r  = Math.max(2.5, size * 0.115);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <path
        ref={routeRef}
        d="M8 8 L8 24 L24 24"
        stroke={c}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r={r} stroke={c} strokeWidth={sw} />
      <circle cx="24" cy="24" r={r + 0.5} fill={c} />
    </svg>
  );
}

export function SplashScreen({ onDone }) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return 'skip';
    sessionStorage.setItem(SESSION_KEY, '1');
    return 'in';
  });

  useEffect(() => {
    if (phase === 'skip') { onDone(); return; }
    const t1 = setTimeout(() => setPhase('out'), 1900);
    const t2 = setTimeout(onDone, 2250);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase, onDone]);

  if (phase === 'skip') return null;

  const exiting = phase === 'out';

  return (
    <motion.div
      animate={exiting ? { opacity: 0, scale: 1.012 } : { opacity: 1, scale: 1 }}
      transition={exiting ? { duration: 0.36, ease: [0.4, 0, 1, 1] } : { duration: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#f4f5f7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* Mark springs in */}
      <motion.div
        initial={{ scale: 0.78, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20 }}
      >
        <SplashMark size={64} />
      </motion.div>

      {/* Wordmark */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.07 }}
        style={{ marginTop: 22 }}
      >
        <span style={{
          fontFamily: FONT, fontWeight: 600, fontSize: 21,
          letterSpacing: '-0.02em', color: '#1a1d24', lineHeight: 1,
        }}>
          Åkaren
        </span>
      </motion.div>

      {/* Tagline */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.38, ease: 'easeOut', delay: 0.18 }}
        style={{ marginTop: 5 }}
      >
        <span style={{
          fontFamily: FONT, fontWeight: 500, fontSize: 9,
          letterSpacing: '0.2em', color: '#9ca3af', lineHeight: 1,
          textTransform: 'uppercase',
        }}>
          {t.splashScreen.tagline}
        </span>
      </motion.div>

      {/* Decorative rule */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.42, ease: [0, 0, 0.2, 1], delay: 0.26 }}
        style={{
          marginTop: 28, width: 28, height: 1,
          background: '#cbd5e1', transformOrigin: 'left center',
        }}
      />
    </motion.div>
  );
}
