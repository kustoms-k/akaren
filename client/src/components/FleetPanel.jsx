import { useLanguage } from '../context/LanguageContext.jsx';

const AMBER   = '#c9921e';
const AMBER_DK= '#a87818';
const WHITE   = '#ffffff';
const BORDER  = '#cfc9bb';
const TEXT    = '#151210';
const MUTED   = '#6a6050';
const FAINT   = '#9a9082';
const OUTFIT  = "'Plus Jakarta Sans', system-ui, sans-serif";
const SURF    = '#f4f0e7';
const MONO    = "'DM Mono', monospace";

const EURO = {
  6: { label: 'E6', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
  5: { label: 'E5', color: '#B45309', bg: 'rgba(245,158,11,0.08)' },
  4: { label: 'E4', color: '#B91C1C', bg: 'rgba(239,68,68,0.08)' },
};

const fmtSEK = (n) =>
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n ?? 0);

function VehicleRow({ v }) {
  const badge = EURO[v.euro_klass] ?? EURO[4];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 0', borderBottom: `1px solid ${BORDER}`,
    }}>
      <span style={{
        fontFamily: OUTFIT, fontSize: 12, color: AMBER,
        fontWeight: 600, flexShrink: 0, minWidth: 54,
      }}>
        {v.id}
      </span>

      <span style={{
        fontFamily: OUTFIT, fontSize: 13, color: TEXT,
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {v.namn}
      </span>

      <span style={{
        fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase',
        color: badge.color, background: badge.bg,
        padding: '2px 6px', borderRadius: 4, flexShrink: 0,
      }}>
        {badge.label}
      </span>

      <span style={{
        fontFamily: MONO, fontSize: 12, color: MUTED,
        flexShrink: 0, textAlign: 'right', minWidth: 78,
      }}>
        {fmtSEK(v.timkostnad_sek)} kr/tim
      </span>

      {v.lez_godkänd && (
        <span style={{
          fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', color: '#16a34a', flexShrink: 0,
        }}>
          LEZ
        </span>
      )}
    </div>
  );
}

export function FleetPanel({ fleet }) {
  const { t } = useLanguage();
  if (fleet.length === 0) {
    return (
      <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, margin: 0, flexShrink: 0 }}>
        {t.fleetPanel.loading}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {fleet.map((v) => <VehicleRow key={v.id} v={v} />)}
    </div>
  );
}
