import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';

const AMBER   = '#c9921e';
const AMBER_DK= '#a87818';
const WHITE   = '#ffffff';
const BORDER  = '#cfc9bb';
const TEXT    = '#151210';
const MUTED   = '#6a6050';
const FAINT   = '#9a9082';
const OUTFIT  = "'Geist', system-ui, sans-serif";
const SURF    = '#f4f0e7';
const MONO    = "'Geist Mono', monospace";

const fmtSEK = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

function fmtTs(str) {
  if (!str) return '';
  try {
    const d   = new Date(str.replace(' ', 'T'));
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
      + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function NoteInput({ value, onChange, placeholder }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      placeholder={placeholder}
      style={{
        width: '100%', boxSizing: 'border-box', resize: 'vertical',
        fontFamily: OUTFIT, fontSize: 13, color: TEXT,
        background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 8,
        padding: '9px 14px', outline: 'none',
      }}
    />
  );
}

function ActionRow({ onConfirm, onCancel, loading, disabled, confirmLabel, confirmVariant = 'primary', cancelLabel }) {
  const isDisabled = loading || disabled;

  const confirmStyle = {
    fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
    padding: '9px 18px', border: 'none', borderRadius: 8,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
    ...(confirmVariant === 'danger'
      ? {
          background: isDisabled ? '#f4f0e7' : '#fff0f0',
          color:      isDisabled ? '#9ca3af' : '#e74c3c',
          border:     `1.5px solid ${isDisabled ? '#cfc9bb' : '#fca5a5'}`,
        }
      : {
          background: isDisabled ? '#a0aec0' : AMBER,
          color:      '#ffffff',
        }
    ),
  };

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <button
        onClick={onCancel}
        style={{
          fontFamily: OUTFIT, fontSize: 13, padding: '9px 18px',
          border: `1.5px solid ${BORDER}`, borderRadius: 8,
          background: WHITE, color: MUTED, cursor: 'pointer',
        }}
      >
        {cancelLabel}
      </button>
      <button onClick={onConfirm} disabled={isDisabled} style={confirmStyle}>
        {loading ? '…' : confirmLabel}
      </button>
    </div>
  );
}

