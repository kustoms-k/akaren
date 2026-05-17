import { useState, useEffect, useRef } from 'react';
import { COMPANY as COMPANY_INFO } from '../constants/company.js';

const INTER = "'Inter', sans-serif";
const BLUE  = '#4361ee';
const BLUE_DK = '#3451d1';
const BG    = '#f7f6f3';
const WHITE = '#ffffff';
const TEXT  = '#1a1a18';
const MUTED = '#9b9890';
const BDR   = '#e8e6e1';
const BDR2  = '#f0efe9';

const COMPANY_NAME = COMPANY_INFO.name;

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtSEK = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

const fmtKm = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' km';

function fmtTs(str) {
  if (!str) return '';
  try {
    const d   = new Date(str.replace(' ', 'T'));
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
      + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function fmtDate(str) {
  if (!str) return '';
  try {
    const d = new Date(str.replace(' ', 'T'));
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return str; }
}

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_MAP = {
  väntande:  { label: 'Väntande / Pending',   color: '#92400E', bg: '#FFFBEB', bdr: 'rgba(245,158,11,0.35)' },
  godkänd:   { label: 'Godkänd / Accepted',   color: '#14532D', bg: '#F0FDF4', bdr: 'rgba(34,197,94,0.3)'  },
  avböjd:    { label: 'Avböjd / Declined',    color: '#991B1B', bg: '#FEF2F2', bdr: 'rgba(239,68,68,0.3)'  },
  avslutad:  { label: 'Avslutad / Completed', color: '#14532D', bg: '#F0FDF4', bdr: 'rgba(34,197,94,0.3)'  },
  fakturerad:{ label: 'Fakturerad / Invoiced', color: '#1e3a5f', bg: '#EFF6FF', bdr: 'rgba(59,130,246,0.3)' },
};

function StatusBadge({ status, small }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.väntande;
  return (
    <span style={{
      fontFamily: INTER,
      fontSize:   small ? '0.5rem' : '0.5625rem',
      letterSpacing: '0.06em',
      fontWeight: 500,
      color:      s.color,
      background: s.bg,
      border:     `1px solid ${s.bdr}`,
      borderRadius: 3,
      padding:    small ? '1px 5px' : '2px 7px',
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

// ─── Counter-offer status ─────────────────────────────────────────────────────
const CO_MAP = {
  pending:  { label: 'Under behandling / Under review', color: '#92400E', bg: '#FFFBEB', dot: '#f59e0b' },
  accepted: { label: 'Accepterat / Accepted',            color: '#14532D', bg: '#F0FDF4', dot: '#16a34a' },
  declined: { label: 'Avböjt / Declined',                color: '#991B1B', bg: '#FEF2F2', dot: '#dc2626' },
  revised:  { label: 'Reviderat pris / Revised price',  color: '#1e3a5f', bg: '#EFF6FF', dot: '#3b82f6' },
};

// ─── Shell & Card primitives ──────────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: BG,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', padding: '32px 16px 80px',
      boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {children}
      </div>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: WHITE, border: `1px solid ${BDR}`,
      borderRadius: 8, overflow: 'hidden', ...style,
    }}>
      {children}
    </div>
  );
}

function SectionHead({ title, count }) {
  return (
    <div style={{
      padding: '18px 24px 14px', borderBottom: `1px solid ${BDR}`,
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    }}>
      <p style={{ fontFamily: INTER, fontSize: 17, color: TEXT, margin: 0, letterSpacing: '0.02em' }}>
        {title}
      </p>
      {count != null && (
        <span style={{ fontFamily: INTER, fontSize: '0.5625rem', color: MUTED, letterSpacing: '0.06em' }}>
          {count}
        </span>
      )}
    </div>
  );
}

function FieldRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline',
      justifyContent: 'space-between', gap: 16,
      padding: '10px 0', borderBottom: `1px solid ${BDR2}`,
    }}>
      <span style={{ fontFamily: INTER, fontSize: '0.6875rem', letterSpacing: '0.06em', color: MUTED, flexShrink: 0, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ fontFamily: INTER, fontSize: '0.875rem', color: TEXT, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Loading / error screens ──────────────────────────────────────────────────
function Loading() {
  return (
    <Shell>
      <Card style={{ padding: 32 }}>
        <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: MUTED, margin: 0, textAlign: 'center' }}>
          Laddar offert…
        </p>
      </Card>
    </Shell>
  );
}

