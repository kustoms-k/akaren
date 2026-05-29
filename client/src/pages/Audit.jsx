import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useAuth }  from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const AMBER   = '#c9921e';
const AMBER_DK= '#a87818';
const BG      = '#edeae1';
const WHITE   = '#ffffff';
const BORDER  = '#cfc9bb';
const TEXT    = '#151210';
const MUTED   = '#6a6050';
const FAINT   = '#9a9082';
const OUTFIT  = "'Geist', system-ui, sans-serif";
const SURF    = '#f4f0e7';
const MONO    = "'Geist Mono', monospace";

const ACTION_COLORS = {
  create: { bg: 'rgba(46,204,113,0.10)',  color: '#1a7a47' },
  update: { bg: 'rgba(201,146,30,0.10)',   color: AMBER },
  delete: { bg: 'rgba(231,76,60,0.10)',   color: '#e74c3c' },
  view:   { bg: 'rgba(108,117,125,0.10)', color: '#6c757d' },
  send:   { bg: 'rgba(168,85,247,0.10)',  color: '#9333ea' },
};

function tryParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function DiffView({ before, after, action, t }) {
  const b = tryParse(before);
  const a = tryParse(after);

  if (!b && !a) {
    return <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>—</span>;
  }

  if (!b && a) {
    const SHOW = ['lasttyp', 'upphämtning', 'leverans', 'totalpris_sek', 'status', 'name', 'faktura_nr'];
    const lines = SHOW.filter((k) => a[k] != null).map((k) => (
      <div key={k} style={{ color: '#1a7a47' }}>
        {k}: <strong>{String(a[k])}</strong>
      </div>
    ));
    return lines.length ? (
      <div style={{ fontFamily: OUTFIT, fontSize: 12, lineHeight: 1.8 }}>{lines}</div>
    ) : (
      <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>{t.audit.row.created}</span>
    );
  }

  if (!a) {
    return <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>—</span>;
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
          {' – '}
          <span style={{ color: '#1a7a47' }}><strong>{String(av)}</strong></span>
        </div>
      );
    }
  }

  return lines.length ? (
    <div style={{ fontFamily: OUTFIT, fontSize: 12, lineHeight: 1.8 }}>{lines}</div>
  ) : (
    <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>{t.audit.row.noChanges}</span>
  );
}

