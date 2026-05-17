const INTER = "'Inter', sans-serif";

export function LogoMark({ size = 32 }) {
  const s = size / 32;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      {/* Back diamond — offset 5px right, 4px down */}
      <polygon points="18,6 27,17 18,28 9,17" fill="#93a8f4" />
      {/* Front diamond — solid */}
      <polygon points="13,3 22,14 13,25 4,14" fill="#4361ee" />
    </svg>
  );
}

export function LogoFull({ markSize = 32 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <LogoMark size={markSize} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{
          fontFamily: INTER,
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: '2px',
          color: '#1a1a2e',
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
          color: '#6c757d',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          OFFERT AI
        </span>
      </div>
    </div>
  );
}
