import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { S } from '../constants/strings.js';

const AMBER   = '#c9921e';
const AMBER_DK= '#a87818';
const BG      = '#edeae1';
const WHITE   = '#ffffff';
const BORDER  = '#cfc9bb';
const TEXT    = '#151210';
const MUTED   = '#6a6050';
const FAINT   = '#9a9082';
const OUTFIT  = "'Geist', system-ui, sans-serif";
const SURF    = '#f4f0e7';
const MONO    = "'Geist', system-ui, sans-serif";

const STATUS_META = {
  väntande: { label: 'Sparad',   color: MUTED,      bg: SURF,                        border: BORDER },
  skickad:  { label: 'Skickad',  color: '#1d6b45',  bg: 'rgba(29,107,69,0.08)',      border: 'rgba(29,107,69,0.25)' },
  godkänd:  { label: 'Godkänd', color: '#15803d',  bg: 'rgba(21,128,61,0.08)',      border: 'rgba(21,128,61,0.25)' },
  avböjd:   { label: 'Avböjd',  color: '#9f1239',  bg: 'rgba(159,18,57,0.07)',      border: 'rgba(159,18,57,0.25)' },
};

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
    <th style={{
      fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: MUTED, padding: '14px 0 10px',
      textAlign: i === 0 ? 'left' : 'right', width: COL_WIDTHS[i],
      borderBottom: `1px solid ${BORDER}`,
    }}>
      {children}
    </th>
  );
}

