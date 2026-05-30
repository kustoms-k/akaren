import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { LogoMark } from '../assets/Logo.jsx';

const INTER = "'Geist', system-ui, sans-serif";
const SESSION_KEY = 'akaren_splash_v1';

// Total timeline: mark enters ~300ms, wordmark at 100ms delay, line at 250ms
// Hold begins at ~600ms → exit starts at 1600ms → done at 2050ms ≈ 2.2s total

export function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return 'skip';
    sessionStorage.setItem(SESSION_KEY, '1');
    return 'in';
  });

  useEffect(() => {
    if (phase === 'skip') { onDone(); return; }
    const t1 = setTimeout(() => setPhase('out'), 1600);
    const t2 = setTimeout(onDone, 2050);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase, onDone]);

  if (phase === 'skip') return null;

  const exiting = phase === 'out';

  return (
    <motion.div
      animate={exiting
        ? { opacity: 0, scale: 1.02 }
        : { opacity: 1, scale: 1 }}
      transition={exiting
        ? { duration: 0.4, ease: [0.4, 0, 1, 1] }
        : { duration: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#f4f5f7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* Logo mark — spring scale in */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <LogoMark size={52} />
      </motion.div>

      {/* Wordmark — fades and slides up 8px */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
        style={{ marginTop: 18 }}
      >
        <span style={{
          fontFamily: INTER,
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '0.18em',
          color: '#1a1d24',
          lineHeight: 1,
        }}>
          ÅKAREN
        </span>
      </motion.div>

      {/* Thin slate line — draws left to right */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, ease: [0.0, 0.0, 0.2, 1], delay: 0.25 }}
        style={{
          marginTop: 18,
          width: 40,
          height: 1,
          background: '#94a3b8',
          transformOrigin: 'left center',
        }}
      />
    </motion.div>
  );
}