function ActionBadge({ action }) {
  const style = ACTION_COLORS[action] ?? { bg: 'rgba(108,117,125,0.1)', color: '#6c757d' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px', borderRadius: 20,
      fontFamily: OUTFIT, fontSize: 11, fontWeight: 600,
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
  const { t } = useLanguage();
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
      .then(({ rows: r, total: tl, users: u }) => {
        setRows(r ?? []);
        setTotal(tl ?? 0);
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
        <div style={{ fontFamily: OUTFIT, fontSize: 14, color: '#e74c3c', fontWeight: 600 }}>
          {t.audit.accessDenied}
        </div>
      </div>
    );
  }

  const totalPages  = Math.max(1, Math.ceil(total / LIMIT));
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const inputStyle = {
    fontFamily: OUTFIT, fontSize: 13, color: TEXT,
    background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 6,
    padding: '6px 10px', outline: 'none',
  };

  const TABLE_HEADERS = [
    t.audit.table.timestamp,
    t.audit.table.user,
    t.audit.table.entity,
    t.audit.table.id,
    t.audit.table.action,
    t.audit.table.changes,
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: BG, padding: '20px 24px' }}>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: OUTFIT, fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
          {t.audit.heading}
        </div>
        <div style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED }}>
          {t.audit.eventsTotal(total)} · {t.audit.ownerOnly}
        </div>
      </div>

      <form onSubmit={applyFilters} style={{
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        padding: '14px 18px', marginBottom: 16,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t.audit.filters.entity}
          </span>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            style={{ ...inputStyle, width: 180 }}
          >
            <option value="">{t.audit.filters.allEntities}</option>
            {Object.entries(t.audit.entities).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t.audit.filters.user}
          </span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ ...inputStyle, width: 180 }}
          >
            <option value="">{t.audit.filters.allUsers}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t.audit.filters.from}
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ ...inputStyle, width: 130 }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t.audit.filters.to}
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
            fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
            padding: '7px 18px',
            background: AMBER, color: TEXT, border: 'none',
            borderRadius: 6, cursor: 'pointer', alignSelf: 'flex-end',
          }}
        >
          {t.audit.filters.filterBtn}
        </button>

        {(entityType || userId || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => { setEntityType(''); setUserId(''); setDateFrom(''); setDateTo(''); }}
            style={{
              fontFamily: OUTFIT, fontSize: 13, fontWeight: 500,
              padding: '7px 14px', background: WHITE,
              border: `1px solid ${BORDER}`, borderRadius: 6,
              color: MUTED, cursor: 'pointer', alignSelf: 'flex-end',
            }}
          >
            {t.audit.filters.clearBtn}
          </button>
        )}
      </form>

      <div style={{
        background: WHITE, border: `1px solid ${BORDER}`,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: SURF, borderBottom: `1px solid ${BORDER}` }}>
              {TABLE_HEADERS.map((h) => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 14px',
                  fontFamily: OUTFIT, fontSize: 11,
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
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', fontFamily: OUTFIT, fontSize: 13, color: MUTED }}>
                  {t.audit.loading}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', fontFamily: OUTFIT, fontSize: 13, color: MUTED, fontStyle: 'italic' }}>
                  {t.audit.noEntries}
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
                    background: isExp ? 'rgba(201,146,30,0.06)' : i % 2 === 0 ? WHITE : SURF,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                >
                  <td style={{ padding: '9px 14px', fontFamily: OUTFIT, fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>
                    {fmtTs(row.created_at)}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ fontFamily: OUTFIT, fontSize: 13, color: TEXT, fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {row.user_name ?? '—'}
                    </div>
                    <div style={{ fontFamily: OUTFIT, fontSize: 11, color: MUTED }}>
                      {row.user_email ?? ''}
                    </div>
                  </td>
                  <td style={{ padding: '9px 14px', fontFamily: OUTFIT, fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>
                    {t.audit.entities[row.entity_type] ?? row.entity_type}
                  </td>
                  <td style={{ padding: '9px 14px', fontFamily: OUTFIT, fontSize: 12, color: AMBER, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {row.entity_id ?? '—'}
                  </td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                    <ActionBadge action={row.action} />
                  </td>
                  <td style={{ padding: '9px 14px', maxWidth: 400 }}>
                    {isExp ? (
                      <DiffView before={row.before_value} after={row.after_value} action={row.action} t={t} />
                    ) : (
                      <span style={{ fontFamily: OUTFIT, fontSize: 12, color: MUTED }}>
                        {row.action === 'view' ? t.audit.row.viewOnly
                         : row.after_value ? t.audit.row.clickExpand
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

      {total > LIMIT && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 14, padding: '0 2px',
        }}>
          <span style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED }}>
            {t.audit.pagination.summary(currentPage, totalPages, total)}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={offset === 0}
              onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); load(o); }}
              style={{
                fontFamily: OUTFIT, fontSize: 13, fontWeight: 500, padding: '6px 14px',
                background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 6,
                color: offset === 0 ? MUTED : TEXT, cursor: offset === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {t.audit.pagination.prev}
            </button>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => { const o = offset + LIMIT; setOffset(o); load(o); }}
              style={{
                fontFamily: OUTFIT, fontSize: 13, fontWeight: 500, padding: '6px 14px',
                background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 6,
                color: offset + LIMIT >= total ? MUTED : TEXT,
                cursor: offset + LIMIT >= total ? 'not-allowed' : 'pointer',
              }}
            >
              {t.audit.pagination.next}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
