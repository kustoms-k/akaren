import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';

const AMBER   = '#c9921e';
const AMBER_DK= '#a87818';
const WHITE   = '#ffffff';
const BG      = '#edeae1';
const BORDER  = '#cfc9bb';
const TEXT    = '#151210';
const MUTED   = '#6a6050';
const FAINT   = '#9a9082';
const OUTFIT  = "'Geist', system-ui, sans-serif";

const fmtSEK = (n) =>
  n == null ? '—' :
  new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' kr';

const fmtDate = (s) => {
  if (!s) return '—';
  try {
    return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(String(s).replace(' ', 'T')));
  } catch { return String(s).slice(0, 10); }
};

const fmtTime = (s) => {
  if (!s) return '';
  try {
    return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' })
      .format(new Date(String(s).replace(' ', 'T')));
  } catch { return ''; }
};

function statusBadge(status, t) {
  const tp = t.portal;
  if (status === 'godkänd')  return { label: tp.statuses.accepted,  bg: '#e8fdf0', color: '#16a34a' };
  if (status === 'avböjd')   return { label: tp.statuses.declined,  bg: '#fff0f0', color: '#e74c3c' };
  if (status === 'avslutad') return { label: tp.statuses.completed, bg: '#f0f2f5', color: '#6c757d' };
  if (status === 'fakturerad')return { label: tp.statuses.invoiced,  bg: '#eff6ff', color: '#1e3a5f' };
  return                            { label: tp.statuses.pending,   bg: '#fff7ed', color: '#d97706' };
}

function invoiceStatusBadge(status, t) {
  const is = t.portal.invoiceStatuses;
  if (status === 'betald')    return { label: is.paid,        bg: '#e8fdf0', color: '#16a34a' };
  if (status === 'förfallen') return { label: is.overdue,     bg: '#fff0f0', color: '#e74c3c' };
  return                             { label: is.outstanding, bg: '#fff7ed', color: '#d97706' };
}

function KpiCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: WHITE, border: `1px solid ${BORDER}`,
      borderRadius: 12, padding: '18px 20px', flex: 1, minWidth: 0,
    }}>
      <div style={{ fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, color: MUTED,
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: OUTFIT, fontSize: 22, fontWeight: 700,
        color: accent ?? TEXT, lineHeight: 1, marginBottom: 4 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: OUTFIT, fontSize: 11, color: FAINT }}>{sub}</div>
      )}
    </div>
  );
}

