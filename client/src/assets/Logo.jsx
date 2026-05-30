const FONT = "'Geist', system-ui, sans-serif";

// ── LogoMark ─────────────────────────────────────────────────────────────────
// Truck side-profile + forward route line.
// The mark works at 16 px (favicon) through 64 px.
// The route <path data-route> is stroke-dashoffset-animatable for splash / onboarding.

export function LogoMark({ size = 32, color = '#1a1d24', hubColor }) {
  const hub = hubColor ?? (color === '#ffffff' || color === 'white' ? '#1a1d24' : 'white');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {/* ── Truck body ──────────────────────────────────────────── */}

      {/* Trailer — long flat rectangle */}
      <rect x="1.5" y="10" width="18" height="8.5" rx="1.5" fill={color} />

      {/* Cab — taller, angular windshield suggests forward motion */}
      {/* Back edge x=18.5 overlaps trailer slightly for seamless junction */}
      <path
        d="M18.5 18.5 L18.5 7 L22.5 7 L28.5 13.5 L28.5 18.5 Z"
        fill={color}
      />

      {/* ── Wheels ──────────────────────────────────────────────── */}

      {/* Rear axle wheel */}
      <circle cx="7" cy="21.5" r="3.5" fill={color} />
      <circle cx="7" cy="21.5" r="1.75" fill={hub} />

      {/* Front axle wheel */}
      <circle cx="24" cy="21.5" r="3.5" fill={color} />
      <circle cx="24" cy="21.5" r="1.75" fill={hub} />

      {/* ── Route line ──────────────────────────────────────────── */}

      {/* Origin dot */}
      <circle cx="2" cy="28" r="1.75" fill={color} />

      {/* Route path — straight resolved line — animate via strokeDashoffset */}
      <path
        data-route
        d="M2 28 L24.5 28"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
      />

      {/* Forward chevron — destination / direction */}
      <path
        d="M22 25.5 L25.5 28 L22 30.5"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Destination dot */}
      <circle cx="28.5" cy="28" r="1.75" fill={color} />
    </svg>
  );
}

// ── LogoCompact ───────────────────────────────────────────────────────────────
// Mark + wordmark, no tagline — for headers and tight spaces.

export function LogoCompact({ markSize = 32, color = '#1a1d24', hubColor }) {
  const wordSize = Math.max(12, Math.round(markSize * 0.5));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(markSize * 0.35) }}>
      <LogoMark size={markSize} color={color} hubColor={hubColor} />
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
// Mark + wordmark + tagline — for sidebar, login, splash.

export function LogoFull({ markSize = 40, color = '#1a1d24', taglineColor, hubColor }) {
  const tagline = taglineColor ?? (
    color === '#ffffff' || color === 'white'
      ? 'rgba(255,255,255,0.45)'
      : '#9ca3af'
  );
  const wordSize  = Math.max(13, Math.round(markSize * 0.48));
  const tagSize   = Math.max(8,  Math.round(markSize * 0.22));
  const gap       = Math.round(markSize * 0.32);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <LogoMark size={markSize} color={color} hubColor={hubColor} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
          letterSpacing: '0.2em',
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
// Inverted variant — white mark + wordmark for dark backgrounds (PDFs, dark headers).

export function LogoWhite({ markSize = 32, hubColor = '#1a1d24', ...props }) {
  return (
    <LogoFull
      markSize={markSize}
      color="#ffffff"
      hubColor={hubColor}
      {...props}
    />
  );
}
