import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch.js';

const INTER  = "'Inter', sans-serif";
const BLUE   = '#4361ee';
const BLUE_DK = '#3451d1';
const BG     = '#f0f2f5';
const WHITE  = '#ffffff';
const BORDER = '#e9ecef';
const TEXT   = '#1a1a2e';
const MUTED  = '#6c757d';
const SURF   = '#f8f9fa';

function Section({ title, subtitle, children }) {
  return (
    <div style={{
      background: WHITE,
      border: `1px solid ${BORDER}`,
      borderRadius: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${BORDER}`,
        background: SURF,
      }}>
        <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ padding: 20 }}>
        {children}
      </div>
    </div>
  );
}

function Btn({ onClick, disabled, variant = 'default', children, loading }) {
  const [hov, setHov] = useState(false);
  let bg, color, border;
  if (variant === 'danger') {
    bg = disabled ? SURF : hov ? '#c0392b' : '#e74c3c';
    color = disabled ? MUTED : WHITE;
    border = `1px solid ${disabled ? BORDER : '#e74c3c'}`;
  } else if (variant === 'primary') {
    bg = disabled ? SURF : hov ? BLUE_DK : BLUE;
    color = disabled ? MUTED : WHITE;
    border = 'none';
  } else {
    bg = hov ? SURF : WHITE;
    color = disabled ? MUTED : TEXT;
    border = `1px solid ${BORDER}`;
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: INTER, fontSize: 13, fontWeight: 600,
        padding: '8px 18px', borderRadius: 6,
        background: bg, color, border,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? 'Väntar…' : children}
    </button>
  );
}

function fmtBytes(n) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtTs(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('sv-SE'); } catch { return s; }
}

function ExportSection() {
  const [loading, setLoading] = useState(false);

  async function download(endpoint, filename) {
    setLoading(true);
    try {
      const res = await apiFetch(endpoint);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      title="Export · Dataportabilitet"
      subtitle="GDPR artikel 20 — Rätt till dataportabilitet. Ladda ned alla era uppgifter i maskinläsbart format. Article 20 — Right to data portability."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          Exporten innehåller: företagsinfo, användare, offertar, uppdrag, förare, kunder, mallar, fakturor och revisionslogg.
          <br />
          Export includes: company info, users, quotes, jobs, drivers, customers, templates, invoices and audit log.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn
            onClick={() => download('/api/data-privacy/export', `akaren-export-${new Date().toISOString().slice(0,10)}.json`)}
            loading={loading}
            variant="primary"
          >
            Ladda ned JSON
          </Btn>
          <Btn
            onClick={() => download('/api/data-privacy/export/csv', `akaren-offertar-${new Date().toISOString().slice(0,10)}.csv`)}
            loading={loading}
          >
            Ladda ned CSV (offertar)
          </Btn>
        </div>
      </div>
    </Section>
  );
}

function DeleteSection() {
  const [pending,   setPending]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    apiFetch('/api/data-privacy/delete-account')
      .then((r) => r.json())
      .then(setPending)
      .catch(() => {});
  }, []);

  async function requestDeletion() {
    if (!confirmed) return;
    setLoading(true);
    try {
      const res  = await apiFetch('/api/data-privacy/delete-account', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPending(data);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function cancelDeletion() {
    setLoading(true);
    try {
      const res = await apiFetch('/api/data-privacy/delete-account', { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setPending(null);
    } catch {
      alert('Failed to cancel. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (pending) {
    const hardDate = new Date(pending.hard_delete_at);
    const daysLeft = Math.ceil((hardDate - Date.now()) / 86400000);
    return (
      <Section title="Radera konto / Delete Account" subtitle="En raderingsbegäran är aktiv / A deletion request is active">
        <div style={{
          padding: '14px 16px',
          background: 'rgba(231,76,60,0.06)',
          border: '1px solid rgba(231,76,60,0.2)',
          borderRadius: 8, marginBottom: 16,
        }}>
          <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: '#e74c3c', marginBottom: 6 }}>
            ⚠ Kontot raderas permanent {fmtTs(pending.hard_delete_at)} ({daysLeft} dagar kvar)
          </div>
          <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            All data inklusive offertar, uppdrag och revisionslogg raderas oåterkalleligen.
            All data including quotes, jobs and audit log will be permanently deleted.
          </div>
        </div>
        <Btn onClick={cancelDeletion} loading={loading}>
          Avbryt raderingen / Cancel deletion
        </Btn>
      </Section>
    );
  }

  return (
    <Section
      title="Radera konto / Delete Account"
      subtitle="30 dagars ångertid. All data raderas permanent efter 30 dagar. Loggas i revisionsloggen. / 30-day grace period before permanent deletion."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          padding: '12px 14px',
          background: 'rgba(231,76,60,0.04)',
          border: '1px solid rgba(231,76,60,0.15)',
          borderRadius: 8,
          fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.6,
        }}>
          Att radera kontot tar bort: alla offertar, uppdrag, förare, kunder, fakturor, mallar, revisionslogg och AI-extraktionshistorik.
          Denna åtgärd kan inte ångras efter 30-dagarsperioden.
          <br /><br />
          Deleting the account removes all data. This cannot be undone after the 30-day period.
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: 2, accentColor: '#e74c3c', flexShrink: 0 }}
          />
          <span style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
            Jag förstår att all data raderas permanent efter 30 dagar och att denna åtgärd är oåterkallelig. /
            I understand that all data is permanently deleted after 30 days and this action is irreversible.
          </span>
        </label>

        <div>
          <Btn
            onClick={requestDeletion}
            disabled={!confirmed}
            loading={loading}
            variant="danger"
          >
            Begär kontoborttagning / Request account deletion
          </Btn>
        </div>
      </div>
    </Section>
  );
}

function BackupsSection() {
  const [backups,   setBackups]   = useState(null);
  const [restoring, setRestoring] = useState(null);
  const [codeInput, setCodeInput] = useState('');
  const [restErr,   setRestErr]   = useState(null);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    apiFetch('/api/data-privacy/backups')
      .then((r) => r.json())
      .then(setBackups)
      .catch(() => setBackups([]));
  }, []);

  async function startRestore(backup) {
    setRestoring({ backupId: backup.id, step: 'confirm', backupDate: backup.created_at });
    setCodeInput('');
    setRestErr(null);
  }

  async function requestCode() {
    setLoading(true);
    setRestErr(null);
    try {
      const res  = await apiFetch(`/api/data-privacy/backups/${restoring.backupId}/restore/request`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRestoring((r) => ({ ...r, step: 'code', token: data.token, expiresAt: data.expires_at }));
    } catch (e) {
      setRestErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmRestore() {
    setLoading(true);
    setRestErr(null);
    try {
      const res  = await apiFetch(`/api/data-privacy/backups/${restoring.backupId}/restore/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: codeInput.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRestoring(null);
      alert('Restore förbereddes. Starta om servern för att tillämpa återställningen.\nRestore prepared. Restart the server to apply.');
    } catch (e) {
      setRestErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      title="Säkerhetskopior / Backups"
      subtitle="Daglig backup kl. 02:00 (Stockholm). 30 dagliga + 12 månatliga kopior bevaras. AES-256-GCM krypterade."
    >
      {restoring && (
        <div style={{
          marginBottom: 20, padding: 16,
          background: 'rgba(67,97,238,0.04)',
          border: `1px solid rgba(67,97,238,0.2)`,
          borderRadius: 8,
        }}>
          <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: BLUE, marginBottom: 10 }}>
            Återställning / Restore — {fmtTs(restoring.backupDate)}
          </div>

          {restoring.step === 'confirm' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                Återställning ersätter den aktiva databasen med säkerhetskopian. Servern måste startas om efteråt.
                En bekräftelsekod genereras — ange den för att verkställa.
                <br />
                Restore replaces the live database with the backup. Server restart required.
              </div>
              {restErr && <div style={{ fontFamily: INTER, fontSize: 12, color: '#e74c3c' }}>{restErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn onClick={requestCode} loading={loading} variant="primary">Generera kod / Generate code</Btn>
                <Btn onClick={() => setRestoring(null)}>Avbryt</Btn>
              </div>
            </div>
          )}

          {restoring.step === 'code' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                Din bekräftelsekod (giltig 15 min) / Your confirmation code (valid 15 min):
              </div>
              <div style={{
                fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700,
                color: BLUE, letterSpacing: '0.2em', padding: '8px 0',
              }}>
                {restoring.token}
              </div>
              <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>
                I produktion skickas koden till kontoägarens e-post. /
                In production this code would be emailed to the account owner.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="Ange kod / Enter code"
                  maxLength={8}
                  style={{
                    fontFamily: 'monospace', fontSize: 15, color: TEXT,
                    background: WHITE, border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: '8px 12px', outline: 'none',
                    letterSpacing: '0.15em', width: 150,
                  }}
                />
                <Btn
                  onClick={confirmRestore}
                  loading={loading}
                  disabled={codeInput.length !== 8}
                  variant="primary"
                >
                  Bekräfta återställning / Confirm restore
                </Btn>
                <Btn onClick={() => setRestoring(null)}>Avbryt</Btn>
              </div>
              {restErr && <div style={{ fontFamily: INTER, fontSize: 12, color: '#e74c3c' }}>{restErr}</div>}
            </div>
          )}
        </div>
      )}

      {backups === null ? (
        <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, fontStyle: 'italic' }}>Laddar…</div>
      ) : backups.length === 0 ? (
        <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
          Inga säkerhetskopior ännu. Den första skapas kl. 02:00 nästa natt.
          <br />
          <span style={{ fontSize: 12 }}>
            Configure S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY and BACKUP_ENCRYPTION_KEY in your .env to enable backups.
          </span>
        </div>
      ) : (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 80px 110px 80px 100px',
            gap: 12, padding: '4px 0 8px',
            fontFamily: INTER, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED,
            borderBottom: `1px solid ${BORDER}`,
          }}>
            <span>Timestamp</span>
            <span>Type</span>
            <span>Size</span>
            <span>Encrypted</span>
            <span>Status</span>
            <span></span>
          </div>
          {backups.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 110px 80px 100px',
                gap: 12,
                padding: '10px 0',
                borderBottom: `1px solid ${BORDER}`,
                alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: INTER, fontSize: 13, color: TEXT }}>
                {fmtTs(b.created_at)}
              </span>
              <span style={{
                fontFamily: INTER, fontSize: 12, fontWeight: 600,
                color: b.backup_type === 'monthly' ? BLUE : MUTED,
              }}>
                {b.backup_type}
              </span>
              <span style={{ fontFamily: INTER, fontSize: 13, color: MUTED }}>
                {fmtBytes(b.size_bytes)}
              </span>
              <span style={{
                fontFamily: INTER, fontSize: 12, fontWeight: 600,
                color: b.encrypted ? '#1a7a47' : MUTED,
              }}>
                {b.encrypted ? 'AES-256-GCM' : 'Nej / No'}
              </span>
              <span style={{
                fontFamily: INTER, fontSize: 12, fontWeight: 600,
                color: b.status === 'ok' ? '#1a7a47' : '#e74c3c',
              }}>
                {b.status === 'ok' ? '✓ OK' : '✕ FAILED'}
              </span>
              <div>
                {b.status === 'ok' && b.s3_key && (
                  <button
                    onClick={() => startRestore(b)}
                    style={{
                      fontFamily: INTER, fontSize: 12, fontWeight: 500,
                      background: WHITE, color: BLUE,
                      border: `1px solid ${BORDER}`, borderRadius: 6,
                      padding: '4px 12px', cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(67,97,238,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = WHITE; }}
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export function DataPrivacy() {
  return (
    <div style={{
      padding: '28px 32px',
      maxWidth: 820,
      display: 'flex', flexDirection: 'column', gap: 24,
    }}>
      <div>
        <h1 style={{
          fontFamily: INTER, fontSize: 20, fontWeight: 700,
          color: TEXT, margin: '0 0 6px',
        }}>
          Data & Integritet / Data & Privacy
        </h1>
        <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
          GDPR-kontroller, dataexport, säkerhetskopior och kontoborttagning.
          Alla åtgärder loggas i revisionsloggen. ·{' '}
          GDPR controls, data export, backups and account deletion. All actions are logged in the audit trail.
        </p>
      </div>

      <ExportSection />
      <BackupsSection />
      <DeleteSection />
    </div>
  );
}
