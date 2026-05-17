const INTER = "'Inter', sans-serif";

export function LogoMark({ size = 32, glow = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, overflow: 'visible', filter: glow ? 'drop-shadow(0 0 10px rgba(99,102,241,0.7)) drop-shadow(0 0 24px rgba(99,102,241,0.35))' : undefined }}
    >
      <defs>
        <linearGradient id="lm-fg" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%"   stopColor="#a5b4fc" />
          <stop offset="38%"  stopColor="#6366f1" />
          <stop offset="100%" stopColor="#3730a3" />
        </linearGradient>
        <linearGradient id="lm-bg" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%"   stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#a5b4fc" />
        </linearGradient>
        <linearGradient id="lm-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#2825a8" />
          <stop offset="100%" stopColor="#1e1b6e" />
        </linearGradient>
        <linearGradient id="lm-shine" x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.75)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <filter id="lm-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="4" stdDeviation="3"
            floodColor="#1e1b6e" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* Back diamond */}
      <polygon
        points="18,6 27,17 18,28 9,17"
        fill="url(#lm-bg)"
        opacity="0.80"
      />

      {/* Front diamond face */}
      <polygon
        points="13,3 22,14 13,25 4,14"
        fill="url(#lm-fg)"
        filter="url(#lm-shadow)"
      />

      {/* Right-side extrusion */}
      <polygon
        points="22,14 25.5,16.5 16.5,27 13,25"
        fill="url(#lm-side)"
      />

      {/* Shine on upper-left face */}
      <polygon
        points="4,14 8.5,8.5 13,3 17.5,8.5 13,14"
        fill="url(#lm-shine)"
        opacity="0.22"
      />

      {/* Specular highlight — top-left edges */}
      <polyline
        points="4,14 13,3 22,14"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Left edge */}
      <line
        x1="4" y1="14" x2="13" y2="25"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.7"
      />
      {/* Edge highlight on left face */}
      <line x1="8.5" y1="8.5" x2="13" y2="14"
        stroke="rgba(255,255,255,0.25)" strokeWidth="0.7" />
    </svg>
  );
}

export function LogoFull({ markSize = 32, variant = 'dark' }) {
  const isLight = variant === 'light';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <LogoMark size={markSize} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{
          fontFamily: INTER,
          fontWeight: 900,
          fontSize: 18,
          letterSpacing: '2.5px',
          color: isLight ? '#ffffff' : '#1a1a2e',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          ÅKAREN
        </span>
        <span style={{
          fontFamily: INTER,
          fontWeight: 500,
          fontSize: 8,
          letterSpacing: '3.5px',
          color: isLight ? 'rgba(255,255,255,0.50)' : '#6c757d',
          lineHeight: 1,
          userSelect: 'none',
          textTransform: 'uppercase',
        }}>
          OFFERT AI
        </span>
      </div>
    </div>
  );
}
