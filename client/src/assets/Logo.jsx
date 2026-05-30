const FONT = "'Geist', system-ui, sans-serif";

// ── Mark geometry ─────────────────────────────────────────────────────────────
// Origin (open ring) at top-left → L-path → destination (filled dot) at bottom-right.
// The mark describes the product's core: point A to point B, optimised.
// Every path is stroke-based so strokeDashoffset animation works for splash/onboarding.

export function LogoMark({ size = 32, color = '#1a1d24' }) {
  const sw = Math.max(1.5, size * 0.08);      // stroke weight scales with size
  const r  = Math.max(2.5, size * 0.115);      // dot radius scales with size

  // Anchor points within a 32×32 viewBox
  const ox = 8, oy = 8;    // origin
  const dx = 24, dy = 24;  // destination

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {/* Route path: origin → corner → destination (animatable) */}
      <path
        data-route
        d={`M${ox} ${oy} L${ox} ${dy} L${dx} ${dy}`}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Origin — open ring (start) */}
      <circle cx={ox} cy={oy} r={r} stroke={color} strokeWidth={sw} />

      {/* Destination — filled dot (arrival) */}
      <circle cx={dx} cy={dy} r={r + 0.5} fill={color} />
    </svg>
  );
}

// ── LogoCompact ───────────────────────────────────────────────────────────────
// Mark + wordmark — for headers, sidebars, tight spaces.

export function LogoCompact({ markSize = 32, color = '#1a1d24' }) {
  const wordSize = Math.max(12, Math.round(markSize * 0.52));
  const gap      = Math.round(markSize * 0.36);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <LogoMark size={markSize} color={color} />
      <span style={{
        fontFamily: FONT,
        fontWeight: 600,
        fontSize: wordSize,
        letterSpacing: '-0.02em',
        color,
        lineHeight: 1,
        userSelect: 'none',
      }}>
        Åkaren
      </span>
    </div>
  );
}

// ── LogoFull ──────────────────────────────────────────────────────────────────
// Mark + wordmark + tagline — for login page, splash, marketing contexts.

export function LogoFull({ markSize = 40, color = '#1a1d24', taglineColor }) {
  const tagline  = taglineColor ?? (
    color === '#ffffff' || color === 'white'
      ? 'rgba(255,255,255,0.42)'
      : '#9ca3af'
  );
  const wordSize = Math.max(13, Math.round(markSize * 0.5));
  const tagSize  = Math.max(8,  Math.round(markSize * 0.215));
  const gap      = Math.round(markSize * 0.32);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <LogoMark size={markSize} color={color} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: wordSize,
          letterSpacing: '-0.02em',
          color,
          lineHeight: 1,
          userSelect: 'none',
        }}>
          Åkaren
        </span>
        <span style={{
          fontFamily: FONT,
          fontWeight: 500,
          fontSize: tagSize,
          letterSpacing: '0.18em',
          color: tagline,
          lineHeight: 1,
          userSelect: 'none',
          textTransform: 'uppercase',
        }}>
          Transportoptimering
        </span>
      </div>
    </div>
  );
}

// ── LogoWhite ─────────────────────────────────────────────────────────────────
// Inverted — white on dark backgrounds (PDF headers, dark hero panels).

export function LogoWhite({ markSize = 32, ...props }) {
  return <LogoFull markSize={markSize} color="#ffffff" {...props} />;
}
