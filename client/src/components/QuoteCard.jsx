import { useAuth } from '../context/AuthContext.jsx';

const AMBER   = '#c9921e';
const AMBER_DK= '#a87818';
const BG      = '#edeae1';
const WHITE   = '#ffffff';
const BORDER  = '#cfc9bb';
const TEXT    = '#151210';
const MUTED   = '#6a6050';
const FAINT   = '#9a9082';
const OUTFIT  = "'Outfit', system-ui, sans-serif";
const SURF    = '#f4f0e7';
const MONO    = "'DM Mono', monospace";

const fmtSEK = (n) =>
  new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(n ?? 0) + ' kr';

const fmtDate = (d) =>
  new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);

const COL_HEADS = [
  S.quote.table.beskrivning,
  S.quote.table.antal,
  S.quote.table.apris,
  S.quote.table.belopp,
];
const COL_WIDTHS = ['44%', '18%', '20%', '18%'];

function Th({ children, i }) {
  return (
    <th
      style={{
        fontFamily: OUTFIT,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: MUTED,
        padding: '14px 0 10px',
        textAlign: i === 0 ? 'left' : 'right',
        width: COL_WIDTHS[i],
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, bold, muted, right }) {
  return (
    <td
      style={{
        fontFamily: right ? MONO : OUTFIT,
        fontSize: bold ? 15 : 13,
        fontWeight: bold ? 700 : 400,
        color: muted ? MUTED : TEXT,
        padding: '11px 0',
        textAlign: right ? 'right' : 'left',
      }}
    >
      {children}
    </td>
  );
}

export function QuoteCard({ data, quoteNumber, onSave, onExport, saving }) {
  const { company } = useAuth();
  const today      = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 14);

  const bränsle       = data.bränsle_kostnad   ?? 0;
  const arbKost       = data.arbetstid_kostnad  ?? 0;
  const arbTim        = data.arbetstid_timmar   ?? 0;
  const total         = data.totalpris_sek      ?? 0;
  const avstand       = data.avstand_km         ?? 0;
  const transportKost = Math.max(0, total - bränsle - arbKost);
  const perKm         = avstand > 0 ? transportKost / avstand : 0;
  const perTim        = arbTim  > 0 ? arbKost / arbTim : 0;

  const tillstandKravs = data['tillstånd_krävs'] ?? data.tillstand_kravs ?? false;
  const lezVarning     = data.lez_varning ?? false;

  const rows = [
    {
      beskrivning: `${S.quote.lineItems.transport} — ${data.lasttyp ?? ''}${data.fordon_rekommenderat ? ` (${data.fordon_rekommenderat})` : ''}`,
      antal:  avstand > 0 ? `${avstand} km` : '1 st',
      apris:  avstand > 0 ? fmtSEK(perKm) + '/km' : '–',
      belopp: transportKost,
    },
    bränsle > 0 && {
      beskrivning: S.quote.lineItems.bränsle,
      antal:  '1 st',
      apris:  fmtSEK(bränsle),
      belopp: bränsle,
    },
    arbKost > 0 && {
      beskrivning: S.quote.lineItems.arbetstid,
      antal:  arbTim > 0 ? `${arbTim} tim` : '1 st',
      apris:  perTim > 0 ? fmtSEK(perTim) + '/tim' : '–',
      belopp: arbKost,
    },
  ].filter(Boolean);

  return (
    <div
      style={{
        opacity: 0,
        animation: 'card-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        animationDelay: '60ms',
      }}
    >
      <div
        style={{
          background: WHITE,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          color: TEXT,
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div
          className="qcard-pad"
          style={{ paddingTop: 28, paddingBottom: 24, borderBottom: `1px solid ${BORDER}`, background: BG }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            {/* Left: brand */}
            <div>
              <p
                style={{
                  fontFamily: OUTFIT,
                  fontSize: 22,
                  fontWeight: 700,
                  color: TEXT,
                  margin: '0 0 6px',
                  letterSpacing: '-0.01em',
                }}
              >
                Offert
              </p>
              <p style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, color: AMBER, margin: 0 }}>
                {company?.name ?? ''}
              </p>
              <p style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, margin: '3px 0 0' }}>
                {company?.org_nr ? `Org.nr ${company.org_nr}` : ''}
              </p>
            </div>

            {/* Right: number + dates */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p
                style={{
                  fontFamily: OUTFIT,
                  fontSize: 15,
                  fontWeight: 700,
                  color: AMBER,
                  margin: '0 0 10px',
                }}
              >
                {quoteNumber ?? S.quote.labels.draft}
              </p>
              <p style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, margin: '0 0 3px' }}>
                {S.quote.labels.issued}:&nbsp;&nbsp;&nbsp;&nbsp;{fmtDate(today)}
              </p>
              <p style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, margin: 0 }}>
                {S.quote.labels.validUntil}: {fmtDate(validUntil)}
              </p>
            </div>
          </div>

          {/* Route strip */}
          {(data.upphämtning || data.leverans || data.datum) && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px 32px',
                marginTop: 22,
                paddingTop: 18,
                borderTop: `1px solid ${BORDER}`,
              }}
            >
              {[
                { label: S.quote.labels.from,  val: data.upphämtning },
                { label: S.quote.labels.to,    val: data.leverans },
                { label: S.quote.labels.date,  val: data.datum },
              ].filter((f) => f.val).map(({ label, val }) => (
                <div key={label}>
                  <p style={{ fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: FAINT, margin: '0 0 3px' }}>
                    {label}
                  </p>
                  <p style={{ fontFamily: OUTFIT, fontSize: 13, color: TEXT, fontWeight: 500, margin: 0 }}>
                    {val}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── LEZ banner ─────────────────────────────────────── */}
        {lezVarning && (
          <div
            style={{
              background: 'var(--lez-bg)',
              borderTop: '2px solid var(--accent-red)',
              borderBottom: '2px solid var(--accent-red)',
              padding: '12px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
            className="qcard-pad"
          >
            <p style={{ fontFamily: OUTFIT, fontSize: 12, fontWeight: 600, color: 'var(--lez-text)', margin: 0 }}>
              {S.quote.banners.lez}
            </p>
          </div>
        )}

        {/* ── Line items table ────────────────────────────────── */}
        <div className="qcard-pad qcard-table-wrap" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
            <thead>
              <tr>
                {COL_HEADS.map((h, i) => <Th key={h} i={i}>{h}</Th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <Td>{row.beskrivning}</Td>
                  <Td right muted>{row.antal}</Td>
                  <Td right muted>{row.apris}</Td>
                  <Td right>{fmtSEK(row.belopp)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={3}
                  style={{
                    fontFamily: OUTFIT,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: TEXT,
                    padding: '16px 0 22px',
                    borderTop: `2px solid ${TEXT}`,
                  }}
                >
                  {S.quote.table.total.toUpperCase()}
                </td>
                <td
                  style={{
                    fontFamily: MONO,
                    fontSize: 17,
                    fontWeight: 700,
                    color: TEXT,
                    padding: '16px 0 22px',
                    textAlign: 'right',
                    borderTop: `2px solid ${TEXT}`,
                  }}
                >
                  {fmtSEK(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Tillstånd notice ─────────────────────────────────── */}
        {tillstandKravs && (
          <div className="qcard-pad" style={{ paddingTop: 0, paddingBottom: 20 }}>
            <div
              style={{
                background: 'var(--tillstand-bg)',
                border: '1px solid var(--accent-blue)',
                borderRadius: 6,
                padding: '10px 14px',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <p style={{ fontFamily: OUTFIT, fontSize: 12, color: 'var(--tillstand-text)', margin: 0, lineHeight: 1.5 }}>
                {S.quote.banners.tillstand}
              </p>
            </div>
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────── */}
        <div
          className="qcard-pad qcard-actions"
          style={{
            display: 'flex',
            gap: 10,
            paddingTop: 16,
            paddingBottom: 28,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              flex: 1,
              fontFamily: OUTFIT,
              fontSize: 13,
              fontWeight: 600,
              background: AMBER,
              color: TEXT,
              border: 'none',
              borderRadius: 6,
              padding: '12px 16px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.55 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {saving ? S.quote.saving : S.quote.saveButton}
          </button>

          <button
            onClick={onExport}
            style={{
              flex: 1,
              fontFamily: OUTFIT,
              fontSize: 13,
              fontWeight: 600,
              background: WHITE,
              color: AMBER,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: '12px 16px',
              cursor: 'pointer',
            }}
          >
            {S.quote.exportButton}
          </button>
        </div>
      </div>
    </div>
  );
}
