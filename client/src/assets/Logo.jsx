const INTER = "'Inter', sans-serif";

// ── 3-D diamond mark ─────────────────────────────────────────────────────────
// Two rhombuses, front one extruded with a right-side face for depth.
// IDs are document-scoped in SVG; identical instances use the same defs (same colours).
export function LogoMark({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, overflow: 'visible' }}
    >
      <defs>
        {/* Front face — bright top-left to deep bottom-right */}
        <linearGradient id="lm-fg" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%"   stopColor="#8ba7ff" />
          <stop offset="45%"  stopColor="#4361ee" />
          <stop offset="100%" stopColor="#2840c0" />
        </linearGradient>
        {/* Back diamond — lighter periwinkle */}
        <linearGradient id="lm-bg" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%"   stopColor="#d4dcfd" />
          <stop offset="100%" stopColor="#8fa8f8" />
        </linearGradient>
        {/* Right extrusion face — darker, for depth */}
        <linearGradient id="lm-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#1e30a8" />
          <stop offset="100%" stopColor="#0f1f6e" />
        </linearGradient>
        {/* Drop shadow */}
        <filter id="lm-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5"
            floodColor="#0d1240" floodOpacity="0.38" />
        </filter>
      </defs>

      {/* Back diamond */}
      <polygon
        points="18,6 27,17 18,28 9,17"
        fill="url(#lm-bg)"
        opacity="0.88"
      />

      {/* Front diamond face */}
      <polygon
        points="13,3 22,14 13,25 4,14"
        fill="url(#lm-fg)"
        filter="url(#lm-shadow)"
      />

      {/* Right-side extrusion — gives the 3-D depth */}
      <polygon
        points="22,14 25,16 16,27 13,25"
        fill="url(#lm-side)"
      />

      {/* Specular highlight along top-left edges */}
      <polyline
        points="4,14 13,3 22,14"
        stroke="rgba(255,255,255,0.50)"
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Subtle inner glow on left face edge */}
      <line
        x1="4" y1="14" x2="13" y2="25"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="0.6"
      />
    </svg>
  );
}

// ── Full lockup: mark + wordmark + tagline ────────────────────────────────────
// variant="light" flips wordmark/tagline to white for dark backgrounds
export function LogoFull({ markSize = 32, variant = 'dark' }) {
  const isLight = variant === 'light';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <LogoMark size={markSize} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{
          fontFamily: INTER,
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: '2px',
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
          letterSpacing: '3px',
          color: isLight ? 'rgba(255,255,255,0.55)' : '#6c757d',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          OFFERT AI
        </span>
      </div>
    </div>
  );
}
