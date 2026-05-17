import { useEffect, useState } from 'react';
import { LogoMark } from '../assets/Logo.jsx';

const INTER = "'Inter', sans-serif";

export function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('in'); // in → hold → out → done

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('out'),  1600);
    const t2 = setTimeout(() => { setPhase('done'); onDone(); }, 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  if (phase === 'done') return null;

  const fading = phase === 'out';

  return (
    <>
      <style>{`
        @keyframes markIn {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes wordIn {
          from { opacity: 0; transform: translateX(10px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes tagIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 0,
        opacity: fading ? 0 : 1,
        transition: fading ? 'opacity 0.55s ease' : 'none',
        pointerEvents: 'none',
      }}>
        {/* Mark + wordmark row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            animation: 'markIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>
            <LogoMark size={52} />
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            animation: 'wordIn 0.45s cubic-bezier(0.22,1,0.36,1) 0.15s both',
          }}>
            <span style={{
              fontFamily: INTER,
              fontWeight: 800,
              fontSize: 30,
              letterSpacing: '3px',
              color: '#1a1a2e',
              lineHeight: 1,
              userSelect: 'none',
            }}>
              ÅKAREN
            </span>
            <span style={{
              fontFamily: INTER,
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: '4px',
              color: '#6c757d',
              lineHeight: 1,
              userSelect: 'none',
              animation: 'tagIn 0.4s ease 0.4s both',
            }}>
              OFFERT AI
            </span>
          </div>
        </div>

        {/* Pulse bar */}
        <div style={{
          marginTop: 40,
          width: 36,
          height: 3,
          borderRadius: 2,
          background: '#e9ecef',
          overflow: 'hidden',
          animation: 'tagIn 0.3s ease 0.5s both',
        }}>
          <div style={{
            height: '100%',
            background: '#4361ee',
            borderRadius: 2,
            animation: 'fill 1s cubic-bezier(0.4,0,0.2,1) 0.5s both',
          }} />
          <style>{`
            @keyframes fill {
              from { width: 0%; }
              to   { width: 100%; }
            }
          `}</style>
        </div>
      </div>
    </>
  );
}
