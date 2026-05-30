import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

const FONT = "'Geist', system-ui, sans-serif";
const SESSION_KEY = 'akaren_splash_v2';

// Inline truck+route mark so the route <path> can be animated via Web Animations API
function SplashMark({ size = 56 }) {
  const routeRef = useRef(null);

  useEffect(() => {
    const path = routeRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    // Route draws after the spring settles (~320ms)
    const timer = setTimeout(() => {
      path.animate(
        [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
        { duration: 680, easing: 'cubic-bezier(0,0,0.2,1)', fill: 'forwards' },
      );
    }, 320);
    return () => clearTimeout(timer);
  }, []);

  const c = '#1a1d24';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect x="1.5" y="10" width="18" height="8.5" rx="1.5" fill={c} />
      <path d="M18.5 18.5 L18.5 7 L22.5 7 L28.5 13.5 L28.5 18.5 Z" fill={c} />
      <circle cx="7" cy="21.5" r="3.5" fill={c} />
      <circle cx="7" cy="21.5" r="1.75" fill="white" />
      <circle cx="24" cy="21.5" r="3.5" fill={c} />
      <circle cx="24" cy="21.5" r="1.75" fill="white" />
      <circle cx="2" cy="28" r="1.75" fill={c} />
      <path
        ref={routeRef}
        d="M2 28 L24.5 28"
        stroke={c}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M22 25.5 L25.5 28 L22 30.5"
        stroke={c}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="28.5" cy="28" r="1.75" fill={c} />
    </svg>
  );
}

export function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return 'skip';
    sessionStorage.setItem(SESSION_KEY, '1');
    return 'in';
  });

  useEffect(() => {
    if (phase === 'skip') { onDone(); return; }
    const t1 = setTimeout(() => setPhase('out'), 1900);
    const t2 = setTimeout(onDone, 2280);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase, onDone]);

  if (phase === 'skip') return null;

  const exiting = phase === 'out';

  return (
    <motion.div
      animate={exiting ? { opacity: 0, scale: 1.015 } : { opacity: 1, scale: 1 }}
      transition={exiting ? { duration: 0.38, ease: [0.4, 0, 1, 1] } : { duration: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#f4f5f7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* Truck mark — spring in */}
      <motion.div
        initial={{ scale: 0.82, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      >
        <SplashMark size={56} />
      </motion.div>

      {/* Wordmark */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.08 }}
        style={{ marginTop: 20 }}
      >
        <span style={{
          fontFamily: FONT, fontWeight: 600, fontSize: 20,
          letterSpacing: '-0.02em', color: '#1a1d24', lineHeight: 1,
        }}>
          Åkaren
        </span>
      </motion.div>

      {/* Tagline */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.2 }}
        style={{ marginTop: 5 }}
      >
        <span style={{
          fontFamily: FONT, fontWeight: 500, fontSize: 9,
          letterSpacing: '0.2em', color: '#9ca3af', lineHeight: 1,
          textTransform: 'uppercase',
        }}>
          Transportoptimering
        </span>
      </motion.div>

      {/* Decorative rule */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0, 0, 0.2, 1], delay: 0.28 }}
        style={{
          marginTop: 26, width: 32, height: 1,
          background: '#cbd5e1', transformOrigin: 'left center',
        }}
      />
    </motion.div>
  );
}
