const OUTFIT = "'Plus Jakarta Sans', system-ui, sans-serif";

export function LogoMark({ size = 32, glow = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        flexShrink: 0,
        overflow: 'visible',
        filter: glow
          ? 'drop-shadow(0 0 10px rgba(201,168,76,0.65)) drop-shadow(0 0 24px rgba(201,168,76,0.28))'
          : undefined,
      }}
    >
      <defs>
        <linearGradient id="lm-fg" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%"   stopColor="#e4c978" />
          <stop offset="40%"  stopColor="#c9a84c" />
          <stop offset="100%" stopColor="#8a6820" />
        </linearGradient>
        <linearGradient id="lm-bg" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%"   stopColor="#f0dfa0" />
          <stop offset="100%" stopColor="#d4b56a" />
        </linearGradient>
        <linearGradient id="lm-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#7a5a14" />
          <stop offset="100%" stopColor="#5a3e0a" />
        </linearGradient>
        <linearGradient id="lm-shine" x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.80)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <filter id="lm-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5"
            floodColor="#7a5a14" floodOpacity="0.48" />
        </filter>
      </defs>

      <polygon points="18,6 27,17 18,28 9,17" fill="url(#lm-bg)" opacity="0.75" />
      <polygon points="13,3 22,14 13,25 4,14" fill="url(#lm-fg)" filter="url(#lm-shadow)" />
      <polygon points="22,14 25.5,16.5 16.5,27 13,25" fill="url(#lm-side)" />
      <polygon points="4,14 8.5,8.5 13,3 17.5,8.5 13,14" fill="url(#lm-shine)" opacity="0.24" />
      <polyline points="4,14 13,3 22,14" stroke="rgba(255,255,255,0.68)" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="4" y1="14" x2="13" y2="25" stroke="rgba(255,255,255,0.14)" strokeWidth="0.7" />
    </svg>
  );
}

export function LogoFull({ markSize = 32, variant = 'dark' }) {
  const isLight = variant === 'light';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <LogoMark size={markSize} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{
          fontFamily: OUTFIT,
          fontWeight: 800,
          fontSize: Math.round(markSize * 0.58),
          letterSpacing: '0.14em',
          color: isLight ? '#ffffff' : '#17161a',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          ÅKAREN
        </span>
        <span style={{
          fontFamily: OUTFIT,
          fontWeight: 500,
          fontSize: Math.round(markSize * 0.26),
          letterSpacing: '0.22em',
          color: isLight ? 'rgba(255,255,255,0.40)' : '#a09aa8',
          lineHeight: 1,
          userSelect: 'none',
          textTransform: 'uppercase',
        }}>
          TRANSPORT AI
        </span>
      </div>
    </div>
  );
}