function CounterOfferCard({ co, rawId, onResponded, t }) {
  const co_t = t.messagePanel.counterOffer;
  const [mode,      setMode]      = useState(null);
  const [note,      setNote]      = useState('');
  const [revisedPx, setRevisedPx] = useState('');
  const [loading,   setLoading]   = useState(false);

  const statusColors = {
    pending:  { text: '#d97706', bg: '#fff7ed', border: '#fde68a'  },
    accepted: { text: '#16a34a', bg: '#e8fdf0', border: '#bbf7d0'  },
    declined: { text: '#e74c3c', bg: '#fff0f0', border: '#fca5a5'  },
    revised:  { text: AMBER, bg: '#fef3e2', border: '#fddba5'  },
  };
  const sc = statusColors[co.status] ?? statusColors.pending;
  const statusLabel = co_t.statuses[co.status] ?? co.status;

  async function respond(status, extra = {}) {
    setLoading(true);
    try {
      const r = await fetch(`/api/quotes/${rawId}/counter-offers/${co.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status, dispatcher_note: note.trim() || null, ...extra }),
      });
      if (r.ok) { setMode(null); onResponded?.(); }
    } finally { setLoading(false); }
  }

  const primaryBtnStyle = {
    flex: 1, fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
    padding: '9px 18px', border: 'none', borderRadius: 8,
    background: AMBER, color: '#ffffff', cursor: 'pointer',
  };
  const secondaryBtnStyle = {
    flex: 1, fontFamily: OUTFIT, fontSize: 13, fontWeight: 500,
    padding: '9px 18px', border: '1.5px solid #cfc9bb', borderRadius: 8,
    background: '#ffffff', color: '#374151', cursor: 'pointer',
  };
  const dangerBtnStyle = {
    flex: 1, fontFamily: OUTFIT, fontSize: 13, fontWeight: 500,
    padding: '9px 18px', border: '1.5px solid #fca5a5', borderRadius: 8,
    background: '#fff0f0', color: '#e74c3c', cursor: 'pointer',
  };

  return (
    <div style={{
      background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 8,
      overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div>
          <span style={{
            fontFamily: OUTFIT, fontSize: 11, textTransform: 'uppercase',
            fontWeight: 600, color: MUTED, letterSpacing: '0.3px',
          }}>
            {co_t.label}
          </span>
          <div style={{ fontFamily: OUTFIT, fontSize: 20, fontWeight: 700, color: TEXT, marginTop: 2 }}>
            {fmtSEK(co.proposed_price_sek)}
          </div>
        </div>
        <span style={{
          fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
          color: sc.text, background: sc.bg,
          border: `1px solid ${sc.border}`,
          padding: '3px 8px', borderRadius: 4,
        }}>
          {statusLabel}
        </span>
      </div>

      {co.note && (
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{
            fontFamily: OUTFIT, fontSize: 11, color: MUTED,
            marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px',
          }}>
            {co_t.reason}
          </div>
          <p style={{ fontFamily: OUTFIT, fontSize: 13, color: TEXT, margin: 0, lineHeight: 1.6 }}>
            {co.note}
          </p>
        </div>
      )}

      {co.status === 'pending' && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mode === null && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setMode('accept')}  style={primaryBtnStyle}>{co_t.accept}</button>
              <button onClick={() => setMode('revise')}  style={secondaryBtnStyle}>{co_t.revise}</button>
              <button onClick={() => setMode('decline')} style={dangerBtnStyle}>{co_t.decline}</button>
            </div>
          )}

          {mode === 'accept' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontFamily: OUTFIT, fontSize: 13, color: TEXT, margin: 0 }}>
                {co_t.acceptConfirm(fmtSEK(co.proposed_price_sek))}
              </p>
              <NoteInput value={note} onChange={setNote} placeholder={co_t.notePlaceholder} />
              <ActionRow
                onConfirm={() => respond('accepted')}
                onCancel={() => setMode(null)}
                loading={loading}
                confirmLabel={co_t.confirm}
                cancelLabel={co_t.cancel}
                confirmVariant="primary"
              />
            </div>
          )}

          {mode === 'decline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontFamily: OUTFIT, fontSize: 13, color: TEXT, margin: 0 }}>
                {co_t.declineConfirm}
              </p>
              <NoteInput value={note} onChange={setNote} placeholder={co_t.declinePlaceholder} />
              <ActionRow
                onConfirm={() => respond('declined')}
                onCancel={() => setMode(null)}
                loading={loading}
                confirmLabel={co_t.decline}
                cancelLabel={co_t.cancel}
                confirmVariant="danger"
              />
            </div>
          )}

          {mode === 'revise' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  value={revisedPx}
                  onChange={(e) => setRevisedPx(e.target.value)}
                  placeholder={co_t.revisePlaceholder}
                  style={{
                    flex: 1, fontFamily: OUTFIT, fontSize: 13, color: TEXT,
                    background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 8,
                    padding: '9px 14px', outline: 'none',
                  }}
                />
                <span style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED }}>kr</span>
              </div>
              <NoteInput value={note} onChange={setNote} placeholder={co_t.motivationPlaceholder} />
              <ActionRow
                onConfirm={() => respond('revised', { revised_price_sek: Number(revisedPx) })}
                onCancel={() => setMode(null)}
                loading={loading}
                disabled={!Number(revisedPx) || Number(revisedPx) <= 0}
                confirmLabel={co_t.sendRevised}
                cancelLabel={co_t.cancel}
                confirmVariant="primary"
              />
            </div>
          )}
        </div>
      )}

      {co.status !== 'pending' && co.dispatcher_note && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${BORDER}` }}>
          <div style={{
            fontFamily: OUTFIT, fontSize: 11, color: MUTED,
            marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px',
          }}>
            {co_t.yourNote}
          </div>
          <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, margin: 0, fontStyle: 'italic' }}>
            "{co.dispatcher_note}"
          </p>
        </div>
      )}
    </div>
  );
}

