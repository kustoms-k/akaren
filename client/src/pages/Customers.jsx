import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const AMBER   = '#B56510';
const AMBER_DK= '#9A6410';
const WHITE   = '#ffffff';
const BG      = '#EDECEA';
const SURF    = '#FAF9F7';
const BORDER  = 'rgba(28,26,22,0.09)';
const TEXT    = '#1C1A17';
const MUTED   = '#625E58';
const FAINT   = '#A09C96';
const OUTFIT  = "'Outfit', system-ui, sans-serif";
const MONO    = "'DM Mono', monospace";

const fmtSEK = (n) =>
  n == null ? '—' :
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

const fmtRelTime = (s, t) => {
  if (!s) return t.customers.table.lastSeen === 'Last Active' ? 'Never' : 'Aldrig';
  try {
    const diff = Date.now() - new Date(s.replace(' ', 'T')).getTime();
    const min = Math.floor(diff / 60_000);
    if (min < 2)   return t.customers.table.lastSeen === 'Last Active' ? 'Just now' : 'Just nu';
    if (min < 60)  return `${min} min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24)  return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `${days}d`;
    return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' })
      .format(new Date(s.replace(' ', 'T')));
  } catch { return s.slice(0, 10); }
};

const fmtTime = (s) => {
  if (!s) return '';
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(s.replace(' ', 'T')));
  } catch { return ''; }
};

function portalUrl(token) {
  return `${window.location.origin}/portal/${token}`;
}

function CustomerModal({ initial, onSave, onClose }) {
  const { t } = useLanguage();
  const [name,  setName]  = useState(initial?.customer_name  ?? '');
  const [phone, setPhone] = useState(initial?.customer_phone ?? '');
  const [email, setEmail] = useState(initial?.customer_email ?? '');
  const [notes, setNotes] = useState(initial?.notes          ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    await onSave({ customer_name: name.trim(), customer_phone: phone.trim() || null,
                   customer_email: email.trim() || null, notes: notes.trim() || null });
    setSaving(false);
  }

  const isEdit = Boolean(initial);
  const cm = t.customers.modal;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: WHITE, borderRadius: 12, width: '100%', maxWidth: 460,
        boxShadow: '0 20px 60px rgba(0,0,0,0.16)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px 16px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontFamily: OUTFIT, fontSize: 15, fontWeight: 700, color: TEXT }}>
            {isEdit ? cm.editHeading : cm.addHeading}
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, padding: 4 }}>
            ×
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {[
            { label: cm.name, value: name, onChange: setName, placeholder: 'IKEA Sverige AB' },
            { label: cm.phone, value: phone, onChange: setPhone, placeholder: '070-123 456 78' },
            { label: cm.email, value: email, onChange: setEmail, placeholder: 'inkop@foretag.se' },
          ].map(({ label, value, onChange, placeholder }) => (
            <label key={label} style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, color: MUTED,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                {label}
              </div>
              <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                style={{
                  width: '100%', fontFamily: OUTFIT, fontSize: 13, color: TEXT,
                  background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                  padding: '9px 12px', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = AMBER; }}
                onBlur={(e)  => { e.target.style.borderColor = BORDER; }}
              />
            </label>
          ))}
          <label style={{ display: 'block', marginBottom: 20 }}>
            <div style={{ fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, color: MUTED,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
              {cm.notes}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={cm.notesPlaceholder}
              rows={2}
              style={{
                width: '100%', fontFamily: OUTFIT, fontSize: 13, color: TEXT,
                background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: '9px 12px', resize: 'vertical', outline: 'none',
                boxSizing: 'border-box', lineHeight: 1.5,
              }}
              onFocus={(e) => { e.target.style.borderColor = AMBER; }}
              onBlur={(e)  => { e.target.style.borderColor = BORDER; }}
            />
          </label>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose}
              style={{
                fontFamily: OUTFIT, fontSize: 12, fontWeight: 500,
                background: WHITE, color: MUTED, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
              }}>
              {cm.cancel}
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              style={{
                fontFamily: OUTFIT, fontSize: 12, fontWeight: 600,
                background: name.trim() ? AMBER : BORDER,
                color: name.trim() ? TEXT : FAINT,
                border: 'none', borderRadius: 8, padding: '10px 24px',
                cursor: name.trim() ? 'pointer' : 'default',
              }}>
              {saving ? cm.saving : isEdit ? cm.save : cm.create}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerDetail({ customer, onClose, onEdit, onDelete }) {
  const { t } = useLanguage();
  const cd = t.customers.detail;
  const [tab,       setTab]       = useState('messages');
  const [messages,  setMessages]  = useState(null);
  const [activity,  setActivity]  = useState(null);
  const [inquiries, setInquiries] = useState(null);
  const [msgInput,  setMsgInput]  = useState('');
  const [sending,   setSending]   = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (tab === 'messages' && messages === null) {
      apiFetch(`/api/customers/${customer.id}/messages`)
        .then((r) => r.json()).then(setMessages).catch(() => setMessages([]));
    }
    if (tab === 'activity' && activity === null) {
      apiFetch(`/api/customers/${customer.id}/activity`)
        .then((r) => r.json()).then(setActivity).catch(() => setActivity([]));
    }
    if (tab === 'inquiries' && inquiries === null) {
      apiFetch(`/api/customers/${customer.id}/inquiries`)
        .then((r) => r.json()).then(setInquiries).catch(() => setInquiries([]));
    }
  }, [tab, customer.id, messages, activity, inquiries]);

  async function sendMsg() {
    if (!msgInput.trim() || sending) return;
    setSending(true);
    try {
      const r = await apiFetch(`/api/customers/${customer.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: msgInput.trim() }),
      });
      const msg = await r.json();
      setMessages((prev) => [...(prev ?? []), msg]);
      setMsgInput('');
    } catch { /* silent */ } finally { setSending(false); }
  }

  function copyLink() {
    navigator.clipboard.writeText(portalUrl(customer.token)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const TABS = [
    { id: 'messages',  label: cd.messages },
    { id: 'inquiries', label: cd.inquiries(customer.pending_inquiries) },
    { id: 'activity',  label: cd.activity },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.35)', cursor: 'pointer' }} />
      <div style={{
        width: 480, background: WHITE,
        borderLeft: `1px solid ${BORDER}`,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.10)',
        overflowY: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: OUTFIT, fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 3 }}>
                {customer.customer_name}
              </div>
              {customer.customer_phone && (
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>{customer.customer_phone}</div>
              )}
              {customer.customer_email && (
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>{customer.customer_email}</div>
              )}
            </div>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, padding: 4 }}>
              ×
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
            {[
              { label: cd.stats.quotes,   value: customer.quote_count },
              { label: 'YTD',             value: fmtSEK(customer.ytd_spend) },
              { label: cd.stats.lastSeen, value: fmtRelTime(customer.last_seen_at, t) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontFamily: OUTFIT, fontSize: 10, color: FAINT,
                  textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, color: TEXT }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={copyLink} style={{
              fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
              background: copied ? '#e8fdf0' : BG,
              color: copied ? '#16a34a' : TEXT,
              border: `1px solid ${copied ? '#16a34a' : BORDER}`,
              borderRadius: 8, padding: '7px 14px', cursor: 'pointer', transition: 'all 0.2s',
            }}>
              {copied ? cd.linkCopied : cd.copyLink}
            </button>
            <button onClick={() => onEdit(customer)} style={{
              fontFamily: OUTFIT, fontSize: 11, fontWeight: 500,
              background: WHITE, color: MUTED,
              border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '7px 14px', cursor: 'pointer',
            }}>
              {t.customers.edit}
            </button>
            {confirmDelete ? (
              <>
                <button onClick={() => onDelete(customer.id)} style={{
                  fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                  background: '#fff0f0', color: '#e74c3c',
                  border: '1px solid #fca5a5', borderRadius: 8,
                  padding: '7px 14px', cursor: 'pointer',
                }}>
                  {cd.confirmDelete}
                </button>
                <button onClick={() => setConfirmDelete(false)} style={{
                  fontFamily: OUTFIT, fontSize: 11,
                  background: 'none', color: MUTED,
                  border: 'none', padding: '7px 8px', cursor: 'pointer',
                }}>
                  {t.customers.modal.cancel}
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} style={{
                fontFamily: OUTFIT, fontSize: 11,
                background: 'none', color: '#e74c3c',
                border: 'none', padding: '7px 8px', cursor: 'pointer',
              }}>
                {t.customers.delete}
              </button>
            )}
          </div>

          {customer.notes && (
            <div style={{
              marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: 6, padding: '8px 12px',
              fontFamily: OUTFIT, fontSize: 12, color: '#92400e', lineHeight: 1.5,
            }}>
              {customer.notes}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              fontFamily: OUTFIT, fontSize: 12, fontWeight: tab === id ? 600 : 400,
              color: tab === id ? AMBER : MUTED,
              background: 'none', border: 'none',
              borderBottom: tab === id ? `2px solid ${AMBER}` : '2px solid transparent',
              padding: '10px 16px', cursor: 'pointer', marginBottom: -1,
            }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Messages */}
          {tab === 'messages' && (
            <>
              <div style={{ flex: 1, padding: '16px 24px', display: 'flex',
                flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                {messages === null ? (
                  <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, padding: '24px 0', textAlign: 'center' }}>
                    {t.customers.loading}
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, padding: '24px 0', textAlign: 'center' }}>
                    {cd.noMessages}
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOut = msg.direction === 'out';
                    return (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column',
                        alignItems: isOut ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '80%',
                          background: isOut ? AMBER : BG,
                          color: isOut ? TEXT : TEXT,
                          borderRadius: isOut ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                          padding: '9px 13px',
                          fontFamily: OUTFIT, fontSize: 12, lineHeight: 1.5,
                        }}>
                          {msg.body}
                        </div>
                        <div style={{ fontFamily: OUTFIT, fontSize: 10, color: FAINT, marginTop: 3 }}>
                          {isOut ? (msg.sender_name ?? t.customers.detail.msgSend) : customer.customer_name} · {fmtTime(msg.created_at)}
                          {isOut && msg.read_at && ` · ${t.customers.read}`}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 16px',
                display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                <textarea
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                  placeholder={cd.msgPlaceholder}
                  rows={2}
                  style={{
                    flex: 1, fontFamily: OUTFIT, fontSize: 12, color: TEXT,
                    background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                    padding: '8px 12px', resize: 'none', outline: 'none', lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={sendMsg}
                  disabled={sending || !msgInput.trim()}
                  style={{
                    fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                    background: msgInput.trim() ? AMBER : BORDER,
                    color: msgInput.trim() ? TEXT : FAINT,
                    border: 'none', borderRadius: 8, padding: '9px 16px',
                    cursor: msgInput.trim() ? 'pointer' : 'default', flexShrink: 0,
                  }}>
                  {sending ? cd.msgSending : cd.msgSend}
                </button>
              </div>
            </>
          )}

          {/* Inquiries */}
          {tab === 'inquiries' && (
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {inquiries === null ? (
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, textAlign: 'center', padding: '24px 0' }}>
                  {t.customers.loading}
                </div>
              ) : inquiries.length === 0 ? (
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, textAlign: 'center', padding: '24px 0' }}>
                  {cd.noInquiries}
                </div>
              ) : (
                inquiries.map((inq) => (
                  <div key={inq.id} style={{
                    background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                    padding: '12px 16px',
                  }}>
                    <div style={{ fontFamily: OUTFIT, fontSize: 12, color: TEXT,
                      lineHeight: 1.6, marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                      {inq.body}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: OUTFIT, fontSize: 10, color: FAINT }}>
                        {fmtTime(inq.created_at)}
                      </span>
                      {inq.quote_id ? (
                        <span style={{
                          fontFamily: OUTFIT, fontSize: 10, fontWeight: 600,
                          background: '#e8fdf0', color: '#16a34a',
                          padding: '2px 8px', borderRadius: 10,
                        }}>
                          {t.customers.inquiryCreated}
                        </span>
                      ) : (
                        <span style={{
                          fontFamily: OUTFIT, fontSize: 10, fontWeight: 600,
                          background: '#fff7ed', color: '#d97706',
                          padding: '2px 8px', borderRadius: 10,
                        }}>
                          {t.customers.inquiryPending}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Activity */}
          {tab === 'activity' && (
            <div style={{ padding: '16px 24px' }}>
              {activity === null ? (
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, textAlign: 'center', padding: '24px 0' }}>
                  {t.customers.loading}
                </div>
              ) : activity.length === 0 ? (
                <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED, textAlign: 'center', padding: '24px 0' }}>
                  {cd.noActivity}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {activity.map((ev, i) => (
                    <div key={ev.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 0',
                      borderBottom: i < activity.length - 1 ? `1px solid ${BORDER}` : 'none',
                    }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: AMBER, flexShrink: 0, marginTop: 5,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: OUTFIT, fontSize: 12, color: TEXT }}>{ev.event}</div>
                        <div style={{ fontFamily: OUTFIT, fontSize: 10, color: FAINT, marginTop: 1 }}>
                          {fmtTime(ev.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export function Customers() {
  const { t } = useLanguage();
  const [customers,  setCustomers]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [search,     setSearch]     = useState('');
  const [copied,     setCopied]     = useState(null);

  const load = useCallback(() => {
    apiFetch('/api/customers')
      .then((r) => r.json())
      .then((data) => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(fields) {
    const r = await apiFetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const created = await r.json();
    if (created.id) {
      setCustomers((prev) => [created, ...prev]);
      setShowAdd(false);
    }
  }

  async function handleEdit(fields) {
    await apiFetch(`/api/customers/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    setCustomers((prev) => prev.map((c) =>
      c.id === editTarget.id ? { ...c, ...fields } : c
    ));
    if (selected?.id === editTarget.id) setSelected((prev) => ({ ...prev, ...fields }));
    setEditTarget(null);
  }

  async function handleDelete(id) {
    await apiFetch(`/api/customers/${id}`, { method: 'DELETE' });
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    setSelected(null);
  }

  function copyLink(e, token) {
    e.stopPropagation();
    navigator.clipboard.writeText(portalUrl(token)).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.customer_name?.toLowerCase().includes(q)
              || c.customer_phone?.includes(q)
              || c.customer_email?.toLowerCase().includes(q);
  });

  const tc = t.customers;

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: BG, padding: '28px 32px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: OUTFIT, fontSize: 22, fontWeight: 700, color: TEXT,
            margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            {tc.heading}
          </h1>
          <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, margin: 0 }}>
            {tc.portalsCount(customers.length)}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
            background: AMBER, color: TEXT,
            border: 'none', borderRadius: 8, padding: '10px 20px',
            cursor: 'pointer', transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = AMBER_DK; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = AMBER; }}
        >
          {tc.add}
        </button>
      </div>

      {customers.length > 0 && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: tc.kpis.total,    value: String(customers.length) },
            { label: tc.kpis.ytd,      value: fmtSEK(customers.reduce((s, c) => s + (c.ytd_spend || 0), 0)) },
            { label: tc.kpis.messages, value: String(customers.reduce((s, c) => s + (c.unread_messages || 0), 0)) },
            { label: tc.kpis.pending,  value: String(customers.reduce((s, c) => s + (c.pending_inquiries || 0), 0)) },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10,
              padding: '14px 18px', flex: 1, minWidth: 120,
            }}>
              <div style={{ fontFamily: OUTFIT, fontSize: 10, fontWeight: 600, color: MUTED,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: OUTFIT, fontSize: 20, fontWeight: 700, color: TEXT }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {customers.length > 3 && (
        <div style={{ marginBottom: 16 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tc.search}
            style={{
              width: 280, fontFamily: OUTFIT, fontSize: 13, color: TEXT,
              background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '8px 14px', outline: 'none',
            }}
            onFocus={(e) => { e.target.style.borderColor = AMBER; }}
            onBlur={(e)  => { e.target.style.borderColor = BORDER; }}
          />
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, padding: '48px 0', textAlign: 'center' }}>
          {tc.loading}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '64px 24px', textAlign: 'center',
        }}>
          <div style={{ fontFamily: OUTFIT, fontSize: 16, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
            {customers.length === 0 ? tc.noCustomers : tc.noMatch}
          </div>
          <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, marginBottom: 24 }}>
            {customers.length === 0 ? tc.noCustomersDesc : tc.search}
          </div>
          {customers.length === 0 && (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
                background: AMBER, color: TEXT,
                border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer',
              }}>
              {tc.addFirst}
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: SURF }}>
                {[tc.table.name, tc.table.contact, tc.table.lastSeen,
                  tc.table.quotes, tc.table.ytd, tc.table.messages, ''].map((col) => (
                  <th key={col} style={{
                    fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, color: MUTED,
                    textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em',
                    padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const hasUnread  = c.unread_messages > 0;
                const hasPending = c.pending_inquiries > 0;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    style={{
                      cursor: 'pointer',
                      borderBottom: i < filtered.length - 1 ? `1px solid ${BORDER}` : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = BG; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, color: TEXT }}>
                        {c.customer_name}
                      </div>
                      {c.notes && (
                        <div style={{ fontFamily: OUTFIT, fontSize: 11, color: FAINT, marginTop: 2,
                          maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.notes}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
                        {c.customer_phone ?? c.customer_email ?? '—'}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontFamily: OUTFIT, fontSize: 12,
                        color: c.last_seen_at ? TEXT : FAINT }}>
                        {fmtRelTime(c.last_seen_at, t)}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontFamily: OUTFIT, fontSize: 13, fontWeight: 600, color: TEXT }}>
                        {c.quote_count}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontFamily: OUTFIT, fontSize: 12, color: TEXT }}>
                        {fmtSEK(c.ytd_spend)}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {hasUnread && (
                          <span style={{
                            fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                            background: '#fff7ed', color: '#d97706',
                            padding: '3px 10px', borderRadius: 20,
                          }}>
                            {tc.unread(c.unread_messages)}
                          </span>
                        )}
                        {hasPending && (
                          <span style={{
                            fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
                            background: 'rgba(201,146,30,0.10)', color: AMBER,
                            padding: '3px 10px', borderRadius: 20,
                          }}>
                            {tc.pendingInquiry(c.pending_inquiries)}
                          </span>
                        )}
                        {!hasUnread && !hasPending && (
                          <span style={{ fontFamily: OUTFIT, fontSize: 11, color: FAINT }}>
                            {c.total_messages > 0 ? tc.totalMsg(c.total_messages) : '—'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        onClick={(e) => copyLink(e, c.token)}
                        style={{
                          fontFamily: OUTFIT, fontSize: 11, fontWeight: 500,
                          background: copied === c.token ? '#e8fdf0' : WHITE,
                          color: copied === c.token ? '#16a34a' : MUTED,
                          border: `1px solid ${BORDER}`, borderRadius: 6,
                          padding: '5px 10px', cursor: 'pointer',
                          whiteSpace: 'nowrap', transition: 'all 0.2s',
                        }}>
                        {copied === c.token ? tc.detail.linkCopied : tc.copyLink}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <CustomerDetail
          customer={selected}
          onClose={() => setSelected(null)}
          onEdit={(c) => { setSelected(null); setEditTarget(c); }}
          onDelete={handleDelete}
        />
      )}

      {showAdd && (
        <CustomerModal onSave={handleAdd} onClose={() => setShowAdd(false)} />
      )}

      {editTarget && (
        <CustomerModal initial={editTarget} onSave={handleEdit} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}
