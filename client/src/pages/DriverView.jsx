import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch.js';

const INTER = "'Inter', system-ui, sans-serif";
const MONO  = "'DM Mono', monospace";

const STATUS_CFG = {
  planerad:  { label: 'Planerad',  bg: 'rgba(180,100,20,0.10)',  color: '#B46418', border: 'rgba(180,100,20,0.25)' },
  aktiv:     { label: 'Aktiv',     bg: 'rgba(30,120,80,0.12)',   color: '#1E7A50', border: 'rgba(30,120,80,0.30)'  },
  avslutad:  { label: 'Avslutad',  bg: 'rgba(60,100,180,0.10)',  color: '#3C64B4', border: 'rgba(60,100,180,0.25)' },
  fakturerad:{ label: 'Fakturerad',bg: 'rgba(28,25,23,0.07)',    color: '#6B6359', border: 'rgba(28,25,23,0.15)'   },
};

function fmtDate(str) {
  if (!str) return '—';
  try {
    return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(String(str).replace(' ', 'T'))
    );
  } catch { return str; }
}

function fmtKm(n) {
  return n != null ? `${Math.round(n)} km` : '—';
}

function fmtSEK(n) {
  return n != null
    ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr'
    : '—';
}

export function DriverView({ user, onLogout }) {
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [busy,    setBusy]    = useState(null); // jobId being updated

  useEffect(() => {
    apiFetch('/api/jobs')
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then(setJobs)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(jobId, status) {
    setBusy(jobId);
    try {
      const r = await apiFetch(`/api/jobs/${jobId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, status } : j));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#F5F3EF',
      fontFamily: INTER, display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: '#1F1C19', borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#F4F0E8', letterSpacing: '-0.01em' }}>
            Åkaren
          </div>
          <div style={{ fontSize: 11, color: '#5A544E', marginTop: 2 }}>
            {user?.name ?? user?.email}
          </div>
        </div>
        <button
          onClick={onLogout}
          style={{
            fontFamily: INTER, fontSize: 11, color: '#5A544E',
            background: 'none', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
          }}
        >
          Logga ut
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '24px 16px', maxWidth: 640, width: '100%', margin: '0 auto' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 4, letterSpacing: '-0.02em' }}>
          Mina uppdrag
        </div>
        <div style={{ fontSize: 12, color: '#9A9088', marginBottom: 24 }}>
          {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>

        {loading && (
          <div style={{ fontSize: 13, color: '#9A9088', fontStyle: 'italic' }}>Laddar uppdrag…</div>
        )}
        {error && (
          <div style={{
            background: 'rgba(184,60,60,0.08)', border: '1px solid rgba(184,60,60,0.25)',
            borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#A82424',
          }}>
            {error}
          </div>
        )}
        {!loading && !error && jobs.length === 0 && (
          <div style={{
            background: '#fff', border: '1px solid #E3DDD6', borderRadius: 12,
            padding: '40px 24px', textAlign: 'center',
            fontSize: 13, color: '#9A9088', fontStyle: 'italic',
          }}>
            Inga tilldelade uppdrag just nu.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {jobs.map((job) => {
            const cfg        = STATUS_CFG[job.status] ?? STATUS_CFG.planerad;
            const isBusy     = busy === job.id;
            const canStart   = job.status === 'planerad';
            const canFinish  = job.status === 'aktiv';
            const route      = [job.upphämtning, job.leverans].filter(Boolean).join(' → ') || '—';

            return (
              <div key={job.id} style={{
                background: '#fff', border: '1px solid #E3DDD6', borderRadius: 12,
                padding: '16px 18px',
                boxShadow: '0 1px 4px rgba(28,25,23,0.05)',
              }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1C1917', marginBottom: 2 }}>
                      {job.lasttyp ?? 'Transport'}
                    </div>
                    <div style={{ fontSize: 12, color: '#6B6359', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {route}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    padding: '3px 9px', borderRadius: 20,
                    background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                    flexShrink: 0,
                  }}>
                    {cfg.label}
                  </span>
                </div>

                {/* Detail row */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                  {job.datum && (
                    <span style={{ fontSize: 11, color: '#9A9088' }}>
                      📅 {fmtDate(job.datum)}
                    </span>
                  )}
                  {job.avstand_km && (
                    <span style={{ fontSize: 11, color: '#9A9088', fontFamily: MONO }}>
                      {fmtKm(job.avstand_km)}
                    </span>
                  )}
                  {job.fordon_id && (
                    <span style={{ fontSize: 11, color: '#9A9088' }}>
                      🚛 {job.fordon_id}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {canStart && (
                    <button
                      disabled={isBusy}
                      onClick={() => updateStatus(job.id, 'aktiv')}
                      style={{
                        flex: 1, fontFamily: INTER, fontSize: 12, fontWeight: 600,
                        background: isBusy ? 'rgba(30,122,80,0.08)' : '#1E7A50',
                        color: isBusy ? '#1E7A50' : '#fff',
                        border: '1px solid rgba(30,122,80,0.3)', borderRadius: 8,
                        padding: '9px 14px', cursor: isBusy ? 'not-allowed' : 'pointer',
                        transition: 'opacity 0.15s', opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      {isBusy ? 'Startar…' : '▶ Starta uppdrag'}
                    </button>
                  )}
                  {canFinish && (
                    <button
                      disabled={isBusy}
                      onClick={() => updateStatus(job.id, 'avslutad')}
                      style={{
                        flex: 1, fontFamily: INTER, fontSize: 12, fontWeight: 600,
                        background: isBusy ? 'rgba(44,95,191,0.08)' : '#2C5FBF',
                        color: isBusy ? '#2C5FBF' : '#fff',
                        border: '1px solid rgba(44,95,191,0.3)', borderRadius: 8,
                        padding: '9px 14px', cursor: isBusy ? 'not-allowed' : 'pointer',
                        transition: 'opacity 0.15s', opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      {isBusy ? 'Avslutar…' : '✓ Markera avslutad'}
                    </button>
                  )}
                  {!canStart && !canFinish && (
                    <div style={{ fontSize: 11, color: '#9A9088', padding: '9px 0', fontStyle: 'italic' }}>
                      {job.status === 'avslutad' ? 'Uppdraget är avslutat.' : 'Uppdraget är fakturerat.'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
