import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { apiFetch }     from '../utils/apiFetch.js';
import { useAuth }      from '../context/AuthContext.jsx';
import { useSync }      from '../context/SyncContext.jsx';
import { useLanguage }  from '../context/LanguageContext.jsx';
import { db }           from '../db/dexie.js';

const INTER  = "'Inter', sans-serif";
const BLUE   = '#4361ee';
const BLUE_DK = '#3451d1';
const BG     = '#f0f2f5';
const WHITE  = '#ffffff';
const BORDER = '#e9ecef';
const TEXT   = '#1a1a2e';
const MUTED  = '#6c757d';
const SURF   = '#f8f9fa';

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

function BillingCard({ company }) {
  const { t } = useLanguage();
  const fmtDate = (s) => {
    if (!s) return '—';
    try { return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' }).format(new Date(s)); }
    catch { return s; }
  };

  const mailto = [
    'mailto:admin@akaren.se',
    '?subject=',
    encodeURIComponent(`${t.settings.billing.cancelSubject} — ${company?.name ?? ''}`),
    '&body=',
    encodeURIComponent(
      `${t.settings.billing.cancelSubject}\n\n${company?.name ?? ''}\n${company?.org_nr ?? ''}`
    ),
  ].join('');

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
            Åkaren
          </div>
          <div style={{ fontFamily: INTER, fontSize: 22, fontWeight: 700, color: BLUE }}>
            {t.settings.billing.price}
          </div>
          <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED, marginTop: 4 }}>
            {t.settings.billing.plan}
          </div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 12px',
          background: 'rgba(46,204,113,0.08)',
          border: '1px solid rgba(46,204,113,0.3)',
          borderRadius: 20, flexShrink: 0,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2ecc71', flexShrink: 0 }} />
          <span style={{ fontFamily: INTER, fontSize: 12, color: '#1a7a47', fontWeight: 500 }}>
            {t.settings.fortnox.connected}
          </span>
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20,
      }}>
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED, marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t.settings.billing.renewal}
          </div>
          <div style={{ fontFamily: INTER, fontSize: 14, color: TEXT, fontWeight: 600 }}>
            {fmtDate(company?.subscription_renews_at)}
          </div>
        </div>
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED, marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Betalningsmetod / Payment method
          </div>
          <div style={{ fontFamily: INTER, fontSize: 14, color: TEXT, fontWeight: 600 }}>
            Faktura / Invoice
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
        <a
          href={mailto}
          style={{
            fontFamily: INTER, fontSize: 12, fontWeight: 500,
            color: '#e74c3c',
            background: 'rgba(231,76,60,0.06)',
            border: '1px solid rgba(231,76,60,0.25)',
            padding: '7px 16px', borderRadius: 6,
            textDecoration: 'none', display: 'inline-block',
          }}
        >
          {t.settings.billing.cancel}
        </a>
        <p style={{ fontFamily: INTER, fontSize: 11, color: MUTED, margin: '10px 0 0', lineHeight: 1.6 }}>
          Skickar ett e-postmeddelande till admin@akaren.se. Din prenumeration avslutas inte automatiskt.
          / Sends an email to admin@akaren.se. Your subscription is not cancelled automatically.
        </p>
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
              { label: 'Ansluten / Connected', value: fmtDate(status.connected_at) },
              { label: 'Senaste synk / Last sync', value: fmtDate(status.last_sync) },
              { label: 'Kunder / Customers', value: status.customer_count ?? 0 },
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
              {syncing ? '…' : 'Synka kunder / Sync customers'}
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
        Kunder importeras automatiskt vid anslutning och kan synkas manuellt.
        Fakturor skickas automatiskt till Fortnox när ett uppdrag faktureras. /
        Customers are imported automatically on connect and can be manually re-synced.
        Invoices are pushed to Fortnox automatically when a job is invoiced.
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

      {user?.role === 'owner' && (
        <div style={section}>
          <div style={sectionHead}>
            <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>
              {t.settings.billing.heading}
            </span>
            <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>2 990 kr/mån</span>
          </div>
          <BillingCard company={company} />
        </div>
      )}

      {user?.role === 'owner' && (
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
    </div>
  );
}
