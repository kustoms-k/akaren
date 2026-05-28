import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LogoFull } from '../assets/Logo.jsx';

const OUTFIT  = "'Plus Jakarta Sans', system-ui, sans-serif";
const INTER   = OUTFIT;
const AMBER   = '#c9921e';
const BLUE    = AMBER;
const AMBER_DK= '#a87818';
const BLUE_DK = AMBER_DK;
const BG      = '#edeae1';
const WHITE   = '#ffffff';
const TEXT    = '#151210';
const MUTED   = '#6a6050';
const BDR     = '#cfc9bb';
const BDR2    = '#f4f0e7';

const fmtSEK = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

const fmtKm = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' km';

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

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: BG,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', padding: '0 16px 80px',
      boxSizing: 'border-box',
    }}>
      {/* Branded header bar */}
      <div style={{
        width: '100%',
        background: 'linear-gradient(145deg, #080b1a 0%, #0f1640 50%, #1a1d6e 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px 24px', marginBottom: 28, flexShrink: 0,
        boxShadow: '0 4px 24px rgba(0,0,0,0.20)',
      }}>
        <LogoFull markSize={26} variant="light" />
      </div>
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

function Loading({ t }) {
  return (
    <Shell>
      <Card style={{ padding: 32 }}>
        <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: MUTED, margin: 0, textAlign: 'center' }}>
          {t.publicQuote.loading}
        </p>
      </Card>
    </Shell>
  );
}

function NotFound({ t }) {
  return (
    <Shell>
      <Card style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ fontFamily: INTER, fontSize: 24, color: TEXT, margin: '0 0 12px' }}>{t.publicQuote.notFound}</p>
        <p style={{ fontFamily: INTER, fontSize: '0.9375rem', color: MUTED, margin: 0, lineHeight: 1.6 }}>
          {t.publicQuote.notFoundDesc}
        </p>
      </Card>
    </Shell>
  );
}

function Accepted({ formattedId, t }) {
  return (
    <Shell>
      <Card style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 14L11.5 19.5L22 9" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p style={{ fontFamily: INTER, fontSize: 26, color: TEXT, margin: '0 0 10px', letterSpacing: '0.02em' }}>{t.publicQuote.accepted}</p>
        <p style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, margin: '0 0 20px', letterSpacing: '0.08em' }}>{formattedId}</p>
        <p style={{ fontFamily: INTER, fontSize: '0.9375rem', color: '#3a3a36', margin: 0, lineHeight: 1.7 }}>
          {t.publicQuote.acceptedDesc}
        </p>
        <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${BDR}` }}>
          <p style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, margin: 0, letterSpacing: '0.06em' }}>{companyName}</p>
        </div>
      </Card>
    </Shell>
  );
}

function Declined({ formattedId, t }) {
  return (
    <Shell>
      <Card style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 5L19 19M19 5L5 19" stroke="#b91c1c" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <p style={{ fontFamily: INTER, fontSize: 26, color: TEXT, margin: '0 0 10px', letterSpacing: '0.02em' }}>{t.publicQuote.declined}</p>
        <p style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, margin: '0 0 20px', letterSpacing: '0.08em' }}>{formattedId}</p>
        <p style={{ fontFamily: INTER, fontSize: '0.9375rem', color: '#3a3a36', margin: 0, lineHeight: 1.7 }}>
          {t.publicQuote.declinedDesc}
        </p>
        <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${BDR}` }}>
          <p style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, margin: 0, letterSpacing: '0.06em' }}>{companyName}</p>
        </div>
      </Card>
    </Shell>
  );
}

