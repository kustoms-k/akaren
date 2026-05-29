import { useEffect, useState } from 'react';
import { LogoMark } from '../assets/Logo.jsx';

const INTER = "'Geist', system-ui, sans-serif";

const NOISE_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.065'/%3E%3C/svg%3E")`;

export function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('in');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('out'), 1900);
    const t2 = setTimeout(() => { setPhase('done'); onDone(); }, 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  if (phase === 'done') return null;
  const fading = phase === 'out';

  return (
    <>
      <style>{`
        @keyframes splashMarkIn {
          from { opacity: 0; transform: scale(0.55) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes splashWordIn {
          from { opacity: 0; transform: translateX(18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes splashTagIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes splashFill {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes splashOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(25px, -35px) scale(1.08); }
        }
        @keyframes splashOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(-28px, 22px) scale(0.92); }
        }
        @keyframes splashOrb3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%       { transform: translate(18px, 28px) scale(1.1); }
        }
        @keyframes splashGlow {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 0.9; }
        }
        @keyframes splashGrid {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'linear-gradient(145deg, #060916 0%, #0c1340 38%, #131870 65%, #0a1450 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
        opacity: fading ? 0 : 1,
        transition: fading ? 'opacity 0.7s cubic-bezier(0.4,0,1,1)' : 'none',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}>

        {/* Noise grain */}
        <div style={{
          position: 'absolute', inset: 0, backgroundImage: NOISE_URI,
          backgroundSize: '200px 200px', opacity: 0.65, pointerEvents: 'none',
        }} />

        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `radial-gradient(circle, rgba(99,102,241,0.14) 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          animation: 'splashGrid 1.2s ease 0.3s both',
        }} />

        {/* Orb 1 — top right, indigo */}
        <div style={{
          position: 'absolute', top: '8%', right: '12%',
          width: 420, height: 420, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.30) 0%, transparent 68%)',
          filter: 'blur(48px)',
          animation: 'splashOrb1 9s ease-in-out infinite',
        }} />

        {/* Orb 2 — bottom left, violet */}
        <div style={{
          position: 'absolute', bottom: '10%', left: '8%',
          width: 340, height: 340, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 68%)',
          filter: 'blur(55px)',
          animation: 'splashOrb2 11s ease-in-out infinite',
        }} />

        {/* Orb 3 — center-right, cyan */}
        <div style={{
          position: 'absolute', top: '42%', right: '4%',
          width: 220, height: 220, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.16) 0%, transparent 68%)',
          filter: 'blur(32px)',
          animation: 'splashOrb3 7.5s ease-in-out infinite',
        }} />

        {/* Logo center glow */}
        <div style={{
          position: 'absolute',
          width: 240, height: 240, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.40) 0%, transparent 68%)',
          filter: 'blur(40px)',
          animation: 'splashGlow 2.2s ease-in-out infinite',
        }} />

        {/* Mark + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative', zIndex: 1 }}>
          <div style={{
            animation: 'splashMarkIn 0.65s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>
            <LogoMark size={68} glow />
          </div>

          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            animation: 'splashWordIn 0.55s cubic-bezier(0.22,1,0.36,1) 0.2s both',
          }}>
            <span style={{
              fontFamily: INTER, fontWeight: 900, fontSize: 40,
              letterSpacing: '5px', color: '#ffffff', lineHeight: 1,
              userSelect: 'none',
              textShadow: '0 0 40px rgba(99,102,241,0.7), 0 0 80px rgba(99,102,241,0.35)',
            }}>
              ÅKAREN
            </span>
            <span style={{
              fontFamily: INTER, fontWeight: 500, fontSize: 10,
              letterSpacing: '6px', color: 'rgba(255,255,255,0.42)', lineHeight: 1,
              userSelect: 'none', textTransform: 'uppercase',
              animation: 'splashTagIn 0.45s ease 0.45s both',
            }}>
              TRANSPORT TMS
            </span>
          </div>
        </div>

        {/* Gradient progress bar */}
        <div style={{
          position: 'relative', zIndex: 1,
          marginTop: 56, width: 52, height: 2, borderRadius: 2,
          background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
          animation: 'splashTagIn 0.3s ease 0.55s both',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: 'linear-gradient(90deg, #6366f1, #a78bfa, #06b6d4)',
            animation: 'splashFill 1.5s cubic-bezier(0.4,0,0.2,1) 0.55s both',
            boxShadow: '0 0 12px rgba(99,102,241,0.9)',
          }} />
        </div>
      </div>
    </>
  );
}
