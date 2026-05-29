import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const OUTFIT  = "'Geist', system-ui, sans-serif";
const INTER   = OUTFIT;
const AMBER   = '#c9921e';
const BLUE    = AMBER;
const AMBER_DK= '#a87818';
const BLUE_DK = AMBER_DK;
const BG      = '#edeae1';
const WHITE   = '#ffffff';
const BORDER  = '#cfc9bb';
const TEXT    = '#151210';
const MUTED   = '#6a6050';
const SURF    = '#f4f0e7';

function Section({ title, subtitle, children }) {
  return (
    <div style={{
      background: WHITE, border: `1px solid ${BORDER}`,
      borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, background: SURF }}>
        <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT }}>{title}</div>
        {subtitle && (
          <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
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
      {children}
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
  const { t } = useLanguage();
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
      alert(t.dataPrivacy.export.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title={t.dataPrivacy.export.heading} subtitle={t.dataPrivacy.export.subtitle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          {t.dataPrivacy.export.desc}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn
            onClick={() => download('/api/data-privacy/export', `akaren-export-${new Date().toISOString().slice(0,10)}.json`)}
            loading={loading}
            variant="primary"
          >
            {t.dataPrivacy.export.jsonBtn}
          </Btn>
          <Btn
            onClick={() => download('/api/data-privacy/export/csv', `akaren-offertar-${new Date().toISOString().slice(0,10)}.csv`)}
            loading={loading}
          >
            {t.dataPrivacy.export.csvBtn}
          </Btn>
        </div>
      </div>
    </Section>
  );
}

function DeleteSection() {
  const { t } = useLanguage();
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
      alert(t.dataPrivacy.export.failed);
    } finally {
      setLoading(false);
    }
  }

  if (pending) {
    const hardDate = new Date(pending.hard_delete_at);
    const daysLeft = Math.ceil((hardDate - Date.now()) / 86400000);
    return (
      <Section
        title={t.dataPrivacy.delete.pending.heading}
        subtitle={t.dataPrivacy.delete.pending.subtitle}
      >
        <div style={{
          padding: '14px 16px',
          background: 'rgba(231,76,60,0.06)',
          border: '1px solid rgba(231,76,60,0.2)',
          borderRadius: 8, marginBottom: 16,
        }}>
          <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: '#e74c3c', marginBottom: 6 }}>
            {t.dataPrivacy.delete.pending.warning(fmtTs(pending.hard_delete_at), daysLeft)}
          </div>
          <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            {t.dataPrivacy.delete.pending.desc}
          </div>
        </div>
        <Btn onClick={cancelDeletion} loading={loading}>
          {t.dataPrivacy.delete.pending.cancel}
        </Btn>
      </Section>
    );
  }

  return (
    <Section
      title={t.dataPrivacy.delete.heading}
      subtitle={t.dataPrivacy.delete.subtitle}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          padding: '12px 14px',
          background: 'rgba(231,76,60,0.04)',
          border: '1px solid rgba(231,76,60,0.15)',
          borderRadius: 8,
          fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.6,
        }}>
          {t.dataPrivacy.delete.desc}
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: 2, accentColor: '#e74c3c', flexShrink: 0 }}
          />
          <span style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
            {t.dataPrivacy.delete.confirm}
          </span>
        </label>

        <div>
          <Btn onClick={requestDeletion} disabled={!confirmed} loading={loading} variant="danger">
            {t.dataPrivacy.delete.button}
          </Btn>
        </div>
      </div>
    </Section>
  );
}

function BackupsSection() {
  const { t } = useLanguage();
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
      alert(t.dataPrivacy.backup.restoreSuccess);
    } catch (e) {
      setRestErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const td = t.dataPrivacy.backup;

  return (
    <Section title={td.heading} subtitle={td.subtitle}>
      {restoring && (
        <div style={{
          marginBottom: 20, padding: 16,
          background: 'rgba(67,97,238,0.04)',
          border: 'rgba(67,97,238,0.2)',
          borderRadius: 8,
        }}>
          <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: BLUE, marginBottom: 10 }}>
            {td.restoreHeading(fmtTs(restoring.backupDate))}
          </div>

          {restoring.step === 'confirm' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                {td.restoreDesc}
              </div>
              {restErr && <div style={{ fontFamily: INTER, fontSize: 12, color: '#e74c3c' }}>{restErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn onClick={requestCode} loading={loading} variant="primary">{td.genCode}</Btn>
                <Btn onClick={() => setRestoring(null)}>{td.cancel}</Btn>
              </div>
            </div>
          )}

          {restoring.step === 'code' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                {td.codeDesc}
              </div>
              <div style={{
                fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700,
                color: BLUE, letterSpacing: '0.2em', padding: '8px 0',
              }}>
                {restoring.token}
              </div>
              <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>
                {td.codeNote}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder={td.codeInput}
                  maxLength={8}
                  style={{
                    fontFamily: 'monospace', fontSize: 15, color: TEXT,
                    background: WHITE, border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: '8px 12px', outline: 'none',
                    letterSpacing: '0.15em', width: 150,
                  }}
                />
                <Btn onClick={confirmRestore} loading={loading} disabled={codeInput.length !== 8} variant="primary">
                  {td.confirmBtn}
                </Btn>
                <Btn onClick={() => setRestoring(null)}>{td.cancel}</Btn>
              </div>
              {restErr && <div style={{ fontFamily: INTER, fontSize: 12, color: '#e74c3c' }}>{restErr}</div>}
            </div>
          )}
        </div>
      )}

      {backups === null ? (
        <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, fontStyle: 'italic' }}>{td.loading}</div>
      ) : backups.length === 0 ? (
        <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
          {td.none}
          <br />
          <span style={{ fontSize: 12 }}>{td.noneEnvNote}</span>
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
            <span>{td.cols.timestamp}</span>
            <span>{td.cols.type}</span>
            <span>{td.cols.size}</span>
            <span>{td.cols.encrypted}</span>
            <span>{td.cols.status}</span>
            <span></span>
          </div>
          {backups.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 110px 80px 100px',
                gap: 12, padding: '10px 0',
                borderBottom: `1px solid ${BORDER}`,
                alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: INTER, fontSize: 13, color: TEXT }}>{fmtTs(b.created_at)}</span>
              <span style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: b.backup_type === 'monthly' ? BLUE : MUTED }}>
                {b.backup_type}
              </span>
              <span style={{ fontFamily: INTER, fontSize: 13, color: MUTED }}>{fmtBytes(b.size_bytes)}</span>
              <span style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: b.encrypted ? '#1a7a47' : MUTED }}>
                {b.encrypted ? td.encryptedYes : td.encryptedNo}
              </span>
              <span style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: b.status === 'ok' ? '#1a7a47' : '#e74c3c' }}>
                {b.status === 'ok' ? 'OK' : 'FAILED'}
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
                    {td.restore}
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
  const { t } = useLanguage();
  return (
    <div style={{ padding: '28px 32px', maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontFamily: INTER, fontSize: 20, fontWeight: 700, color: TEXT, margin: '0 0 6px' }}>
          {t.dataPrivacy.heading}
        </h1>
        <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>
          {t.dataPrivacy.subtitle}
        </p>
      </div>

      <ExportSection />
      <BackupsSection />
      <DeleteSection />
    </div>
  );
}
