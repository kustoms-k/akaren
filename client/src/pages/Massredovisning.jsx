import { useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Link } from '../components/Link.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { downloadFile } from '../lib/api.js';
import { downloadMassPdf } from '../lib/massPdf.js';
import { useApi } from '../lib/useApi.js';
import { navigate, useLocation } from '../lib/router.js';
import { useToast } from '../lib/toast.js';
import { REVIEW_STATUS, formatAddress, formatDate, formatTon } from '../lib/labels.js';

const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(new Date());

/** Quick date ranges, as [label, from, to]. */
function presets() {
  const today = todayLocal();
  const [y, m] = today.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevEnd = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  return [
    ['Denna månad', `${y}-${pad(m)}-01`, today],
    ['Förra månaden', `${prevY}-${pad(prevM)}-01`, `${prevY}-${pad(prevM)}-${pad(prevEnd)}`],
    ['I år', `${y}-01-01`, today],
    ['Hela projektet', '', ''],
  ];
}

function Stat({ label, value, tone }) {
  return (
    <div className="panel stat">
      <div className="t-label">{label}</div>
      <div className="stat-value num" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  );
}

export function Massredovisning() {
  const toast = useToast();
  const { query } = useLocation();
  const projectId = query.get('projekt') ?? '';
  const from = query.get('fran') ?? '';
  const to = query.get('till') ?? '';
  const [busy, setBusy] = useState(null);

  const projects = useApi('/api/projects?all=1');
  const params = new URLSearchParams({ project_id: projectId, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  const report = useApi(projectId ? `/api/massredovisning?${params}` : null);
  const r = report.data;

  function update(next) {
    const p = new URLSearchParams({ projekt: projectId, fran: from, till: to, ...next });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const qs = p.toString();
    navigate(`/massor${qs ? `?${qs}` : ''}`, { replace: true });
  }

  // Projects grouped by customer for the picker.
  const byCustomer = new Map();
  for (const p of projects.data ?? []) {
    if (!byCustomer.has(p.customer_name)) byCustomer.set(p.customer_name, []);
    byCustomer.get(p.customer_name).push(p);
  }

  const baseName = r ? `massredovisning-${r.project.name}`.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() : 'massredovisning';

  async function csv() {
    setBusy('csv');
    try {
      await downloadFile(`/api/massredovisning?${params}&format=csv`, `${baseName}.csv`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function pdf() {
    setBusy('pdf');
    try {
      await downloadMassPdf(r, `${baseName}-${from || 'start'}-${to || todayLocal()}.pdf`);
    } catch {
      toast('PDF:en kunde inte skapas. Försök igen.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Massredovisning"
        description="Vart varje lass tog vägen: mottagare, avfallskod och vikt per projekt."
        actions={r && (
          <>
            <Button variant="secondary" onClick={csv} loading={busy === 'csv'} disabled={busy !== null || r.rows.length === 0}>
              <FileSpreadsheet size={15} /> CSV
            </Button>
            <Button onClick={pdf} loading={busy === 'pdf'} disabled={busy !== null || r.rows.length === 0}>
              <FileDown size={15} /> PDF
            </Button>
          </>
        )}
      />
      <ErrorNotice error={projects.error ?? report.error} onRetry={() => { projects.reload(); report.reload(); }} />

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', alignItems: 'end' }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label" htmlFor="m-project">Projekt</label>
              <select id="m-project" className="input" value={projectId} onChange={(e) => update({ projekt: e.target.value })}>
                <option value="">Välj projekt…</option>
                {[...byCustomer.entries()].map(([customer, list]) => (
                  <optgroup key={customer} label={customer}>
                    {list.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (avslutat)'}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="m-from">Från</label>
              <input id="m-from" type="date" className="input" value={from} max={to || undefined} onChange={(e) => update({ fran: e.target.value })} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="m-to">Till</label>
              <input id="m-to" type="date" className="input" value={to} min={from || undefined} onChange={(e) => update({ till: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {presets().map(([label, f, t]) => (
              <Button key={label} size="sm" variant={from === f && to === t ? 'primary' : 'ghost'} onClick={() => update({ fran: f, till: t })}>
                {label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {!projectId ? (
        <div className="panel empty">Välj ett projekt för att se vart massorna har körts.</div>
      ) : report.loading && !r ? <TableSkeleton rows={6} /> : r && (
        <>
          <div className="t-muted" style={{ fontSize: 13, marginBottom: 12 }}>
            {r.project.customer_name}{r.project.customer_ref ? ` · Er ref ${r.project.customer_ref}` : ''}
            {formatAddress(r.project) ? ` · ${formatAddress(r.project)}` : ''}
          </div>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <Stat label="Lass" value={r.totals.count} />
            <Stat label="Netto" value={formatTon(r.totals.netto_kg) || '0 t'} />
            <Stat label="Farligt avfall" value={r.totals.farligt_avfall} tone={r.totals.farligt_avfall ? 'var(--danger)' : undefined} />
            <Stat label="Ej granskade" value={r.totals.unreviewed} tone={r.totals.unreviewed ? 'var(--amber)' : undefined} />
          </div>

          {(r.totals.unreviewed > 0 || r.totals.missing_weight > 0) && (
            <div className="notice notice-amber" style={{ marginBottom: 16 }}>
              <span>
                {r.totals.unreviewed > 0 && <>{r.totals.unreviewed} lass är inte granskade än, så uppgifterna kan ändras. <Link to="/lass">Granska lass</Link>. </>}
                {r.totals.missing_weight > 0 && <>{r.totals.missing_weight} lass saknar vikt.</>}
              </span>
            </div>
          )}

          {r.rows.length === 0 ? (
            <div className="panel empty">Inga lass för projektet under perioden.</div>
          ) : (
            <>
              <section className="panel" style={{ marginBottom: 16 }}>
                <div className="panel-head"><h2 className="t-heading">Per mottagare och material</h2></div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Material</th><th>Avfallskod</th><th>Till</th><th style={{ textAlign: 'right' }}>Lass</th><th style={{ textAlign: 'right' }}>Netto</th></tr></thead>
                    <tbody>
                      {r.summary.map((g) => (
                        <tr key={`${g.material}|${g.avfallskod}|${g.farligt_avfall}|${g.till_namn}`}>
                          <td>{g.material ?? '–'}{g.farligt_avfall && <span className="badge badge-red" style={{ marginLeft: 6 }}>Farligt avfall</span>}</td>
                          <td className="num">{g.avfallskod ?? '–'}</td>
                          <td>{g.till_namn ?? '–'}</td>
                          <td className="num" style={{ textAlign: 'right' }}>{g.count}</td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{formatTon(g.netto_kg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel">
                <div className="panel-head"><h2 className="t-heading">Alla lass</h2></div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Datum</th><th>Vågsedel</th><th>Regnr</th><th>Material</th><th>Avfallskod</th><th style={{ textAlign: 'right' }}>Netto</th><th>Till</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {r.rows.map((l) => (
                        <tr key={l.lass_id} className="clickable" tabIndex={0}
                          onClick={() => navigate(`/lass/${l.lass_id}`)}
                          onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/lass/${l.lass_id}`); }}>
                          <td className="num">{formatDate(l.datum)}{l.tid && <span className="t-muted"> {l.tid}</span>}</td>
                          <td className="num">{l.vagsedel_nr ?? '–'}</td>
                          <td className="num">{l.vehicle_regnr ?? '–'}</td>
                          <td>{l.material ?? '–'}{l.farligt_avfall && <span className="badge badge-red" style={{ marginLeft: 6 }}>FA</span>}</td>
                          <td className="num">{l.avfallskod ?? '–'}</td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{formatTon(l.netto_kg) || '–'}</td>
                          <td>{l.till_namn ?? '–'}{l.till_orgnr && <div className="t-muted num" style={{ fontSize: 12 }}>{l.till_orgnr}</div>}</td>
                          <td><span className={`badge ${REVIEW_STATUS[l.review_status].badge}`}>{REVIEW_STATUS[l.review_status].label}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