function HistoryCard({ history, t }) {
  if (!history?.length) return null;
  const pq = t.publicQuote;
  return (
    <Card style={{ marginTop: 16 }}>
      <SectionHead
        title={pq.history.heading(companyName)}
        count={pq.history.count(history.length)}
      />
      <div>
        {history.map((h, i) => {
          const s = pq.statuses[h.status ?? 'pending'] ?? pq.statuses.pending;
          return (
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
                <span style={{
                  fontFamily: INTER,
                  fontSize: '0.5rem',
                  letterSpacing: '0.06em',
                  fontWeight: 500,
                  color: s.color ?? MUTED,
                  background: s.bg ?? BG,
                  border: `1px solid ${s.bdr ?? BDR}`,
                  borderRadius: 3,
                  padding: '1px 5px',
                  whiteSpace: 'nowrap',
                }}>
                  {s.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MessageThread({ messages, onSend, t }) {
  const [text,    setText]    = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const bottomRef = useRef(null);
  const pm = t.publicQuote.messages;

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
      <SectionHead title={pm.heading} />

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
                  {isCustomer ? pm.you : companyName} · {fmtTs(m.created_at)}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      <div style={{ padding: '16px 24px 24px', borderTop: messages.length > 0 ? `1px solid ${BDR}` : 'none' }}>
        {messages.length === 0 && (
          <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>
            {pm.noMsgPrompt}
          </p>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
          rows={3}
          placeholder={pm.placeholder}
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
            {sent ? pm.sent : pm.sendHint}
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
            {sending ? pm.sending : pm.send}
          </button>
        </div>
      </div>
    </Card>
  );
}

function CounterOfferCard({ quote, counterOffers, onSubmit, t }) {
  const [open,    setOpen]    = useState(false);
  const [price,   setPrice]   = useState('');
  const [note,    setNote]    = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);
  const pq = t.publicQuote;
  const co = pq.co;

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

  if (latest?.status === 'revised') {
    return (
      <Card style={{ marginTop: 16 }}>
        <SectionHead title={co.heading} />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', color: '#1e3a5f', background: '#EFF6FF', border: `1px solid rgba(59,130,246,0.25)`, borderRadius: 4, padding: '8px 12px', marginBottom: 16 }}>
            {co.revised}
          </div>
          <p style={{ fontFamily: INTER, fontSize: '0.9375rem', color: TEXT, margin: '0 0 8px', lineHeight: 1.5 }}>
            {co.revisedDesc(companyName)}
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
            {co.revisedAcceptNote}
          </p>
        </div>
      </Card>
    );
  }

  if (latest?.status === 'accepted') {
    return (
      <Card style={{ marginTop: 16 }}>
        <SectionHead title={co.heading} />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', color: '#14532D', background: '#F0FDF4', border: `1px solid rgba(34,197,94,0.25)`, borderRadius: 4, padding: '8px 12px', marginBottom: 12 }}>
            {co.accepted}
          </div>
          <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: TEXT, margin: 0, lineHeight: 1.5 }}>
            {co.acceptedDesc(fmtSEK(latest.proposed_price_sek))}
          </p>
        </div>
      </Card>
    );
  }

  if (latest?.status === 'declined') {
    return (
      <Card style={{ marginTop: 16 }}>
        <SectionHead title={co.heading} />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', color: '#991B1B', background: '#FEF2F2', border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 4, padding: '8px 12px', marginBottom: 12 }}>
            {co.declined}
          </div>
          <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: TEXT, margin: 0, lineHeight: 1.5 }}>
            {latest.dispatcher_note ? `"${latest.dispatcher_note}"` : co.declinedDefault}
          </p>
        </div>
      </Card>
    );
  }

  if (latest?.status === 'pending' || done) {
    return (
      <Card style={{ marginTop: 16 }}>
        <SectionHead title={co.heading} />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', color: '#92400E', background: '#FFFBEB', border: `1px solid rgba(245,158,11,0.25)`, borderRadius: 4, padding: '8px 12px', marginBottom: 12 }}>
            {co.pending}
          </div>
          <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: TEXT, margin: 0, lineHeight: 1.5 }}>
            {co.pendingDesc(fmtSEK(latest?.proposed_price_sek))}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <SectionHead title={co.heading} />
      <div style={{ padding: '16px 24px 24px' }}>
        {!open ? (
          <>
            <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: '#3a3a36', margin: '0 0 16px', lineHeight: 1.5 }}>
              {co.proposeDesc}
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
              {co.proposeBtn}
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <div style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: 5 }}>
                {co.proposedPrice}
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
                {co.reason}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={co.reason}
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
                {co.cancel}
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
                {sending ? '…' : co.submitBtn}
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function PublicQuote({ token }) {
  const { t } = useLanguage();
  const pq = t.publicQuote;

  const [phase,         setPhase]         = useState('loading');
  const [quote,         setQuote]         = useState(null);
  const companyName = quote?.company_name ?? '';
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

  if (phase === 'loading')   return <Loading t={t} />;
  if (phase === 'not-found') return <NotFound t={t} />;
  if (phase === 'accepted')  return <Accepted formattedId={quote?.formattedId} t={t} />;
  if (phase === 'declined')  return <Declined formattedId={quote?.formattedId} t={t} />;
  if (phase === 'error') {
    return (
      <Shell>
        <Card style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ fontFamily: INTER, fontSize: '0.9375rem', color: '#b91c1c', margin: 0 }}>
            {pq.error}
          </p>
        </Card>
      </Shell>
    );
  }

  const FIELDS = [
    { key: 'lasttyp',     label: pq.fields.lasttyp     },
    { key: 'upphämtning', label: pq.fields.upphämtning },
    { key: 'leverans',    label: pq.fields.leverans    },
    { key: 'datum',       label: pq.fields.datum       },
    { key: 'fordon_id',   label: pq.fields.fordon_id   },
    { key: 'avstand_km',  label: pq.fields.avstand_km, fmt: fmtKm },
  ];

  const statusDef = pq.statuses[quote.status] ?? pq.statuses.pending;

  return (
    <Shell>
      <Card>
        <div style={{ padding: '28px 24px 18px', borderBottom: `1px solid ${BDR}` }}>
          <p style={{ fontFamily: INTER, fontSize: 22, color: TEXT, margin: '0 0 4px', letterSpacing: '0.03em' }}>
            {companyName}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontFamily: INTER, fontSize: '0.6875rem', color: MUTED, margin: 0, letterSpacing: '0.08em' }}>
              {quote.formattedId}
            </p>
            <span style={{
              fontFamily: INTER,
              fontSize: '0.5625rem',
              letterSpacing: '0.06em',
              fontWeight: 500,
              color: statusDef.color ?? MUTED,
              background: statusDef.bg ?? BG,
              border: `1px solid ${statusDef.bdr ?? BDR}`,
              borderRadius: 3,
              padding: '2px 7px',
              whiteSpace: 'nowrap',
            }}>
              {statusDef.label}
            </span>
          </div>
        </div>

        <div style={{ padding: '4px 24px 8px' }}>
          {FIELDS.map(({ key, label, fmt }) => (
            <FieldRow key={key} label={label} value={fmt ? fmt(quote[key]) : quote[key]} />
          ))}
        </div>

        {quote.lez_varning && (
          <div style={{ margin: '0 24px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 4, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontFamily: INTER, fontSize: '0.6875rem', color: '#991B1B', lineHeight: 1.5 }}>
              {pq.lez}
            </span>
          </div>
        )}
        {quote['tillstånd_krävs'] && (
          <div style={{ margin: '0 24px 12px', background: '#FFFBEB', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 4, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontFamily: INTER, fontSize: '0.6875rem', color: '#92400E', lineHeight: 1.5 }}>
              {pq.tillstand}
            </span>
          </div>
        )}

        <div style={{ padding: '18px 24px', background: BG, borderTop: `1px solid ${BDR}`, borderBottom: `1px solid ${BDR}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontFamily: INTER, fontSize: '0.6875rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>
            {pq.totalExclVat}
          </span>
          <span style={{ fontFamily: INTER, fontSize: '1.75rem', fontWeight: 700, color: BLUE, letterSpacing: '-0.01em' }}>
            {fmtSEK(quote.totalpris_sek)}
          </span>
        </div>

        {quote.noteringar && (
          <div style={{ padding: '14px 24px', borderBottom: `1px solid ${BDR2}` }}>
            <p style={{ fontFamily: INTER, fontSize: '0.5625rem', letterSpacing: '0.1em', color: MUTED, margin: '0 0 5px', textTransform: 'uppercase' }}>
              {pq.notes}
            </p>
            <p style={{ fontFamily: INTER, fontSize: '0.875rem', color: '#3a3a36', margin: 0, lineHeight: 1.6 }}>
              {quote.noteringar}
            </p>
          </div>
        )}

        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleAccept}
            disabled={working}
            style={{
              width: '100%', minHeight: 52, fontFamily: INTER, fontSize: '0.8125rem',
              fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              background: working
                ? 'rgba(99,102,241,0.5)'
                : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#ffffff', border: 'none', borderRadius: 8,
              cursor: working ? 'wait' : 'pointer',
              transition: 'opacity 0.15s',
              boxShadow: working ? 'none' : '0 2px 6px rgba(99,102,241,0.25)',
            }}
          >
            {working ? pq.working : pq.accept}
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
            {pq.decline}
          </button>
        </div>
      </Card>

      <HistoryCard history={history} t={t} />
      <MessageThread messages={messages} onSend={handleSendMessage} t={t} />

      {quote.status === 'väntande' && (
        <CounterOfferCard
          quote={quote}
          counterOffers={counterOffers}
          onSubmit={handleCounterOffer}
          t={t}
        />
      )}

      <p style={{ fontFamily: INTER, fontSize: '0.625rem', color: MUTED, textAlign: 'center', marginTop: 24, letterSpacing: '0.06em' }}>
        {pq.footer(companyName, quote.formattedId, fmtDate(quote.created_at))}
      </p>
    </Shell>
  );
}