function NotFound() {
  return (
    <Shell>
      <Card style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ fontFamily: INTER, fontSize: 24, color: TEXT, margin: '0 0 12px' }}>Offerten hittades inte</p>
        <p style={{ fontFamily: INTER, fontSize: '0.9375rem', color: MUTED, margin: 0, lineHeight: 1.6 }}>
          Länken är ogiltig eller har gått ut. Kontakta oss om du behöver hjälp.
        </p>
      </Card>
    </Shell>
  );
}

// ─── Confirmation screens ─────────────────────────────────────────────────────
function Accepted({ formattedId }) {
  return (
    <Shell>
      <Card style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 14L11.5 19.5L22 9" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p style={{ fontFamily: INTER, fontSize: 26, color: TEXT, margin: '0 0 10px', letterSpacing: '0.02em' }}>Offert godkänd</p>
        <p style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, margin: '0 0 20px', letterSpacing: '0.08em' }}>{formattedId}</p>
        <p style={{ fontFamily: INTER, fontSize: '0.9375rem', color: '#3a3a36', margin: 0, lineHeight: 1.7 }}>
          Tack! Din godkännande har registrerats. Vi återkommer med en orderbekräftelse och uppdrag inom kort.
        </p>
        <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${BDR}` }}>
          <p style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, margin: 0, letterSpacing: '0.06em' }}>{COMPANY_NAME}</p>
        </div>
      </Card>
    </Shell>
  );
}

function Declined({ formattedId }) {
  return (
    <Shell>
      <Card style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 5L19 19M19 5L5 19" stroke="#b91c1c" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <p style={{ fontFamily: INTER, fontSize: 26, color: TEXT, margin: '0 0 10px', letterSpacing: '0.02em' }}>Offert avböjd</p>
        <p style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, margin: '0 0 20px', letterSpacing: '0.08em' }}>{formattedId}</p>
        <p style={{ fontFamily: INTER, fontSize: '0.9375rem', color: '#3a3a36', margin: 0, lineHeight: 1.7 }}>
          Vi har noterat att du avböjt offerten. Hör gärna av dig om du har frågor.
        </p>
        <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${BDR}` }}>
          <p style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, margin: 0, letterSpacing: '0.06em' }}>{COMPANY_NAME}</p>
        </div>
      </Card>
    </Shell>
  );
}

