import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useAuth }  from '../context/AuthContext.jsx';

const INTER  = "'Inter', sans-serif";
const BLUE   = '#4361ee';
const BG     = '#f0f2f5';
const WHITE  = '#ffffff';
const BORDER = '#e9ecef';
const TEXT   = '#1a1a2e';
const MUTED  = '#6c757d';
const SURF   = '#f8f9fa';

const ENTITY_LABELS = {
  quote:            'Quote / Offert',
  job:              'Job / Uppdrag',
  template:         'Template / Mall',
  driver:           'Driver / Förare',
  financial_report: 'Financial Report / Ekonomirapport',
};

const ACTION_COLORS = {
  create: { bg: 'rgba(46,204,113,0.10)',  color: '#1a7a47' },
  update: { bg: 'rgba(67,97,238,0.10)',   color: '#4361ee' },
  delete: { bg: 'rgba(231,76,60,0.10)',   color: '#e74c3c' },
  view:   { bg: 'rgba(108,117,125,0.10)', color: '#6c757d' },
  send:   { bg: 'rgba(168,85,247,0.10)',  color: '#9333ea' },
};

function tryParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function DiffView({ before, after, action }) {
  const b = tryParse(before);
  const a = tryParse(after);

  if (!b && !a) {
    return <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>—</span>;
  }

  if (!b && a) {
    const SHOW = ['lasttyp', 'upphämtning', 'leverans', 'totalpris_sek', 'status', 'name', 'faktura_nr'];
    const lines = SHOW.filter((k) => a[k] != null).map((k) => (
      <div key={k} style={{ color: '#1a7a47' }}>
        {k}: <strong>{String(a[k])}</strong>
      </div>
    ));
    return lines.length ? (
      <div style={{ fontFamily: INTER, fontSize: 12, lineHeight: 1.8 }}>{lines}</div>
    ) : (
      <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>created</span>
    );
  }

  if (!a) {
    return <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>—</span>;
  }

  const allKeys = new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})]);
  const SKIP    = new Set(['token', 'company_id', 'rawId', 'sms_status', 'sms_driver_name', 'sms_error']);
  const lines   = [];

  for (const key of allKeys) {
    if (SKIP.has(key)) continue;
    const bv = b?.[key];
    const av = a?.[key];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;

    if (bv !== undefined && av === undefined) {
      lines.push(
        <div key={key}>
          <span style={{ color: '#e74c3c', textDecoration: 'line-through' }}>
            {key}: {String(bv)}
          </span>
        </div>
      );
    } else if (bv === undefined && av !== undefined) {
      lines.push(
        <div key={key} style={{ color: '#1a7a47' }}>
          {key}: <strong>{String(av)}</strong>
        </div>
      );
    } else {
      lines.push(
        <div key={key}>
          <span style={{ color: '#e74c3c', textDecoration: 'line-through' }}>{key}: {String(bv)}</span>
          {' → '}
          <span style={{ color: '#1a7a47' }}><strong>{String(av)}</strong></span>
        </div>
      );
    }
  }

  return lines.length ? (
    <div style={{ fontFamily: INTER, fontSize: 12, lineHeight: 1.8 }}>{lines}</div>
  ) : (
    <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>no field changes</span>
  );
}

function ActionBadge({ action }) {
  const style = ACTION_COLORS[action] ?? { bg: 'rgba(108,117,125,0.1)', color: '#6c757d' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px', borderRadius: 20,
      fontFamily: INTER, fontSize: 11, fontWeight: 600,
      textTransform: 'uppercase',
      background: style.bg, color: style.color,
      whiteSpace: 'nowrap',
    }}>
      {action}
    </span>
  );
}

function fmtTs(s) {
  if (!s) return '—';
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(s.replace(' ', 'T')));
  } catch { return s; }
}