export function MessagePanel({ rawId, quoteLabel, quoteId, onClose }) {
  const { t } = useLanguage();
  const mp = t.messagePanel;
  const [messages,      setMessages]      = useState([]);
  const [counterOffers, setCounterOffers] = useState([]);
  const [reply,         setReply]         = useState('');
  const [sending,       setSending]       = useState(false);
  const [loading,       setLoading]       = useState(true);
  const bottomRef = useRef(null);

  function fetchData() {
    return Promise.all([
      fetch(`/api/quotes/${rawId}/messages`).then((r) => r.json()),
      fetch(`/api/quotes/${rawId}/counter-offers`).then((r) => r.json()),
    ]).then(([msgs, cos]) => {
      setMessages(Array.isArray(msgs) ? msgs : []);
      setCounterOffers(Array.isArray(cos) ? cos : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [rawId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/quotes/${rawId}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text }),
      });
      if (r.ok) {
        const msg = await r.json();
        setMessages((prev) => [...prev, msg]);
        setReply('');
      }
    } finally { setSending(false); }
  }

  const pendingCos = counterOffers.filter((c) => c.status === 'pending');
  const canSend    = reply.trim() && !sending;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.60)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 520, maxHeight: '90vh',
        background: WHITE, border: `1px solid ${BORDER}`,
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontFamily: OUTFIT, fontSize: 11, textTransform: 'uppercase',
              fontWeight: 600, color: MUTED, letterSpacing: '0.3px',
            }}>
              {mp.heading}
            </div>
            <div style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 600, color: TEXT, marginTop: 2 }}>
              {quoteId} {quoteLabel ? `· ${quoteLabel}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontFamily: OUTFIT, fontSize: 14, background: WHITE,
              border: `1.5px solid ${BORDER}`, borderRadius: 8,
              color: MUTED, width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>

          {loading && (
            <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, textAlign: 'center', margin: '24px 0' }}>
              {mp.loading}
            </p>
          )}

          {pendingCos.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div style={{
                fontFamily: OUTFIT, fontSize: 11, textTransform: 'uppercase',
                fontWeight: 600, color: '#d97706', letterSpacing: '0.3px', marginBottom: 8,
              }}>
                ● {mp.counterOffer.pending}
              </div>
              {pendingCos.map((co) => (
                <CounterOfferCard key={co.id} co={co} rawId={rawId} onResponded={fetchData} t={t} />
              ))}
            </div>
          )}

          {counterOffers.filter((c) => c.status !== 'pending').map((co) => (
            <CounterOfferCard key={co.id} co={co} rawId={rawId} onResponded={fetchData} t={t} />
          ))}

          {messages.length === 0 && !loading && (
            <p style={{
              fontFamily: OUTFIT, fontSize: 13, color: MUTED,
              textAlign: 'center', margin: '24px 0', fontStyle: 'italic',
            }}>
              {mp.noMessages}
            </p>
          )}

          {messages.map((m) => {
            const isDispatcher = m.sender === 'dispatcher';
            return (
              <div key={m.id} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: isDispatcher ? 'flex-end' : 'flex-start', gap: 3,
              }}>
                <div style={{
                  maxWidth: '80%',
                  background:   isDispatcher ? AMBER : SURF,
                  color:        isDispatcher ? WHITE : TEXT,
                  borderRadius: isDispatcher ? '8px 8px 0 8px' : '8px 8px 8px 0',
                  padding: '9px 13px',
                  fontFamily: OUTFIT, fontSize: 14, lineHeight: 1.5,
                }}>
                  {m.message}
                </div>
                <span style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED }}>
                  {isDispatcher ? mp.senderYou : mp.senderCustomer} · {fmtTs(m.created_at)}
                </span>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        <div style={{ flexShrink: 0, padding: '12px 20px 16px', borderTop: `1px solid ${BORDER}` }}>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
            rows={2}
            placeholder={mp.replyPlaceholder}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'none',
              fontFamily: OUTFIT, fontSize: 13, color: TEXT,
              background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 8,
              padding: '9px 14px', outline: 'none',
            }}
          />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSend}
              disabled={!canSend}
              style={{
                fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
                background: canSend ? AMBER : '#a0aec0',
                color: WHITE, border: 'none',
                borderRadius: 8, padding: '9px 20px',
                cursor: canSend ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
              }}
            >
              {sending ? mp.sending : mp.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
