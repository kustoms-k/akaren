import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { apiFetch }     from '../utils/apiFetch.js';
import { useAuth }      from '../context/AuthContext.jsx';
import { useSync }      from '../context/SyncContext.jsx';
import { useLanguage }  from '../context/LanguageContext.jsx';
import { db }           from '../db/dexie.js';
import { generateDpa }  from '../utils/generateDpa.js';
import { generateTos }  from '../utils/generateTos.js';

const OUTFIT  = "'Outfit', system-ui, sans-serif";
const INTER   = OUTFIT;  // alias — remove after full migration
const AMBER   = '#c9921e';
const BLUE    = AMBER;   // alias
const BLUE_DK = '#a87818';
const BG      = '#edeae1';
const WHITE   = '#ffffff';
const BORDER  = '#cfc9bb';
const TEXT    = '#151210';
const MUTED   = '#6a6050';
const SURF    = '#f4f0e7';
const MONO    = "'DM Mono', monospace";

function SmsStatusPill({ enabled }) {
  const { t } = useLanguage();
  if (enabled === null) return null;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 12px',
      background: enabled ? 'rgba(46,204,113,0.08)' : SURF,
      border: `1px solid ${enabled ? 'rgba(46,204,113,0.3)' : BORDER}`,
      borderRadius: 20,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: enabled ? '#2ecc71' : '#adb5bd',
      }} />
      <span style={{ fontFamily: INTER, fontSize: 12, color: enabled ? '#1a7a47' : MUTED }}>
        {enabled ? t.settings.drivers.smsEnabled : t.settings.drivers.smsDisabled}
      </span>
    </div>
  );
}