function Td({ children, bold, muted, right }) {
  return (
    <td style={{
      fontFamily: right ? MONO : OUTFIT,
      fontFeatureSettings: right ? '"tnum"' : undefined,
      fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 400,
      color: muted ? MUTED : TEXT,
      padding: '11px 0', textAlign: right ? 'right' : 'left',
    }}>
      {children}
    </td>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (!status || status === 'väntande') return null;
  const m = STATUS_META[status] ?? STATUS_META.väntande;
  return (
    <span style={{
      fontFamily: OUTFIT, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.04em', textTransform: 'uppercase',
      color: m.color, background: m.bg,
      border: `1px solid ${m.border}`,
      padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap',
    }}>
      {m.label}
    </span>
  );
}

// ── Email modal ───────────────────────────────────────────────────────────────
function EmailModal({ onSend, onClose, defaultEmail }) {
  const { t } = useLanguage();
  const [email,    setEmail]    = useState(defaultEmail ?? '');
  const [name,     setName]     = useState('');
  const [ccOwner,  setCcOwner]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const [err,      setErr]      = useState(null);

  async function handleSend(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setErr(null);
    try {
      await onSend({ to: email.trim(), customerName: name.trim(), ccOwner });
    } catch (ex) {
      setErr(ex.message);
      setSending(false);
    }
  }

  const inputStyle = {
    fontFamily: OUTFIT, fontSize: 13, color: TEXT,
    background: WHITE, border: `1px solid ${BORDER}`,
    borderRadius: 8, padding: '9px 14px',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(21,18,16,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form onSubmit={handleSend} style={{
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14,
        boxShadow: '0 8px 40px rgba(0,0,0,0.14)', padding: '28px 28px 24px',
        width: '100%', maxWidth: 400,
      }}>
        <div style={{ fontFamily: OUTFIT, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: FAINT, fontWeight: 600, marginBottom: 6 }}>
          {t.quoteCard.emailModal.label}
        </div>
        <div style={{ fontFamily: OUTFIT, fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 20 }}>
          {t.quoteCard.emailModal.heading}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, color: MUTED, display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {t.quoteCard.emailModal.emailLabel}
            </label>
            <input
              type="email" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={t.quoteCard.emailModal.emailHint}
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = AMBER; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }}
            />
          </div>

          <div>
            <label style={{ fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, color: MUTED, display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {t.quoteCard.emailModal.nameLabel}
            </label>
            <input
              type="text"
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t.quoteCard.emailModal.nameHint}
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = AMBER; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={ccOwner}
              onChange={(e) => setCcOwner(e.target.checked)}
              style={{ accentColor: AMBER, width: 14, height: 14 }}
            />
            <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
              {t.quoteCard.emailModal.ccLabel}
            </span>
          </label>
        </div>

        {err && (
          <div style={{
            fontFamily: OUTFIT, fontSize: 12, color: '#be123c',
            background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)',
            borderRadius: 7, padding: '8px 12px', marginTop: 14,
          }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            type="button" onClick={onClose} disabled={sending}
            style={{
              fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
              padding: '9px 18px', borderRadius: 8,
              border: `1px solid ${BORDER}`, background: WHITE, color: TEXT,
              cursor: 'pointer', flex: 1,
            }}
          >
            {t.quoteCard.emailModal.cancel}
          </button>
          <button
            type="submit" disabled={sending || !email.trim()}
            style={{
              fontFamily: OUTFIT, fontSize: 13, fontWeight: 700,
              padding: '9px 18px', borderRadius: 8,
              background: !email.trim() || sending ? '#ddd9d2' : AMBER,
              color: !email.trim() || sending ? MUTED : TEXT,
              border: 'none', cursor: !email.trim() || sending ? 'not-allowed' : 'pointer',
              flex: 1,
            }}
          >
            {sending ? t.quoteCard.emailModal.sending : t.quoteCard.emailModal.send}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main QuoteCard ─────────────────────────────────────────────────────────────
export function QuoteCard({
  data, quoteNumber, onSave, onExport, onEmailSend, saving,
  quoteStatus, savedCustomerEmail,
}) {
  const { company } = useAuth();
  const { t } = useLanguage();
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSent,      setEmailSent]      = useState(false);

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

  const isSaved     = Boolean(quoteNumber);
  const currentStatus = quoteStatus ?? (isSaved ? 'väntande' : null);

  async function handleEmailSend({ to, customerName, ccOwner }) {
    await onEmailSend({ to, customerName, ccOwner });
    setEmailSent(true);
    setShowEmailModal(false);
  }

  return (
    <div style={{ opacity: 0, animation: 'card-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards', animationDelay: '60ms' }}>
      <div style={{
        background: WHITE, border: `1px solid ${BORDER}`,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden', color: TEXT,
      }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="qcard-pad" style={{ paddingTop: 28, paddingBottom: 24, borderBottom: `1px solid ${BORDER}`, background: BG }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <p style={{ fontFamily: OUTFIT, fontSize: 22, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.01em' }}>
                  {t.quoteCard.heading}
                </p>
                {currentStatus && currentStatus !== 'väntande' && (
                  <StatusBadge status={currentStatus} />
                )}
              </div>
              <p style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, color: AMBER, margin: 0 }}>
                {company?.name ?? ''}
              </p>
              <p style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, margin: '3px 0 0' }}>
                {company?.org_nr ? `Org.nr ${company.org_nr}` : ''}
              </p>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontFamily: OUTFIT, fontSize: 15, fontWeight: 700, color: AMBER, margin: '0 0 10px' }}>
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

          {(data.upphämtning || data.leverans || data.datum) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 32px', marginTop: 22, paddingTop: 18, borderTop: `1px solid ${BORDER}` }}>
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

        {/* ── LEZ banner ──────────────────────────────────────── */}
        {lezVarning && (
          <div className="qcard-pad" style={{
            background: 'var(--lez-bg)', borderTop: '2px solid var(--accent-red)',
            borderBottom: '2px solid var(--accent-red)', padding: '12px 0',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
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
                <td colSpan={3} style={{
                  fontFamily: OUTFIT, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                  color: TEXT, padding: '16px 0 22px', borderTop: `2px solid ${TEXT}`,
                }}>
                  {S.quote.table.total.toUpperCase()}
                </td>
                <td style={{
                  fontFamily: MONO, fontFeatureSettings: '"tnum"', fontSize: 17, fontWeight: 700, color: TEXT,
                  fontFeatureSettings: '"tnum"',
                  padding: '16px 0 22px', textAlign: 'right', borderTop: `2px solid ${TEXT}`,
                }}>
                  {fmtSEK(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Tillstånd notice ─────────────────────────────────── */}
        {tillstandKravs && (
          <div className="qcard-pad" style={{ paddingTop: 0, paddingBottom: 20 }}>
            <div style={{
              background: 'var(--tillstand-bg)', border: '1px solid var(--accent-blue)',
              borderRadius: 6, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <p style={{ fontFamily: OUTFIT, fontSize: 12, color: 'var(--tillstand-text)', margin: 0, lineHeight: 1.5 }}>
                {S.quote.banners.tillstand}
              </p>
            </div>
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────── */}
        <div className="qcard-pad qcard-actions" style={{
          display: 'flex', gap: 8, paddingTop: 16, paddingBottom: 28,
          borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap',
        }}>
          {/* Save */}
          <button
            onClick={onSave} disabled={saving}
            style={{
              flex: '1 1 120px', fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
              background: AMBER, color: TEXT, border: 'none', borderRadius: 6,
              padding: '12px 16px', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.55 : 1, transition: 'opacity 0.15s',
            }}
          >
            {saving ? S.quote.saving : (isSaved ? t.quoteCard.savedBtn : S.quote.saveButton)}
          </button>

          {/* Export PDF */}
          <button
            onClick={onExport}
            style={{
              flex: '1 1 120px', fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
              background: WHITE, color: AMBER, border: `1px solid ${BORDER}`,
              borderRadius: 6, padding: '12px 16px', cursor: 'pointer',
            }}
          >
            {S.quote.exportButton}
          </button>

          {/* Email to customer — active only after save */}
          {onEmailSend && (
            <button
              onClick={() => setShowEmailModal(true)}
              disabled={!isSaved}
              title={!isSaved ? t.quoteCard.saveFirst : t.quoteCard.sendByEmail}
              style={{
                flex: '1 1 140px', fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
                background: emailSent || currentStatus === 'skickad'
                  ? 'rgba(29,107,69,0.08)'
                  : isSaved ? '#f4f0e7' : '#f0efeb',
                color: emailSent || currentStatus === 'skickad'
                  ? '#1d6b45'
                  : isSaved ? TEXT : FAINT,
                border: `1px solid ${emailSent || currentStatus === 'skickad' ? 'rgba(29,107,69,0.25)' : BORDER}`,
                borderRadius: 6, padding: '12px 16px',
                cursor: isSaved ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
              }}
            >
              {emailSent || currentStatus === 'skickad' ? t.quoteCard.sentBtn : t.quoteCard.sendBtn}
            </button>
          )}
        </div>

        {/* ── Status actions row (after save) ─────────────────── */}
        {isSaved && onEmailSend && (
          <div className="qcard-pad" style={{
            paddingBottom: 20, paddingTop: 0,
            display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: OUTFIT, fontSize: 11, color: FAINT, marginRight: 4 }}>
              {t.quoteCard.statusLabel}
            </span>
            {['godkänd', 'avböjd'].map((s) => {
              const m    = STATUS_META[s];
              const isActive = currentStatus === s;
              return (
                <button
                  key={s}
                  onClick={() => onEmailSend({ statusOnly: s })}
                  style={{
                    fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.03em', textTransform: 'uppercase',
                    padding: '4px 12px', borderRadius: 20,
                    color: isActive ? m.color : MUTED,
                    background: isActive ? m.bg : 'transparent',
                    border: `1px solid ${isActive ? m.border : BORDER}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showEmailModal && (
        <EmailModal
          defaultEmail={savedCustomerEmail ?? ''}
          onSend={handleEmailSend}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  );
}