export function CustomerPortal({ token }) {
  const { t } = useLanguage();
  const tp = t.portal;

  const [data,           setData]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [activeTab,      setActiveTab]      = useState('history');
  const [messages,       setMessages]       = useState([]);
  const [msgInput,       setMsgInput]       = useState('');
  const [sending,        setSending]        = useState(false);
  const [showInquiry,    setShowInquiry]    = useState(false);
  const [inquiryText,    setInquiryText]    = useState('');
  const [sendingInquiry, setSendingInquiry] = useState(false);
  const [inquirySent,    setInquirySent]    = useState(false);
  const msgEndRef = useRef(null);

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setMessages(d.messages ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (activeTab === 'messages') {
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [activeTab, messages]);

  async function sendMessage() {
    if (!msgInput.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/portal/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: msgInput.trim() }),
      });
      if (!r.ok) throw new Error();
      const msg = await r.json();
      setMessages((prev) => [...prev, msg]);
      setMsgInput('');
    } catch { /* silent */ } finally { setSending(false); }
  }

  async function sendInquiry() {
    if (!inquiryText.trim() || sendingInquiry) return;
    setSendingInquiry(true);
    try {
      const r = await fetch(`/api/portal/${token}/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: inquiryText.trim() }),
      });
      if (!r.ok) throw new Error();
      setInquirySent(true);
      setInquiryText('');
      setTimeout(() => { setShowInquiry(false); setInquirySent(false); }, 2000);
    } catch { /* silent */ } finally { setSendingInquiry(false); }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: OUTFIT, fontSize: 14, color: MUTED }}>{tp.loadingPortal}</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '32px 40px', textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontFamily: OUTFIT, fontSize: 16, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
            {tp.notFound}
          </div>
          <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED }}>
            {tp.notFoundDesc}
          </div>
        </div>
      </div>
    );
  }

  const { portal, quotes, ytd_spend, total_spend, inquiries } = data;
  const activeQuotes  = (quotes ?? []).filter((q) => q.status === 'väntande');
  const unreadCount   = messages.filter((m) => m.direction === 'out' && !m.read_at).length;

  const TABS = [
    { id: 'history',  label: tp.tabs.history },
    { id: 'messages', label: tp.tabs.messages },
  ];

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: OUTFIT }}>

      <header style={{
        background: WHITE, borderBottom: `1px solid ${BORDER}`,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: 900, margin: '0 auto', padding: '0 24px',
          height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 34, height: 34, background: BLUE, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ color: WHITE, fontSize: 15, fontWeight: 700 }}>Å</span>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{portal.company_name}</div>
              {portal.company_email && (
                <div style={{ fontSize: 11, color: FAINT }}>{portal.company_email}</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: MUTED,
              background: BG, border: `1px solid ${BORDER}`,
              borderRadius: 20, padding: '4px 12px',
            }}>
              {tp.yourAccount}
            </div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 80px' }}>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: OUTFIT, fontSize: 24, fontWeight: 700, color: TEXT,
            margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            {tp.welcome}, {portal.customer_name}
          </h1>
          <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, margin: 0 }}>
            {tp.subtitle(portal.company_name)}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 14, marginBottom: 32, flexWrap: 'wrap' }}>
          <KpiCard
            label={tp.kpis.quotes}
            value={String(quotes?.length ?? 0)}
            sub={tp.kpis.activeQuotes(activeQuotes.length)}
          />
          <KpiCard
            label={tp.kpis.paidLabel}
            value={fmtSEK(ytd_spend)}
            sub={tp.kpis.paidSub}
            accent={BLUE}
          />
          <KpiCard
            label={tp.kpis.totalLabel}
            value={fmtSEK(total_spend)}
            sub={tp.kpis.totalSub}
          />
          {unreadCount > 0 && (
            <KpiCard
              label={tp.kpis.newMessages}
              value={String(unreadCount)}
              sub={tp.kpis.fromDispatcher}
              accent="#d97706"
            />
          )}
        </div>

        {activeQuotes.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUTED,
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              {tp.activeQuote.heading}
            </div>
            {activeQuotes.map((q) => (
              <div key={q.id} style={{
                background: WHITE, border: `2px solid ${BLUE}`,
                borderRadius: 12, padding: '20px 24px',
                boxShadow: '0 4px 16px rgba(67,97,238,0.10)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 6 }}>
                      {q.lasttyp ?? 'Transport'}
                    </div>
                    {(q.upphämtning || q.leverans) && (
                      <div style={{ fontSize: 13, color: MUTED, marginBottom: 4 }}>
                        {[q.upphämtning, q.leverans].filter(Boolean).join(' – ')}
                      </div>
                    )}
                    {q.datum && (
                      <div style={{ fontSize: 12, color: FAINT }}>{fmtDate(q.datum)}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: BLUE, lineHeight: 1, marginBottom: 4 }}>
                      {fmtSEK(q.totalpris_sek)}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED }}>{fmtDate(q.created_at)}</div>
                  </div>
                </div>
                {q.token && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
                    <a
                      href={`/quote/${q.token}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontFamily: OUTFIT, fontSize: 12, fontWeight: 600,
                        color: WHITE, background: BLUE,
                        border: 'none', borderRadius: 8, padding: '10px 20px',
                        textDecoration: 'none', cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = BLUE_DK; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = BLUE; }}
                    >
                      {tp.activeQuote.viewBtn}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${BORDER}`, marginBottom: 24 }}>
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              fontFamily: OUTFIT, fontSize: 13, fontWeight: activeTab === id ? 600 : 400,
              color: activeTab === id ? BLUE : MUTED,
              background: 'none', border: 'none',
              borderBottom: activeTab === id ? `2px solid ${BLUE}` : '2px solid transparent',
              padding: '10px 18px', cursor: 'pointer',
              marginBottom: -1, transition: 'color 0.15s',
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* History tab */}
        {activeTab === 'history' && (
          <div>
            {quotes?.length === 0 ? (
              <div style={{
                background: WHITE, border: `1px solid ${BORDER}`,
                borderRadius: 12, padding: '48px 24px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 13, color: MUTED }}>{tp.noQuotesDesc}</div>
              </div>
            ) : (
              <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: BG }}>
                      {[tp.table.ref, tp.table.cargo, tp.table.route,
                        tp.table.date, tp.table.amount, tp.table.status].map((col) => (
                        <th key={col} style={{
                          fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                          color: MUTED, textAlign: 'left',
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
                        }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q, i) => {
                      const sb = statusBadge(q.status ?? 'väntande', t);
                      const ib = q.invoice_status ? invoiceStatusBadge(q.invoice_status, t) : null;
                      return (
                        <tr key={q.id}
                          style={{ borderBottom: i < quotes.length - 1 ? `1px solid ${BORDER}` : 'none' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = BG; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                            color: BLUE, padding: '14px 16px', whiteSpace: 'nowrap' }}>
                            {q.faktura_nr
                              ? `#${q.faktura_nr}`
                              : `OFF-${String(q.id).padStart(3, '0')}`}
                          </td>
                          <td style={{ fontFamily: OUTFIT, fontSize: 13, color: TEXT,
                            padding: '14px 16px', maxWidth: 160,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {q.lasttyp ?? '—'}
                          </td>
                          <td style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, padding: '14px 16px' }}>
                            {[q.upphämtning, q.leverans].filter(Boolean).join(' – ') || '—'}
                          </td>
                          <td style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED,
                            padding: '14px 16px', whiteSpace: 'nowrap' }}>
                            {fmtDate(q.created_at)}
                          </td>
                          <td style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
                            color: TEXT, padding: '14px 16px', whiteSpace: 'nowrap' }}>
                            {fmtSEK(q.invoice_total ?? q.totalpris_sek)}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{
                                fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                                padding: '3px 10px', borderRadius: 20,
                                background: sb.bg, color: sb.color,
                              }}>
                                {sb.label}
                              </span>
                              {ib && (
                                <span style={{
                                  fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                                  padding: '3px 10px', borderRadius: 20,
                                  background: ib.bg, color: ib.color,
                                }}>
                                  {ib.label}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 28, textAlign: 'center' }}>
              <button
                onClick={() => setShowInquiry(true)}
                style={{
                  fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
                  background: BLUE, color: WHITE,
                  border: 'none', borderRadius: 8, padding: '13px 28px',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = BLUE_DK; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = BLUE; }}
              >
                {tp.newInquiry.btn}
              </button>
              <p style={{ fontFamily: OUTFIT, fontSize: 11, color: FAINT, marginTop: 8 }}>
                {tp.newInquiry.hint}
              </p>
            </div>
          </div>
        )}

        {/* Messages tab */}
        {activeTab === 'messages' && (
          <div>
            <div style={{
              background: WHITE, border: `1px solid ${BORDER}`,
              borderRadius: 12, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              minHeight: 360, maxHeight: 520,
            }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px',
                display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center' }}>
                    <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED }}>
                      {tp.noMessagesDesc}
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOut = msg.direction === 'out';
                    return (
                      <div key={msg.id} style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: isOut ? 'flex-start' : 'flex-end',
                      }}>
                        <div style={{
                          maxWidth: '72%',
                          background: isOut ? BG : BLUE,
                          color: isOut ? TEXT : WHITE,
                          borderRadius: isOut ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                          padding: '10px 14px',
                          fontFamily: OUTFIT, fontSize: 13, lineHeight: 1.5,
                        }}>
                          {msg.body}
                        </div>
                        <div style={{ fontFamily: OUTFIT, fontSize: 10, color: FAINT, marginTop: 4 }}>
                          {isOut ? msg.sender_name : tp.messageThread.you} · {fmtTime(msg.created_at)}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={msgEndRef} />
              </div>

              <div style={{
                borderTop: `1px solid ${BORDER}`, padding: '14px 20px',
                display: 'flex', gap: 10, alignItems: 'flex-end',
              }}>
                <textarea
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder={tp.messageThread.placeholder}
                  rows={2}
                  style={{
                    flex: 1, fontFamily: OUTFIT, fontSize: 13, color: TEXT,
                    background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                    padding: '10px 14px', resize: 'none', outline: 'none',
                    lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !msgInput.trim()}
                  style={{
                    fontFamily: OUTFIT, fontSize: 12, fontWeight: 600,
                    background: msgInput.trim() ? BLUE : BORDER,
                    color: msgInput.trim() ? WHITE : FAINT,
                    border: 'none', borderRadius: 8, padding: '10px 18px',
                    cursor: msgInput.trim() ? 'pointer' : 'default',
                    transition: 'background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {sending ? tp.messageThread.sending : tp.messageThread.send}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* New inquiry modal */}
      {showInquiry && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: WHITE, borderRadius: 12,
            width: '100%', maxWidth: 520,
            boxShadow: '0 20px 60px rgba(0,0,0,0.16)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontFamily: OUTFIT, fontSize: 15, fontWeight: 700, color: TEXT }}>
                  {tp.newInquiry.heading}
                </div>
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, marginTop: 2 }}>
                  {tp.newInquiry.sub}
                </div>
              </div>
              <button
                onClick={() => { setShowInquiry(false); setInquiryText(''); setInquirySent(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, padding: 4 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {inquirySent ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 24, marginBottom: 8, color: '#16a34a', fontWeight: 700 }}>OK</div>
                  <div style={{ fontFamily: OUTFIT, fontSize: 14, fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>
                    {tp.newInquiry.sent}
                  </div>
                  <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
                    {tp.newInquiry.sentDesc}
                  </div>
                </div>
              ) : (
                <>
                  <textarea
                    autoFocus
                    value={inquiryText}
                    onChange={(e) => setInquiryText(e.target.value)}
                    placeholder={tp.newInquiry.placeholder}
                    rows={7}
                    style={{
                      width: '100%', fontFamily: OUTFIT, fontSize: 13, color: TEXT,
                      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                      padding: '12px 14px', resize: 'vertical', outline: 'none',
                      lineHeight: 1.6, boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setShowInquiry(false); setInquiryText(''); }}
                      style={{
                        fontFamily: OUTFIT, fontSize: 12, fontWeight: 500,
                        background: WHITE, color: MUTED,
                        border: `1px solid ${BORDER}`, borderRadius: 8,
                        padding: '10px 20px', cursor: 'pointer',
                      }}
                    >
                      {tp.newInquiry.cancel}
                    </button>
                    <button
                      onClick={sendInquiry}
                      disabled={!inquiryText.trim() || sendingInquiry}
                      style={{
                        fontFamily: OUTFIT, fontSize: 12, fontWeight: 600,
                        background: inquiryText.trim() ? BLUE : BORDER,
                        color: inquiryText.trim() ? WHITE : FAINT,
                        border: 'none', borderRadius: 8,
                        padding: '10px 24px', cursor: inquiryText.trim() ? 'pointer' : 'default',
                        transition: 'background 0.15s',
                      }}
                    >
                      {sendingInquiry ? tp.newInquiry.sending : tp.newInquiry.submit}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <footer style={{
        borderTop: `1px solid ${BORDER}`, background: WHITE,
        padding: '16px 24px', textAlign: 'center', marginTop: 40,
      }}>
        <div style={{ fontFamily: OUTFIT, fontSize: 11, color: FAINT }}>
          {portal.company_name}
          {portal.company_org_nr && ` · Org.nr ${portal.company_org_nr}`}
          {portal.company_phone && ` · ${portal.company_phone}`}
          {portal.company_email && ` · ${portal.company_email}`}
        </div>
      </footer>

    </div>
  );
}