// ─── History section ──────────────────────────────────────────────────────────
function HistoryCard({ history }) {
  if (!history?.length) return null;
  return (
    <Card style={{ marginTop: 16 }}>
      <SectionHead title={`Er historik med ${COMPANY_NAME} / Your history`} count={`${history.length} offert${history.length !== 1 ? 'er' : ''}`} />
      <div>
        {history.map((h, i) => (
          <div key={h.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '12px 24px',
            borderBottom: i < history.length - 1 ? `1px solid ${BDR2}` : 'none',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: INTER, fontSize: '0.8125rem', color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.lasttyp ?? '—'}
              </div>
              <div style={{ fontFamily: INTER, fontSize: '0.5625rem', color: MUTED, marginTop: 2 }}>
                {fmtDate(h.created_at)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
              <span style={{ fontFamily: INTER, fontSize: '0.875rem', fontWeight: 600, color: BLUE }}>
                {fmtSEK(h.totalpris_sek)}
              </span>
              <StatusBadge status={h.status ?? 'väntande'} small />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Message thread ───────────────────────────────────────────────────────────
function MessageThread({ messages, onSend }) {
  const [text,    setText]    = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <SectionHead title="Frågor / Ask a question" />

      {/* Thread */}
      {messages.length > 0 && (
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 360, overflowY: 'auto' }}>
          {messages.map((m) => {
            const isCustomer = m.sender === 'customer';
            return (
              <div key={m.id} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: isCustomer ? 'flex-end' : 'flex-start', gap: 4,
              }}>
                <div style={{
                  maxWidth: '82%',
                  background:   isCustomer ? BLUE              : '#f0f2f5',
                  color:        isCustomer ? '#ffffff'          : '#1a1a2e',
                  borderRadius: isCustomer ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  padding: '10px 14px',
                  fontFamily: INTER, fontSize: '0.9rem', lineHeight: 1.5,
                }}>
                  {m.message}
                </div>
                <span style={{ fontFamily: INTER, fontSize: '0.5rem', color: MUTED, letterSpacing: '0.04em' }}>
                  {isCustomer ? 'Du / You' : COMPANY_NAME} · {fmtTs(m.created_at)}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '16px 24px 24px', borderTop: messages.length > 0 ? `1px solid ${BDR}` : 'none' }}>
        {messages.length === 0 && (
          <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>
            Har du frågor om offerten? Skriv ett meddelande så svarar vi så snart vi kan.
          </p>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
          rows={3}
          placeholder="Skriv din fråga här… / Type your question here…"
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            fontFamily: INTER, fontSize: '0.9375rem', color: TEXT,
            background: BG, border: `1px solid ${BDR}`, borderRadius: 6,
            padding: '10px 12px', outline: 'none',
            transition: 'border-color 0.15s',
          }}
        />
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: INTER, fontSize: '0.5rem', color: MUTED }}>
            {sent ? '✓ Meddelande skickat / Message sent' : 'Ctrl+Enter för att skicka / Ctrl+Enter to send'}
          </span>
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            style={{
              fontFamily: INTER, fontSize: '0.75rem', fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              background: text.trim() && !sending ? BLUE : '#e9ecef',
              color:      text.trim() && !sending ? '#ffffff' : MUTED,
              border: 'none', borderRadius: 5,
              padding: '9px 20px', cursor: text.trim() && !sending ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            {sending ? '…' : 'Skicka / Send'}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── Counter-offer section ────────────────────────────────────────────────────
function CounterOfferCard({ quote, counterOffers, onSubmit }) {
  const [open,    setOpen]    = useState(false);
  const [price,   setPrice]   = useState('');
  const [note,    setNote]    = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);

  // Most recent counter-offer
  const latest = counterOffers[0] ?? null;

  async function handleSubmit() {
    const p = Number(price);
    if (!p || p <= 0 || sending) return;
    setSending(true);
    try {
      await onSubmit(p, note.trim() || null);
      setDone(true);
      setOpen(false);
    } finally {
      setSending(false);
    }
  }

  // If dispatcher has responded 'revised', show the revised price prominently
  if (latest?.status === 'revised') {
    return (
      <Card style={{ marginTop: 16 }}>
        <SectionHead title="Motbud / Counter-offer" />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', color: CO_MAP.revised.color, background: CO_MAP.revised.bg, border: `1px solid rgba(59,130,246,0.25)`, borderRadius: 4, padding: '8px 12px', marginBottom: 16 }}>
            {CO_MAP.revised.label}
          </div>
          <p style={{ fontFamily: INTER, fontSize: '0.9375rem', color: TEXT, margin: '0 0 8px', lineHeight: 1.5 }}>
            {COMPANY_NAME} har föreslagit ett reviderat pris / has proposed a revised price:
          </p>
          <div style={{ fontFamily: INTER, fontSize: '1.5rem', fontWeight: 700, color: BLUE, margin: '8px 0' }}>
            {fmtSEK(latest.revised_price_sek)}
          </div>
          {latest.dispatcher_note && (
            <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: '#3a3a36', margin: '8px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
              "{latest.dispatcher_note}"
            </p>
          )}
          <p style={{ fontFamily: INTER, fontSize: '0.5625rem', color: MUTED, margin: '16px 0 0', lineHeight: 1.6 }}>
            Vill du acceptera? Klicka på "Godkänn offert" ovan för att bekräfta det reviderade priset. / To accept, click "Accept quote" above.
          </p>
        </div>
      </Card>
    );
  }

  if (latest?.status === 'accepted') {
    return (
      <Card style={{ marginTop: 16 }}>
        <SectionHead title="Motbud / Counter-offer" />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', color: CO_MAP.accepted.color, background: CO_MAP.accepted.bg, border: `1px solid rgba(34,197,94,0.25)`, borderRadius: 4, padding: '8px 12px', marginBottom: 12 }}>
            {CO_MAP.accepted.label}
          </div>
          <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: TEXT, margin: 0, lineHeight: 1.5 }}>
            Ditt motbud på {fmtSEK(latest.proposed_price_sek)} har accepterats. Uppdraget är bekräftat. / Your counter-offer of {fmtSEK(latest.proposed_price_sek)} has been accepted.
          </p>
        </div>
      </Card>
    );
  }

  if (latest?.status === 'declined') {
    return (
      <Card style={{ marginTop: 16 }}>
        <SectionHead title="Motbud / Counter-offer" />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', color: CO_MAP.declined.color, background: CO_MAP.declined.bg, border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 4, padding: '8px 12px', marginBottom: 12 }}>
            {CO_MAP.declined.label}
          </div>
          <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: TEXT, margin: 0, lineHeight: 1.5 }}>
            {latest.dispatcher_note
              ? `"${latest.dispatcher_note}"`
              : 'Det ursprungliga priset gäller. Du kan fortfarande godkänna eller avböja offerten ovan. / The original price stands.'}
          </p>
        </div>
      </Card>
    );
  }

  if (latest?.status === 'pending' || done) {
    return (
      <Card style={{ marginTop: 16 }}>
        <SectionHead title="Motbud / Counter-offer" />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', color: CO_MAP.pending.color, background: CO_MAP.pending.bg, border: `1px solid rgba(245,158,11,0.25)`, borderRadius: 4, padding: '8px 12px', marginBottom: 12 }}>
            {CO_MAP.pending.label}
          </div>
          <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: TEXT, margin: 0, lineHeight: 1.5 }}>
            Ditt motbud på {fmtSEK(latest?.proposed_price_sek)} är under behandling. Vi återkommer snart. / Your counter-offer is under review.
          </p>
        </div>
      </Card>
    );
  }

  // No counter-offer yet — show button / form
  return (
    <Card style={{ marginTop: 16 }}>
      <SectionHead title="Motbud / Counter-offer" />
      <div style={{ padding: '16px 24px 24px' }}>
        {!open ? (
          <>
            <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: '#3a3a36', margin: '0 0 16px', lineHeight: 1.5 }}>
              Vill du föreslå ett annat pris? Du kan lämna ett motbud med en anledning, så granskar vi det. / Want to propose a different price? Submit a counter-offer with your reason.
            </p>
            <button
              onClick={() => setOpen(true)}
              style={{
                fontFamily: INTER, fontSize: '0.75rem', fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                background: BLUE, color: WHITE, border: 'none',
                borderRadius: 6, padding: '10px 20px', cursor: 'pointer',
              }}
            >
              Lämna motbud / Submit counter-offer
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: 5 }}>
                Föreslagen summa / Proposed price (kr) *
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={`${Math.round((quote.totalpris_sek ?? 0) * 0.9)}`}
                  min={1}
                  style={{
                    flex: 1, fontFamily: INTER, fontSize: '0.9375rem', color: TEXT,
                    background: BG, border: `1px solid ${BDR}`, borderRadius: 5,
                    padding: '9px 12px', outline: 'none',
                  }}
                />
                <span style={{ fontFamily: INTER, fontSize: '0.875rem', color: MUTED }}>kr</span>
              </div>
            </label>
            <label>
              <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: 5 }}>
                Anledning / Reason (valfritt / optional)
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Beskriv varför du föreslår detta pris… / Describe why you're proposing this price…"
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical',
                  fontFamily: INTER, fontSize: '0.875rem', color: TEXT,
                  background: BG, border: `1px solid ${BDR}`, borderRadius: 5,
                  padding: '9px 12px', outline: 'none',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  fontFamily: INTER, fontSize: '0.75rem', padding: '9px 16px',
                  border: `1px solid ${BDR}`, borderRadius: 5,
                  background: WHITE, color: MUTED, cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
              <button
                onClick={handleSubmit}
                disabled={!Number(price) || Number(price) <= 0 || sending}
                style={{
                  flex: 1, fontFamily: INTER, fontSize: '0.75rem', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  background: Number(price) > 0 && !sending ? BLUE : '#e9ecef',
                  color:      Number(price) > 0 && !sending ? WHITE : MUTED,
                  border: 'none', borderRadius: 5,
                  padding: '9px 16px', cursor: Number(price) > 0 && !sending ? 'pointer' : 'not-allowed',
                }}
              >
                {sending ? '…' : 'Skicka motbud / Submit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Main portal ──────────────────────────────────────────────────────────────
const FIELDS = [
  { key: 'lasttyp',     label: 'Lasttyp'    },
  { key: 'upphämtning', label: 'Upphämtning' },
  { key: 'leverans',    label: 'Leverans'   },
  { key: 'datum',       label: 'Datum'      },
  { key: 'fordon_id',   label: 'Fordon'     },
  { key: 'avstand_km',  label: 'Avstånd', fmt: fmtKm },
];

export function PublicQuote({ token }) {
  const [phase,         setPhase]         = useState('loading');
  const [quote,         setQuote]         = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [counterOffers, setCounterOffers] = useState([]);
  const [history,       setHistory]       = useState([]);
  const [working,       setWorking]       = useState(false);

  function loadQuote() {
    return fetch(`/api/public/quote/${token}`)
      .then((r) => {
        if (r.status === 404) throw Object.assign(new Error(), { code: 404 });
        if (!r.ok)            throw Object.assign(new Error(), { code: r.status });
        return r.json();
      })
      .then((q) => {
        setQuote(q);
        setMessages(q.messages  ?? []);
        setCounterOffers(q.counterOffers ?? []);
        setHistory(q.history    ?? []);
        if      (q.status === 'godkänd') setPhase('accepted');
        else if (q.status === 'avböjd')  setPhase('declined');
        else                             setPhase('ready');
      })
      .catch((e) => setPhase(e.code === 404 ? 'not-found' : 'error'));
  }

  useEffect(() => { loadQuote(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAccept() {
    if (working) return;
    setWorking(true);
    try {
      const r = await fetch(`/api/public/quote/${token}/accept`, { method: 'POST' });
      if (r.ok) { await loadQuote(); setPhase('accepted'); }
      else setPhase('error');
    } finally { setWorking(false); }
  }

  async function handleDecline() {
    if (working) return;
    setWorking(true);
    try {
      const r = await fetch(`/api/public/quote/${token}/decline`, { method: 'POST' });
      if (r.ok) setPhase('declined');
      else setPhase('error');
    } finally { setWorking(false); }
  }

  async function handleSendMessage(text) {
    const r = await fetch(`/api/public/quote/${token}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    if (!r.ok) throw new Error('send failed');
    const msg = await r.json();
    setMessages((prev) => [...prev, msg]);
  }

  async function handleCounterOffer(proposed_price_sek, note) {
    const r = await fetch(`/api/public/quote/${token}/counter-offer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposed_price_sek, note }),
    });
    if (!r.ok) throw new Error('counter-offer failed');
    const co = await r.json();
    setCounterOffers([{ ...co, proposed_price_sek, note, created_at: new Date().toISOString() }]);
  }

  if (phase === 'loading')   return <Loading />;
  if (phase === 'not-found') return <NotFound />;
  if (phase === 'accepted')  return <Accepted formattedId={quote?.formattedId} />;
  if (phase === 'declined')  return <Declined formattedId={quote?.formattedId} />;
  if (phase === 'error') {
    return (
      <Shell>
        <Card style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ fontFamily: INTER, fontSize: '0.9375rem', color: '#b91c1c', margin: 0 }}>
            Något gick fel. Försök ladda om sidan.
          </p>
        </Card>
      </Shell>
    );
  }

  // ── phase === 'ready' ──────────────────────────────────────────────────────
  return (
    <Shell>
      {/* ── Quote card ──────────────────────────────────────────────── */}
      <Card>
        {/* Header */}
        <div style={{ padding: '28px 24px 18px', borderBottom: `1px solid ${BDR}` }}>
          <p style={{ fontFamily: INTER, fontSize: 22, color: TEXT, margin: '0 0 4px', letterSpacing: '0.03em' }}>
            {COMPANY_NAME}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, margin: 0, letterSpacing: '0.08em' }}>
              {quote.formattedId}
            </p>
            <StatusBadge status={quote.status} />
          </div>
        </div>

        {/* Field rows */}
        <div style={{ padding: '4px 24px 8px' }}>
          {FIELDS.map(({ key, label, fmt }) => (
            <FieldRow key={key} label={label} value={fmt ? fmt(quote[key]) : quote[key]} />
          ))}
        </div>

        {/* Banners */}
        {quote.lez_varning && (
          <div style={{ margin: '0 24px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 4, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span>⚠</span>
            <span style={{ fontFamily: INTER, fontSize: '0.6875rem', color: '#991B1B', lineHeight: 1.5 }}>
              Destinationen ligger inom miljözon (LEZ). Fordonskrav gäller.
            </span>
          </div>
        )}
        {quote['tillstånd_krävs'] && (
          <div style={{ margin: '0 24px 12px', background: '#FFFBEB', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 4, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span>⚡</span>
            <span style={{ fontFamily: INTER, fontSize: '0.6875rem', color: '#92400E', lineHeight: 1.5 }}>
              Dispensansökan kan krävas för detta uppdrag.
            </span>
          </div>
        )}

        {/* Total */}
        <div style={{ padding: '18px 24px', background: BG, borderTop: `1px solid ${BDR}`, borderBottom: `1px solid ${BDR}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontFamily: INTER, fontSize: '0.6875rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>
            Totalt exkl. moms
          </span>
          <span style={{ fontFamily: INTER, fontSize: '1.75rem', fontWeight: 700, color: BLUE, letterSpacing: '-0.01em' }}>
            {fmtSEK(quote.totalpris_sek)}
          </span>
        </div>

        {/* Notes */}
        {quote.noteringar && (
          <div style={{ padding: '14px 24px', borderBottom: `1px solid ${BDR2}` }}>
            <p style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', color: MUTED, margin: '0 0 5px', textTransform: 'uppercase' }}>
              Noteringar
            </p>
            <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: '#3a3a36', margin: 0, lineHeight: 1.6 }}>
              {quote.noteringar}
            </p>
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleAccept}
            disabled={working}
            style={{
              width: '100%', minHeight: 52, fontFamily: INTER, fontSize: '0.8125rem',
              fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              background: working ? 'rgba(67,97,238,0.5)' : BLUE,
              color: '#ffffff', border: 'none', borderRadius: 6,
              cursor: working ? 'wait' : 'pointer', transition: 'background 0.15s',
            }}
          >
            {working ? '…' : 'ACCEPT QUOTE / GODKÄNN OFFERT'}
          </button>
          <button
            onClick={handleDecline}
            disabled={working}
            style={{
              width: '100%', minHeight: 52, fontFamily: INTER, fontSize: '0.8125rem',
              fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
              background: '#f0f2f5', color: '#6c757d', border: '1px solid #e9ecef',
              borderRadius: 6, cursor: working ? 'wait' : 'pointer',
            }}
          >
            DECLINE / AVBÖJ
          </button>
        </div>
      </Card>

      {/* ── History ─────────────────────────────────────────────────── */}
      <HistoryCard history={history} />

      {/* ── Messages ────────────────────────────────────────────────── */}
      <MessageThread messages={messages} onSend={handleSendMessage} />

      {/* ── Counter-offer ───────────────────────────────────────────── */}
      {quote.status === 'väntande' && (
        <CounterOfferCard
          quote={quote}
          counterOffers={counterOffers}
          onSubmit={handleCounterOffer}
        />
      )}

      {/* Footer */}
      <p style={{ fontFamily: INTER, fontSize: '0.625rem', color: MUTED, textAlign: 'center', marginTop: 24, letterSpacing: '0.06em' }}>
        {COMPANY_NAME} · Offert {quote.formattedId} · {fmtDate(quote.created_at)}
      </p>
    </Shell>
  );
}