export function Audit() {
  const { user } = useAuth();

  const [rows,       setRows]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [offset,     setOffset]     = useState(0);
  const [expanded,   setExpanded]   = useState(null);

  const [entityType, setEntityType] = useState('');
  const [userId,     setUserId]     = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  const LIMIT = 50;

  const load = useCallback((off = 0) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: LIMIT, offset: off });
    if (entityType) params.set('entity_type', entityType);
    if (userId)     params.set('user_id',     userId);
    if (dateFrom)   params.set('date_from',   dateFrom);
    if (dateTo)     params.set('date_to',     dateTo);

    apiFetch(`/api/audit?${params}`)
      .then((r) => r.json())
      .then(({ rows: r, total: t, users: u }) => {
        setRows(r ?? []);
        setTotal(t ?? 0);
        setUsers(u ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityType, userId, dateFrom, dateTo]);

  useEffect(() => { setOffset(0); load(0); }, [load]);

  function applyFilters(e) {
    e.preventDefault();
    setOffset(0);
    load(0);
  }

  if (user?.role !== 'owner') {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: BG, flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontFamily: INTER, fontSize: 14, color: '#e74c3c', fontWeight: 600 }}>Access restricted to owner role.</div>
        <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>Åtkomst kräver ägarbehörighet.</div>
      </div>
    );
  }

  const totalPages  = Math.max(1, Math.ceil(total / LIMIT));
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const inputStyle = {
    fontFamily: INTER, fontSize: 13, color: TEXT,
    background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 6,
    padding: '6px 10px', outline: 'none',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: BG, padding: '20px 24px' }}>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: INTER, fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
          Revisionslogg / Audit Log
        </div>
        <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED }}>
          {total.toLocaleString('sv-SE')} händelser totalt · Ägarvy / Owner-only view
        </div>
      </div>

      {/* Filter bar */}
      <form onSubmit={applyFilters} style={{
        background: WHITE,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        padding: '14px 18px', marginBottom: 16,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: INTER, fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Entity
          </span>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            style={{ ...inputStyle, width: 180 }}
          >
            <option value="">All entities</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: INTER, fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            User
          </span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ ...inputStyle, width: 180 }}
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: INTER, fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            From
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ ...inputStyle, width: 130 }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: INTER, fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            To
          </span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ ...inputStyle, width: 130 }}
          />
        </label>

        <button
          type="submit"
          style={{
            fontFamily: INTER, fontSize: 13, fontWeight: 600,
            padding: '7px 18px',
            background: BLUE, color: WHITE, border: 'none',
            borderRadius: 6, cursor: 'pointer', alignSelf: 'flex-end',
          }}
        >
          Filter
        </button>

        {(entityType || userId || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => { setEntityType(''); setUserId(''); setDateFrom(''); setDateTo(''); }}
            style={{
              fontFamily: INTER, fontSize: 13, fontWeight: 500,
              padding: '7px 14px', background: WHITE,
              border: `1px solid ${BORDER}`, borderRadius: 6,
              color: MUTED, cursor: 'pointer', alignSelf: 'flex-end',
            }}
          >
            Clear
          </button>
        )}
      </form>

      {/* Table */}
      <div style={{
        background: WHITE, border: `1px solid ${BORDER}`,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: SURF, borderBottom: `1px solid ${BORDER}` }}>
              {['Timestamp', 'User', 'Entity', 'ID', 'Action', 'Changes'].map((h) => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 14px',
                  fontFamily: INTER, fontSize: 11,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                  color: MUTED, fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', fontFamily: INTER, fontSize: 13, color: MUTED }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', fontFamily: INTER, fontSize: 13, color: MUTED, fontStyle: 'italic' }}>
                  No audit events yet.
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const isExp = expanded === row.id;
              return (
                <tr
                  key={row.id}
                  onClick={() => setExpanded(isExp ? null : row.id)}
                  style={{
                    borderBottom: `1px solid ${i < rows.length - 1 ? BORDER : 'transparent'}`,
                    background: isExp ? 'rgba(67,97,238,0.04)' : i % 2 === 0 ? WHITE : SURF,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                >
                  <td style={{ padding: '9px 14px', fontFamily: INTER, fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>
                    {fmtTs(row.created_at)}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ fontFamily: INTER, fontSize: 13, color: TEXT, fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {row.user_name ?? '—'}
                    </div>
                    <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED }}>
                      {row.user_email ?? ''}
                    </div>
                  </td>
                  <td style={{ padding: '9px 14px', fontFamily: INTER, fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>
                    {ENTITY_LABELS[row.entity_type] ?? row.entity_type}
                  </td>
                  <td style={{ padding: '9px 14px', fontFamily: INTER, fontSize: 12, color: BLUE, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {row.entity_id ?? '—'}
                  </td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                    <ActionBadge action={row.action} />
                  </td>
                  <td style={{ padding: '9px 14px', maxWidth: 400 }}>
                    {isExp ? (
                      <DiffView before={row.before_value} after={row.after_value} action={row.action} />
                    ) : (
                      <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED }}>
                        {row.action === 'view' ? '— view only —'
                         : row.after_value ? 'click to expand'
                         : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 14, padding: '0 2px',
        }}>
          <span style={{ fontFamily: INTER, fontSize: 13, color: MUTED }}>
            Sida {currentPage} av {totalPages} · {total} händelser
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={offset === 0}
              onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); load(o); }}
              style={{
                fontFamily: INTER, fontSize: 13, fontWeight: 500, padding: '6px 14px',
                background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 6,
                color: offset === 0 ? MUTED : TEXT, cursor: offset === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              ← Prev
            </button>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => { const o = offset + LIMIT; setOffset(o); load(o); }}
              style={{
                fontFamily: INTER, fontSize: 13, fontWeight: 500, padding: '6px 14px',
                background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 6,
                color: offset + LIMIT >= total ? MUTED : TEXT,
                cursor: offset + LIMIT >= total ? 'not-allowed' : 'pointer',
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