function DriverRow({ driver }) {
  const { enqueue } = useSync();
  const { t } = useLanguage();
  const [name,   setName]   = useState(driver.name);
  const [phone,  setPhone]  = useState(driver.phone);
  const [saving, setSaving] = useState(false);
  const [flash,  setFlash]  = useState(false);

  const dirty = name !== driver.name || phone !== driver.phone;

  async function handleSave() {
    if (!name.trim() || !phone.trim() || saving) return;
    setSaving(true);
    try {
      await enqueue({
        endpoint:   `/api/drivers/${driver.id}`,
        method:     'PATCH',
        body:       { name: name.trim(), phone: phone.trim() },
        localTable: 'drivers',
        localData:  { ...driver, name: name.trim(), phone: phone.trim() },
      });
      setFlash(true);
      setTimeout(() => setFlash(false), 1800);
    } catch (e) {
      console.error('[Settings] Driver save failed:', e.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    fontFamily: INTER, fontSize: 13, color: TEXT,
    background: WHITE, border: `1px solid ${BORDER}`,
    borderRadius: 6, padding: '6px 10px',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
      <td style={{ padding: '10px 14px', fontFamily: INTER, fontSize: 12, color: BLUE, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {driver.truck_id}
      </td>
      <td style={{ padding: '8px 14px', width: '30%' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          style={inputStyle}
        />
      </td>
      <td style={{ padding: '8px 14px', width: '30%' }}>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="+46701234001"
          style={inputStyle}
        />
      </td>
      <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {flash ? (
          <span style={{ fontFamily: INTER, fontSize: 12, color: '#2ecc71', fontWeight: 600 }}>
            {t.settings.drivers.saved}
          </span>
        ) : (
          <button
            onClick={handleSave}
            disabled={!dirty || saving || !name.trim() || !phone.trim()}
            style={{
              fontFamily: INTER, fontSize: 12, fontWeight: 600,
              padding: '5px 14px', borderRadius: 6, border: 'none',
              background: (!dirty || !name.trim() || !phone.trim()) ? SURF : BLUE,
              color: (!dirty || !name.trim() || !phone.trim()) ? MUTED : WHITE,
              cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {saving ? '…' : t.settings.drivers.save}
          </button>
        )}
      </td>
    </tr>
  );
}

const STATUS_META = {
  active:   { label: 'Aktiv',        color: '#1a7a47', bg: 'rgba(46,204,113,0.08)', border: 'rgba(46,204,113,0.3)',  dot: '#2ecc71' },
  trialing: { label: 'Provperiod',   color: '#92400e', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', dot: '#f59e0b' },
  past_due: { label: 'Förfallen',    color: '#991b1b', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',  dot: '#ef4444' },
  canceled: { label: 'Avslutad',     color: '#6b6574', bg: '#f5f3ee',               border: '#e6e2da',              dot: '#a09aa8' },
  none:     { label: 'Ej aktiv',     color: '#6b6574', bg: '#f5f3ee',               border: '#e6e2da',              dot: '#a09aa8' },
};

function BillingCard() {
  const { t } = useLanguage();
  const [sub,      setSub]      = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    apiFetch('/api/stripe/status')
      .then((r) => r.json())
      .then(setSub)
      .catch(() => setSub({ status: 'none', stripe_enabled: false }))
      .finally(() => setLoading(false));
  }, []);

  const fmtDate = (s) => {
    if (!s) return '—';
    try { return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' }).format(new Date(s)); }
    catch { return s; }
  };

  async function handleCheckout() {
    setActing(true); setError(null);
    try {
      const r = await apiFetch('/api/stripe/checkout', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (e) {
      setError(e.message);
      setActing(false);
    }
  }

  async function handlePortal() {
    setActing(true); setError(null);
    try {
      const r = await apiFetch('/api/stripe/portal', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (e) {
      setError(e.message);
      setActing(false);
    }
  }

  const status = sub?.status ?? 'none';
  const meta   = STATUS_META[status] ?? STATUS_META.none;
  const isActive = status === 'active' || status === 'trialing';

  const OUTFIT = "'Outfit', system-ui, sans-serif";
  const AMBER  = '#c9a84c';
  const BG2    = '#f5f3ee';
  const TEXT2  = '#17161a';
  const MUTED2 = '#6b6574';
  const BORD   = '#e6e2da';

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: OUTFIT, fontSize: 13, color: MUTED2, textAlign: 'center' }}>
        Laddar…
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: OUTFIT, fontSize: 15, fontWeight: 700, color: TEXT2, marginBottom: 4 }}>
            Åkaren TMS
          </div>
          <div style={{ fontFamily: OUTFIT, fontSize: 22, fontWeight: 700, color: AMBER }}>
            {t.settings.billing.price}
          </div>
          <div style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED2, marginTop: 4 }}>
            {t.settings.billing.plan}
          </div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 12px',
          background: meta.bg, border: `1px solid ${meta.border}`,
          borderRadius: 20, flexShrink: 0,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.dot, flexShrink: 0 }} />
          <span style={{ fontFamily: OUTFIT, fontSize: 12, color: meta.color, fontWeight: 500 }}>
            {meta.label}
          </span>
        </div>
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
        <div style={{ background: BG2, border: `1px solid ${BORD}`, borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED2, marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t.settings.billing.renewal}
          </div>
          <div style={{ fontFamily: OUTFIT, fontSize: 14, color: TEXT2, fontWeight: 600 }}>
            {fmtDate(sub?.renews_at)}
          </div>
        </div>
        <div style={{ background: BG2, border: `1px solid ${BORD}`, borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED2, marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Betalningsmetod
          </div>
          <div style={{ fontFamily: OUTFIT, fontSize: 14, color: TEXT2, fontWeight: 600 }}>
            {isActive ? 'Kort / kortbetalning' : '—'}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${BORD}`, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isActive && sub?.stripe_enabled && (
          <button
            onClick={handleCheckout}
            disabled={acting}
            style={{
              fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
              padding: '8px 20px', borderRadius: 7, border: 'none',
              background: AMBER, color: TEXT2, cursor: acting ? 'not-allowed' : 'pointer',
              opacity: acting ? 0.7 : 1,
            }}
          >
            {acting ? '…' : 'Starta prenumeration'}
          </button>
        )}

        {isActive && (
          <button
            onClick={handlePortal}
            disabled={acting}
            style={{
              fontFamily: OUTFIT, fontSize: 13, fontWeight: 500,
              padding: '8px 20px', borderRadius: 7,
              border: `1px solid ${BORD}`,
              background: '#fff', color: TEXT2,
              cursor: acting ? 'not-allowed' : 'pointer',
              opacity: acting ? 0.7 : 1,
            }}
          >
            {acting ? '…' : 'Hantera prenumeration'}
          </button>
        )}

        {!sub?.stripe_enabled && (
          <p style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED2, margin: 0 }}>
            Kontakta <a href="mailto:admin@akaren.se" style={{ color: AMBER }}>admin@akaren.se</a> för att hantera din prenumeration.
          </p>
        )}

        {error && (
          <p style={{ fontFamily: OUTFIT, fontSize: 12, color: '#e74c3c', margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function FortnoxPanel({ toast, setToast }) {
  const { t } = useLanguage();
  const [status,        setStatus]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [connecting,    setConnecting]    = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(() => {
    apiFetch('/api/fortnox/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const r = await apiFetch('/api/fortnox/connect-url');
      if (!r.ok) throw new Error((await r.json()).error);
      const { url } = await r.json();
      window.location.href = url;
    } catch (e) {
      setToast?.({ message: `Kunde inte starta anslutning: ${e.message}`, variant: 'error' });
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await apiFetch('/api/fortnox/sync-customers', { method: 'POST' });
      if (!r.ok) throw new Error((await r.json()).error);
      const { synced } = await r.json();
      setToast?.({ message: `${synced} kunder synkade / ${synced} customers synced`, variant: 'success' });
      fetchStatus();
    } catch (e) {
      setToast?.({ message: `Synk misslyckades: ${e.message}`, variant: 'error' });
    } finally { setSyncing(false); }
  }

  async function handleDisconnect() {
    if (!window.confirm('Koppla från Fortnox? / Disconnect from Fortnox?')) return;
    setDisconnecting(true);
    try {
      const r = await apiFetch('/api/fortnox/disconnect', { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error);
      setToast?.({ message: 'Fortnox frånkopplad / Fortnox disconnected', variant: 'success' });
      fetchStatus();
    } catch (e) {
      setToast?.({ message: `Frånkoppling misslyckades: ${e.message}`, variant: 'error' });
    } finally { setDisconnecting(false); }
  }

  const fmtDate = (s) => {
    if (!s) return '—';
    try { return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s)); }
    catch { return s; }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: INTER, fontSize: 13, color: MUTED, textAlign: 'center' }}>
        Laddar…
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 12px',
          background: status?.connected ? 'rgba(46,204,113,0.08)' : SURF,
          border: `1px solid ${status?.connected ? 'rgba(46,204,113,0.3)' : BORDER}`,
          borderRadius: 20,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: status?.connected ? '#2ecc71' : '#adb5bd',
          }} />
          <span style={{ fontFamily: INTER, fontSize: 12, color: status?.connected ? '#1a7a47' : MUTED }}>
            {status?.connected ? t.settings.fortnox.connected : t.settings.fortnox.notConnected}
          </span>
        </div>

        {!status?.connected && (
          <button
            onClick={handleConnect}
            disabled={connecting}
            style={{
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              padding: '7px 16px', borderRadius: 6, border: 'none',
              background: BLUE, color: WHITE, cursor: 'pointer',
            }}
          >
            {connecting ? '…' : t.settings.fortnox.connect}
          </button>
        )}
      </div>

      {status?.connected && (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
            marginBottom: 16,
          }}>
            {[
              { label: t.settings.fortnox.connectedAt, value: fmtDate(status.connected_at) },
              { label: t.settings.fortnox.lastSync,    value: fmtDate(status.last_sync) },
              { label: t.settings.fortnox.customers,   value: status.customer_count ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: BG, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: '10px 14px',
              }}>
                <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED, marginBottom: 4, fontWeight: 500 }}>
                  {label}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 14, color: TEXT, fontWeight: 600 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                fontFamily: INTER, fontSize: 13, fontWeight: 500,
                padding: '7px 16px', borderRadius: 6,
                border: `1px solid ${BORDER}`, background: WHITE,
                color: TEXT, cursor: 'pointer',
              }}
            >
              {syncing ? t.settings.fortnox.syncing : t.settings.fortnox.syncBtn}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                fontFamily: INTER, fontSize: 13, fontWeight: 500,
                padding: '7px 16px', borderRadius: 6,
                border: '1px solid rgba(231,76,60,0.3)',
                background: 'rgba(231,76,60,0.06)',
                color: '#e74c3c', cursor: 'pointer',
              }}
            >
              {disconnecting ? '…' : t.settings.fortnox.disconnect}
            </button>
          </div>
        </>
      )}

      <p style={{ fontFamily: INTER, fontSize: 12, color: MUTED, margin: '14px 0 0', lineHeight: 1.6 }}>
        {t.settings.fortnox.note}
      </p>
    </div>
  );
}

export function Settings({ onFortnoxResult }) {
  const { user, company } = useAuth();
  const { t } = useLanguage();
  const [smsEnabled, setSmsEnabled] = useState(null);
  const [toast,      setToast]      = useState(null);

  const drivers = useLiveQuery(() => db.drivers.orderBy('truck_id').toArray(), [], null) ?? [];
  const loading = useLiveQuery(() => db.drivers.count(), [], null) === null;

  useEffect(() => {
    apiFetch('/api/drivers/sms-status')
      .then((r) => r.json())
      .then((s) => setSmsEnabled(Boolean(s?.enabled)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (onFortnoxResult) setToast(onFortnoxResult);
  }, [onFortnoxResult]);

  const section = {
    background: WHITE,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    marginBottom: 20,
  };
  const sectionHead = {
    padding: '14px 20px',
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 16, flexWrap: 'wrap',
    background: SURF,
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px', background: BG }}>
      <h1 style={{
        fontFamily: INTER, fontSize: 20, fontWeight: 700,
        color: TEXT, margin: '0 0 24px',
      }}>
        {t.settings.heading}
      </h1>

      {toast && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 8,
          background: toast.variant === 'success' ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)',
          border: `1px solid ${toast.variant === 'success' ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}`,
          fontFamily: INTER, fontSize: 13,
          color: toast.variant === 'success' ? '#1a7a47' : '#e74c3c',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {user?.role === 'agare' && (
        <div style={section}>
          <div style={sectionHead}>
            <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>
              {t.settings.billing.heading}
            </span>
            <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>2 990 kr/mån</span>
          </div>
          <BillingCard />
        </div>
      )}

      {(user?.role === 'agare' || user?.role === 'ekonomi') && (
        <div style={section}>
          <div style={sectionHead}>
            <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>
              {t.settings.fortnox.heading}
            </span>
            <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>Fortnox</span>
          </div>
          <FortnoxPanel toast={toast} setToast={setToast} />
        </div>
      )}

      {user?.role === 'agare' && <UsersPanel section={section} sectionHead={sectionHead} setToast={setToast} />}

      {(user?.role === 'agare' || user?.role === 'revisor') && (
        <AuditPanel section={section} sectionHead={sectionHead} />
      )}

      {user?.role === 'agare' && (
        <ExportPanel section={section} sectionHead={sectionHead} />
      )}

      <div style={section}>
        <div style={sectionHead}>
          <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>
            {t.settings.drivers.heading}
          </span>
          <SmsStatusPill enabled={smsEnabled} />
        </div>

        {loading ? (
          <div style={{ padding: 32, fontFamily: INTER, fontSize: 13, color: MUTED, textAlign: 'center' }}>
            Laddar…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: SURF, borderBottom: `1px solid ${BORDER}` }}>
                  {[t.settings.drivers.truck, t.settings.drivers.name, t.settings.drivers.phone, ''].map((h) => (
                    <th key={h} style={{
                      padding: '9px 14px', textAlign: h === '' ? 'right' : 'left',
                      fontFamily: INTER, fontSize: 11, fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED,
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <DriverRow key={d.id} driver={d} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '10px 20px 12px', borderTop: `1px solid ${BORDER}` }}>
          <p style={{ fontFamily: INTER, fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.6 }}>
            Telefonnummer måste vara i E.164-format (t.ex. <code style={{ fontFamily: 'monospace', color: TEXT }}>+46701234001</code>).
            Ändringar träder i kraft direkt på nästa uppdrag.
          </p>
        </div>
      </div>

      {/* ── Legal ─────────────────────────────────────────────────────────── */}
      <div style={section}>
        <div style={sectionHead}>
          <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>
            {t.settings.legal.heading}
          </span>
          <span style={{
            fontFamily: INTER, fontSize: 11, fontWeight: 500,
            padding: '3px 10px', borderRadius: 20,
            background: user?.tos_accepted_at ? 'rgba(46,204,113,0.08)' : 'rgba(245,158,11,0.08)',
            border: `1px solid ${user?.tos_accepted_at ? 'rgba(46,204,113,0.3)' : 'rgba(245,158,11,0.3)'}`,
            color: user?.tos_accepted_at ? '#1a7a47' : '#92400e',
          }}>
            {user?.tos_accepted_at
              ? t.settings.legal.tosAccepted(new Date(user.tos_accepted_at).toLocaleDateString('sv-SE'))
              : t.settings.legal.tosNotAccepted}
          </span>
        </div>

        <div style={{ padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6, maxWidth: 560 }}>
            {t.settings.legal.desc}
          </p>

          {/* Document rows */}
          {[
            {
              title:    t.settings.legal.dpa.title,
              subtitle: t.settings.legal.dpa.subtitle,
              desc:     t.settings.legal.dpa.desc,
              onClick:  () => generateDpa(company, user),
            },
            {
              title:    t.settings.legal.tos.title,
              subtitle: t.settings.legal.tos.subtitle('2026-05-17'),
              desc:     t.settings.legal.tos.desc,
              onClick:  () => generateTos(company, user),
            },
          ].map(({ title, subtitle, desc, onClick }) => (
            <div
              key={title}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 16, padding: '14px 16px',
                background: SURF, border: `1px solid ${BORDER}`,
                borderRadius: 10,
              }}
            >
              <div>
                <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>
                  {title}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 11, color: '#6366f1', fontWeight: 500, marginTop: 1 }}>
                  {subtitle}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                  {desc}
                </div>
              </div>
              <button
                onClick={onClick}
                style={{
                  flexShrink: 0,
                  fontFamily: INTER, fontSize: 12, fontWeight: 600,
                  padding: '8px 16px', borderRadius: 7,
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(99,102,241,0.22)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.settings.legal.downloadPdf}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shared label maps ────────────────────────────────────────────────────────
const ENTITY_LABELS = {
  quote:           'Offert',
  job:             'Uppdrag',
  fleet:           'Fordon',
  driver:          'Förare',
  invoice:         'Faktura',
  template:        'Mall',
  customer:        'Kund',
  financial_report:'Finansrapport',
  customer_portal: 'Kundportal',
};

const ACTION_LABELS = {
  create: 'Skapad',
  update: 'Uppdaterad',
  delete: 'Raderad',
  view:   'Visad',
};

const ACTION_COLORS = {
  create: { bg: 'rgba(30,120,80,0.10)',   color: '#1E7A50', border: 'rgba(30,120,80,0.25)'   },
  update: { bg: 'rgba(44,95,191,0.10)',   color: '#2C5FBF', border: 'rgba(44,95,191,0.25)'   },
  delete: { bg: 'rgba(168,36,36,0.10)',   color: '#A82424', border: 'rgba(168,36,36,0.25)'   },
  view:   { bg: 'rgba(100,100,100,0.08)', color: '#6B6359', border: 'rgba(100,100,100,0.20)' },
};

// ─── Before/After diff view ───────────────────────────────────────────────────
const SKIP_DIFF_KEYS = new Set(['company_id', 'created_at', 'updated_at', 'password_hash', 'invite_token']);

function DiffView({ before, after }) {
  let bObj = null, aObj = null;
  try { bObj = before ? JSON.parse(before) : null; } catch {}
  try { aObj = after  ? JSON.parse(after)  : null; } catch {}

  if (!bObj && !aObj) return <div style={{ padding: '10px 16px', fontFamily: MONO, fontSize: 11, color: MUTED }}>Ingen data</div>;

  const allKeys = [...new Set([
    ...(bObj ? Object.keys(bObj) : []),
    ...(aObj ? Object.keys(aObj) : []),
  ])].filter((k) => !SKIP_DIFF_KEYS.has(k));

  const changed = allKeys.filter((k) => JSON.stringify(bObj?.[k]) !== JSON.stringify(aObj?.[k]));

  if (changed.length === 0 && (bObj || aObj)) {
    return <div style={{ padding: '10px 16px', fontFamily: INTER, fontSize: 11, color: MUTED }}>Inga ändringar i spårade fält.</div>;
  }

  const cellStyle = {
    fontFamily: MONO, fontSize: 11, padding: '3px 8px', borderRadius: 4,
    wordBreak: 'break-all', lineHeight: 1.5,
  };

  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 16px', overflowX: 'auto' }}>
      {bObj && changed.length > 0 && (
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#A82424', marginBottom: 6, textTransform: 'uppercase' }}>
            FÖR
          </div>
          {changed.map((k) => bObj[k] !== undefined ? (
            <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
              <span style={{ ...cellStyle, background: 'rgba(168,36,36,0.08)', color: '#A82424', flexShrink: 0 }}>{k}</span>
              <span style={{ ...cellStyle, background: 'rgba(168,36,36,0.06)', color: '#c46060' }}>
                {JSON.stringify(bObj[k])}
              </span>
            </div>
          ) : (
            <div key={k} style={{ ...cellStyle, color: MUTED, marginBottom: 3 }}>({k} ej satt)</div>
          ))}
        </div>
      )}
      {aObj && changed.length > 0 && (
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#1E7A50', marginBottom: 6, textTransform: 'uppercase' }}>
            EFTER
          </div>
          {changed.map((k) => aObj[k] !== undefined ? (
            <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
              <span style={{ ...cellStyle, background: 'rgba(30,120,80,0.08)', color: '#1E7A50', flexShrink: 0 }}>{k}</span>
              <span style={{ ...cellStyle, background: 'rgba(30,120,80,0.06)', color: '#3a9a68' }}>
                {JSON.stringify(aObj[k])}
              </span>
            </div>
          ) : (
            <div key={k} style={{ ...cellStyle, color: MUTED, marginBottom: 3 }}>({k} raderad)</div>
          ))}
        </div>
      )}
      {!bObj && aObj && (
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#1E7A50', marginBottom: 6, textTransform: 'uppercase' }}>SKAPAD</div>
          {Object.entries(aObj).filter(([k]) => !SKIP_DIFF_KEYS.has(k)).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
              <span style={{ ...cellStyle, background: 'rgba(30,120,80,0.08)', color: '#1E7A50', flexShrink: 0 }}>{k}</span>
              <span style={{ ...cellStyle, background: 'rgba(30,120,80,0.06)', color: '#3a9a68' }}>{JSON.stringify(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AuditPanel ───────────────────────────────────────────────────────────────
function AuditPanel({ section, sectionHead }) {
  const [rows,      setRows]      = useState([]);
  const [total,     setTotal]     = useState(0);
  const [userList,  setUserList]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [expanded,  setExpanded]  = useState(null);
  const [offset,    setOffset]    = useState(0);
  const LIMIT = 30;

  const [fUser,   setFUser]   = useState('');
  const [fEntity, setFEntity] = useState('');
  const [fAction, setFAction] = useState('');
  const [fFrom,   setFFrom]   = useState('');
  const [fTo,     setFTo]     = useState('');

  const filterRef = useRef({ fUser, fEntity, fAction, fFrom, fTo });

  async function load(off = 0) {
    setLoading(true);
    const f = filterRef.current;
    const p = new URLSearchParams({ limit: LIMIT, offset: off });
    if (f.fUser)   p.set('user_id',     f.fUser);
    if (f.fEntity) p.set('entity_type', f.fEntity);
    if (f.fAction) p.set('action',      f.fAction);
    if (f.fFrom)   p.set('date_from',   f.fFrom);
    if (f.fTo)     p.set('date_to',     f.fTo);
    try {
      const r    = await apiFetch(`/api/audit?${p}`);
      const data = await r.json();
      setRows(data.rows  ?? []);
      setTotal(data.total ?? 0);
      setUserList(data.users ?? []);
      setOffset(off);
    } catch {}
    setLoading(false);
  }

  function applyFilters() {
    filterRef.current = { fUser, fEntity, fAction, fFrom, fTo };
    setExpanded(null);
    load(0);
  }

  useEffect(() => { load(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function fmtDate(s) {
    if (!s) return '—';
    try { return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.replace(' ', 'T'))); }
    catch { return s; }
  }

  const selStyle = {
    fontFamily: INTER, fontSize: 12, padding: '6px 8px',
    border: `1px solid ${BORDER}`, borderRadius: 7, background: WHITE, color: TEXT,
    outline: 'none', cursor: 'pointer',
  };
  const inputDateStyle = { ...selStyle, padding: '5px 8px' };

  return (
    <div style={section}>
      <div style={sectionHead}>
        <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>
          Revisionslogg
        </span>
        <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>{total} poster</span>
      </div>

      {/* Filters */}
      <div style={{
        padding: '12px 16px', background: SURF, borderBottom: `1px solid ${BORDER}`,
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end',
      }}>
        <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={selStyle}>
          <option value="">Alla användare</option>
          {userList.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </select>

        <select value={fEntity} onChange={(e) => setFEntity(e.target.value)} style={selStyle}>
          <option value="">Alla entiteter</option>
          {Object.entries(ENTITY_LABELS).map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
          <option value="financial_report">Finansrapport</option>
        </select>

        <select value={fAction} onChange={(e) => setFAction(e.target.value)} style={selStyle}>
          <option value="">Alla åtgärder</option>
          {Object.entries(ACTION_LABELS).map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
        </select>

        <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} style={inputDateStyle} title="Från datum" />
        <input type="date" value={fTo}   onChange={(e) => setFTo(e.target.value)}   style={inputDateStyle} title="Till datum" />

        <button
          onClick={applyFilters}
          style={{
            fontFamily: INTER, fontSize: 12, fontWeight: 600,
            background: TEXT, color: WHITE, border: 'none',
            borderRadius: 7, padding: '7px 16px', cursor: 'pointer',
          }}
        >
          Filtrera
        </button>
        <button
          onClick={() => {
            setFUser(''); setFEntity(''); setFAction(''); setFFrom(''); setFTo('');
            filterRef.current = { fUser: '', fEntity: '', fAction: '', fFrom: '', fTo: '' };
            load(0);
          }}
          style={{
            fontFamily: INTER, fontSize: 12, background: 'none',
            border: `1px solid ${BORDER}`, borderRadius: 7, padding: '7px 12px',
            cursor: 'pointer', color: MUTED,
          }}
        >
          Rensa
        </button>
      </div>

      {loading && (
        <div style={{ padding: 24, fontFamily: INTER, fontSize: 13, color: MUTED, textAlign: 'center' }}>Laddar…</div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ padding: 32, fontFamily: INTER, fontSize: 13, color: MUTED, textAlign: 'center', fontStyle: 'italic' }}>
          Inga poster hittades.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: SURF, borderBottom: `1px solid ${BORDER}` }}>
                {['Tid', 'Användare', 'Åtgärd', 'Enhet', 'IP', ''].map((h) => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left',
                    fontFamily: INTER, fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.05em', textTransform: 'uppercase', color: MUTED,
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const actionCfg = ACTION_COLORS[row.action] ?? ACTION_COLORS.view;
                const isExpanded = expanded === row.id;
                const hasDiff = row.before_value || row.after_value;
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      style={{
                        borderBottom: `1px solid ${isExpanded ? 'transparent' : BORDER}`,
                        background: isExpanded ? SURF : 'transparent',
                        cursor: hasDiff ? 'pointer' : 'default',
                      }}
                      onClick={() => hasDiff && setExpanded(isExpanded ? null : row.id)}
                    >
                      <td style={{ padding: '9px 12px', fontFamily: MONO, fontSize: 11, color: MUTED, whiteSpace: 'nowrap' }}>
                        {fmtDate(row.created_at)}
                      </td>
                      <td style={{ padding: '9px 12px', fontFamily: INTER, fontSize: 12, color: TEXT, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.user_name || row.user_email || '—'}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                          padding: '2px 8px', borderRadius: 20, fontFamily: INTER,
                          background: actionCfg.bg, color: actionCfg.color, border: `1px solid ${actionCfg.border}`,
                        }}>
                          {ACTION_LABELS[row.action] ?? row.action}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px', fontFamily: INTER, fontSize: 12, color: MUTED }}>
                        {ENTITY_LABELS[row.entity_type] ?? row.entity_type}
                        {row.entity_id && <span style={{ fontFamily: MONO, fontSize: 10, marginLeft: 4 }}>#{row.entity_id}</span>}
                      </td>
                      <td style={{ padding: '9px 12px', fontFamily: MONO, fontSize: 10, color: MUTED }}>
                        {row.ip_address ?? '—'}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                        {hasDiff && (
                          <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, userSelect: 'none' }}>
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td colSpan={6} style={{ padding: 0, background: '#faf9f6' }}>
                          <DiffView before={row.before_value} after={row.after_value} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{
          padding: '10px 16px', borderTop: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: SURF,
        }}>
          <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} av {total}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={offset === 0}
              onClick={() => load(Math.max(0, offset - LIMIT))}
              style={{
                fontFamily: INTER, fontSize: 12, padding: '5px 12px',
                border: `1px solid ${BORDER}`, borderRadius: 7, background: WHITE,
                color: offset === 0 ? MUTED : TEXT, cursor: offset === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              ← Föregående
            </button>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => load(offset + LIMIT)}
              style={{
                fontFamily: INTER, fontSize: 12, padding: '5px 12px',
                border: `1px solid ${BORDER}`, borderRadius: 7, background: WHITE,
                color: offset + LIMIT >= total ? MUTED : TEXT, cursor: offset + LIMIT >= total ? 'not-allowed' : 'pointer',
              }}
            >
              Nästa →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ExportPanel ──────────────────────────────────────────────────────────────
function ExportPanel({ section, sectionHead }) {
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const r = await apiFetch('/api/data-privacy/export-all');
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? 'Exportfel'); }
      const blob = await r.blob();
      const cd   = r.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      const name  = match ? match[1] : `akaren-export-${new Date().toISOString().slice(0,10)}.json`;
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={section}>
      <div style={sectionHead}>
        <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>
          Dataexport (GDPR)
        </span>
        <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>Portabilitet</span>
      </div>
      <div style={{ padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6, maxWidth: 520 }}>
          Exportera all företagsdata som en JSON-fil för GDPR-portabilitet.
          Filen innehåller offerter, uppdrag, fakturor, förare, fordon, kunder och revisionslogg.
        </p>

        {error && (
          <div style={{
            background: 'rgba(168,36,36,0.08)', border: '1px solid rgba(168,36,36,0.25)',
            borderRadius: 8, padding: '8px 12px', fontFamily: INTER, fontSize: 12, color: '#A82424',
          }}>
            {error}
          </div>
        )}

        <div>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              background: exporting ? SURF : TEXT,
              color: exporting ? MUTED : WHITE,
              border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 20px',
              cursor: exporting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, transition: 'opacity 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {exporting ? 'Exporterar…' : 'Exportera all data'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── UsersPanel ───────────────────────────────────────────────────────────────
const ROLE_LABELS = {
  agare:        'Ägare',
  trafikledare: 'Trafikledare',
  ekonomi:      'Ekonomi',
  forare:       'Förare',
  revisor:      'Revisor',
};

const ROLE_COLORS = {
  agare:        { bg: 'rgba(168,120,24,0.10)', color: '#A87818', border: 'rgba(168,120,24,0.25)' },
  trafikledare: { bg: 'rgba(44,95,191,0.10)',  color: '#2C5FBF', border: 'rgba(44,95,191,0.25)'  },
  ekonomi:      { bg: 'rgba(30,120,80,0.10)',  color: '#1E7A50', border: 'rgba(30,120,80,0.25)'  },
  forare:       { bg: 'rgba(100,60,180,0.10)', color: '#643CB4', border: 'rgba(100,60,180,0.25)' },
  revisor:      { bg: 'rgba(100,100,100,0.10)',color: '#606060', border: 'rgba(100,100,100,0.25)'},
};

function RoleBadge({ role }) {
  const cfg = ROLE_COLORS[role] ?? ROLE_COLORS.revisor;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      padding: '2px 8px', borderRadius: 20, fontFamily: INTER,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function UsersPanel({ section, sectionHead, setToast }) {
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [invite,   setInvite]   = useState({ email: '', name: '', role: 'trafikledare' });
  const [sending,  setSending]  = useState(false);
  const { user: me } = useAuth();

  function load() {
    apiFetch('/api/users')
      .then((r) => r.ok ? r.json() : [])
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleInvite(e) {
    e.preventDefault();
    if (!invite.email.trim()) return;
    setSending(true);
    try {
      const r    = await apiFetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invite),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Fel');
      setToast({
        message: data.simulated
          ? `Inbjudan simulerad (SMTP ej konfigurerat) — ${invite.email}`
          : `Inbjudan skickad till ${invite.email}`,
        variant: 'success',
      });
      setInvite({ email: '', name: '', role: 'trafikledare' });
      setShowForm(false);
      load();
    } catch (err) {
      setToast({ message: err.message, variant: 'error' });
    } finally {
      setSending(false);
    }
  }

  async function toggleActive(u) {
    try {
      const r = await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: u.active === 0 ? true : false }),
      });
      if (!r.ok) throw new Error('Fel vid uppdatering');
      load();
    } catch (err) {
      setToast({ message: err.message, variant: 'error' });
    }
  }

  async function changeRole(u, role) {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      load();
    } catch {}
  }

  return (
    <div style={section}>
      <div style={sectionHead}>
        <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>
          Användare
        </span>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            fontFamily: INTER, fontSize: 12, fontWeight: 600,
            background: TEXT, color: WHITE, border: 'none',
            borderRadius: 7, padding: '6px 14px', cursor: 'pointer',
          }}
        >
          + Bjud in
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleInvite} style={{
          padding: '16px 20px', background: SURF, borderBottom: `1px solid ${BORDER}`,
          display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px' }}>
            <span style={{ fontFamily: INTER, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>
              E-post *
            </span>
            <input
              autoFocus type="email" required
              value={invite.email}
              onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value }))}
              placeholder="anna@foretag.se"
              style={{ fontFamily: INTER, fontSize: 13, padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: 7, outline: 'none', background: WHITE, color: TEXT }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 140px' }}>
            <span style={{ fontFamily: INTER, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>
              Namn (valfritt)
            </span>
            <input
              type="text"
              value={invite.name}
              onChange={(e) => setInvite((p) => ({ ...p, name: e.target.value }))}
              placeholder="Anna Lindström"
              style={{ fontFamily: INTER, fontSize: 13, padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: 7, outline: 'none', background: WHITE, color: TEXT }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 150px' }}>
            <span style={{ fontFamily: INTER, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>
              Roll
            </span>
            <select
              value={invite.role}
              onChange={(e) => setInvite((p) => ({ ...p, role: e.target.value }))}
              style={{ fontFamily: INTER, fontSize: 13, padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: 7, outline: 'none', background: WHITE, color: TEXT }}
            >
              {Object.entries(ROLE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit" disabled={sending}
              style={{
                fontFamily: INTER, fontSize: 12, fontWeight: 600,
                background: sending ? SURF : TEXT, color: sending ? MUTED : WHITE,
                border: `1px solid ${BORDER}`, borderRadius: 7, padding: '8px 16px',
                cursor: sending ? 'not-allowed' : 'pointer',
              }}
            >
              {sending ? 'Skickar…' : 'Skicka inbjudan'}
            </button>
            <button
              type="button" onClick={() => setShowForm(false)}
              style={{ fontFamily: INTER, fontSize: 12, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 7, padding: '8px 14px', cursor: 'pointer', color: MUTED }}
            >
              Avbryt
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ padding: 24, fontFamily: INTER, fontSize: 13, color: MUTED, textAlign: 'center' }}>
          Laddar…
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: SURF, borderBottom: `1px solid ${BORDER}` }}>
                {['Namn', 'E-post', 'Roll', 'Status', ''].map((h) => (
                  <th key={h} style={{
                    padding: '9px 14px', textAlign: h === '' ? 'right' : 'left',
                    fontFamily: INTER, fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '10px 14px', fontFamily: INTER, fontSize: 13, color: TEXT, fontWeight: 500 }}>
                    {u.name}
                    {u.id === me?.id && (
                      <span style={{ fontSize: 10, color: MUTED, marginLeft: 6 }}>(dig)</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: INTER, fontSize: 12, color: MUTED }}>
                    {u.email}
                    {u.active === 0 && !u.password_hash && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: '#B46418' }}>• Inbjudan väntande</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {u.id === me?.id ? (
                      <RoleBadge role={u.role} />
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value)}
                        style={{
                          fontFamily: INTER, fontSize: 11, padding: '3px 8px',
                          border: `1px solid ${BORDER}`, borderRadius: 6,
                          background: WHITE, color: TEXT, cursor: 'pointer',
                        }}
                      >
                        {Object.entries(ROLE_LABELS).map(([v, label]) => (
                          <option key={v} value={v}>{label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
                      padding: '2px 8px', borderRadius: 20, fontFamily: INTER,
                      background: u.active ? 'rgba(30,120,80,0.10)' : 'rgba(168,36,36,0.08)',
                      color: u.active ? '#1E7A50' : '#A82424',
                      border: `1px solid ${u.active ? 'rgba(30,120,80,0.25)' : 'rgba(168,36,36,0.22)'}`,
                    }}>
                      {u.active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    {u.id !== me?.id && (
                      <button
                        onClick={() => toggleActive(u)}
                        style={{
                          fontFamily: INTER, fontSize: 11, fontWeight: 600,
                          background: 'none',
                          color: u.active ? '#A82424' : '#1E7A50',
                          border: `1px solid ${u.active ? 'rgba(168,36,36,0.3)' : 'rgba(30,120,80,0.3)'}`,
                          borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                        }}
                      >
                        {u.active ? 'Inaktivera' : 'Aktivera'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
