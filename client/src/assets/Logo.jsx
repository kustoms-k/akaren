// Lasskoll brand marks.
//
// The mark: a load of soil on a truck bed, with a check through it. "Lass" + "koll": every load accounted for.
// Drawn on a 32×32 grid so it stays crisp from a 16 px favicon to a 64 px login header.

const FONT = 'var(--font-sans)';
const BRAND = { pine: '#1f4d3a', sand: '#e8dfc9' };

/** tone 'brand': pine tile, sand load. tone 'white': white tile, pine load (on pine or dark backgrounds). */
export function LogoMark({ size = 32, tone = 'brand', title = null }) {
  const tile = tone === 'white' ? '#ffffff' : BRAND.pine;
  const load = tone === 'white' ? BRAND.pine : BRAND.sand;
  const check = tone === 'white' ? '#ffffff' : BRAND.pine;
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, display: 'block' }} role={title ? 'img' : undefined} aria-label={title ?? undefined} aria-hidden={title ? undefined : true}
    >
      <rect width="32" height="32" rx="8" fill={tile} />
      {/* The load: a pile of soil */}
      <path d="M6.5 21.5C6.5 15.4 10.7 10.5 16 10.5C21.3 10.5 25.5 15.4 25.5 21.5Z" fill={load} />
      {/* The truck bed */}
      <rect x="4.5" y="22.75" width="23" height="2.75" rx="1.375" fill={load} />
      {/* The check */}
      <path d="M11.6 16.6L14.6 19.4L20.4 13.6" stroke={check} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The name, set in the brand's type: Geist bold, tight. */
export function Wordmark({ size = 18, color = 'var(--text-primary)' }) {
  return (
    <span style={{
      fontFamily: FONT, fontWeight: 700, fontSize: size, letterSpacing: '-0.035em', color, lineHeight: 1, userSelect: 'none',
    }}>
      Lasskoll
    </span>
  );
}

/** Mark + name: sidebars, top bars, tight spaces. */
export function LogoCompact({ markSize = 28, color = 'var(--text-primary)', tone = 'brand' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(markSize * 0.36) }}>
      <LogoMark size={markSize} tone={tone} />
      <Wordmark size={Math.max(14, Math.round(markSize * 0.62))} color={color} />
    </div>
  );
}

/** Mark + name + tagline: the login page and other brand moments. */
export function LogoFull({ markSize = 40, color = 'var(--text-primary)', taglineColor = 'var(--text-secondary)', tone = 'brand' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(markSize * 0.32) }}>
      <LogoMark size={markSize} tone={tone} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: Math.round(markSize * 0.12) }}>
        <Wordmark size={Math.max(16, Math.round(markSize * 0.56))} color={color} />
        <span style={{ fontFamily: FONT, fontWeight: 500, fontSize: Math.max(11, Math.round(markSize * 0.3)), color: taglineColor, lineHeight: 1.1 }}>
          Koll på varje lass
        </span>
      </div>
    </div>
  );
}

/** Inverted, for pine or dark backgrounds. */
export function LogoWhite({ markSize = 32, ...props }) {
  return <LogoFull markSize={markSize} color="#ffffff" taglineColor="rgba(255,255,255,0.72)" tone="white" {...props} />;
}
