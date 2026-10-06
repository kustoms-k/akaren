import { useDeferredValue, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { useApi } from '../lib/useApi.js';
import { navigate, useLocation } from '../lib/router.js';
import { JOB_STATUS, UPPDRAGSTYPER, formatDate, formatQuantity, formatTon } from '../lib/labels.js';

const FILTERS = [
  ['idag', 'Idag'],
  ['aktiva', 'Aktiva'],
  ['klar', 'Klara'],
  ['avbruten', 'Avbrutna'],
  ['alla', 'Alla'],
];

const isActive = (j) => j.status === 'bekraftad' || j.status === 'pagar';
const needsTruck = (j) => isActive(j) && j.runs_today && !j.today_regnrs;

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** How far the job has got against what was ordered: loads, or tonnes when the order was in tonnes. */
function Progress({ j }) {
  const target = j.antal_lass ? { done: j.lass_count, of: j.antal_lass, text: `${j.lass_count} / ${j.antal_lass} lass` }
    : j.mangd_enhet === 'ton' && j.uppskattad_mangd ? { done: j.netto_kg / 1000, of: j.uppskattad_mangd, text: `${formatTon(j.netto_kg) || '0 t'} av ${formatQuantity(j.uppskattad_mangd, 'ton')}` }
      : null;
  if (!target && (j.uppdragstyp === 'kran' || j.uppdragstyp === 'maskintransport') && j.lass_count === 0) {
    return <span className="t-muted" style={{ fontSize: 13 }}>Timdebiterat</span>;
  }
  if (!target) {
    return (
      <span className="num">
        {j.lass_count} lass{j.netto_kg > 0 && <span className="t-muted"> · {formatTon(j.netto_kg)}</span>}
      </span>
    );
  }
  const pct = Math.min(100, Math.round((target.done / target.of) * 100));
  return (
    <div style={{ minWidth: 130 }}>
      <div className="num" style={{ fontSize: 13 }}>{target.text}</div>
      <div style={{ height: 4, borderRadius: 99, background: 'var(--surface-elevated)', marginTop: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--success)' : 'var(--accent-blue)' }} />
      </div>
    </div>
  );
}

function Today({ j }) {
  if (!isActive(j)) return <span className="t-muted">–</span>;
  if (j.today_regnrs) {
    return (
      <span>
        {j.today_regnrs.split(', ').map((r) => <span key={r} className="badge badge-muted num" style={{ marginRight: 4 }}>{r}</span>)}
        {j.lass_today > 0 && <div className="t-muted num" style={{ fontSize: 12, marginTop: 2 }}>{j.lass_today} lass idag</div>}
      </span>
    );
  }
  if (j.runs_today) return <span className="badge badge-red">Ingen bil idag</span>;
  if (j.next_assignment) return <span className="t-muted" style={{ fontSize: 13 }}>Nästa {formatDate(j.next_assignment)}</span>;
  return <span className="t-muted" style={{ fontSize: 13 }}>Inte bokad</span>;
}

export function Jobs() {
  const { query } = useLocation();
  const filter = FILTERS.some(([k]) => k === query.get('visa')) ? query.get('visa') : 'aktiva';
  const [q, setQ] = useState('');
  const search = fold(useDeferredValue(q.trim()));
  const { data, error, loading, reload } = useApi(`/api/jobs${filter === 'klar' || filter === 'avbruten' ? `?status=${filter}` : ''}`);

  let rows = data;
  if (rows && filter === 'aktiva') rows = rows.filter(isActive);
  if (rows && filter === 'idag') {
    // Jobs that run today, uncovered ones first: those are the ones to act on.
    rows = rows.filter((j) => isActive(j) && (j.runs_today || j.today_regnrs))
      .sort((a, b) => needsTruck(b) - needsTruck(a) || String(a.tid ?? '').localeCompare(String(b.tid ?? '')));
  }
  if (rows && search) {
    rows = rows.filter((j) => fold(`${j.customer_name} ${j.project_name} ${j.material} ${j.today_regnrs} ${UPPDRAGSTYPER[j.uppdragstyp]} ${j.id}`).includes(search));
  }
  const uncovered = data?.filter(needsTruck).length ?? 0;

  return (
    <>
      <PageHeader
        title="Uppdrag"
        description="Bekräftade beställningar: vilka bilar som kör idag, hur långt varje uppdrag har kommit och vad som ska granskas."
        actions={<Button onClick={() => navigate('/bestallning')}><Plus size={15} /> Ny beställning</Button>}
      />
      <ErrorNotice error={error} onRetry={reload} />
      <section className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label="Filtrera uppdrag">
            {FILTERS.map(([key, label]) => (
              <Button key={key} size="sm" variant={filter === key ? 'primary' : 'ghost'} role="tab" aria-selected={filter === key}
                onClick={() => navigate(key === 'aktiva' ? '/uppdrag' : `/uppdrag?visa=${key}`, { replace: true })}>
                {label}{key === 'idag' && uncovered > 0 && <span className="badge badge-red" style={{ marginLeft: 6, padding: '0 6px' }}>{uncovered}</span>}
              </Button>
            ))}
          </div>
          <div className="search">
            <Search size={15} />
            <input className="input" placeholder="Sök kund, projekt, regnr" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök uppdrag" />
          </div>
        </div>
        {loading && !data ? <TableSkeleton /> : rows?.length === 0 ? (
          <div className="empty">
            {search ? 'Inga uppdrag matchar sökningen.' : filter === 'idag' ? 'Inga uppdrag idag.' : 'Inga uppdrag här.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Kund / projekt</th><th>Period</th><th>Idag</th><th>Framsteg</th><th>Granska</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows?.map((j) => (
                  <tr key={j.id} className="clickable" tabIndex={0}
                    onClick={() => navigate(`/uppdrag/${j.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/uppdrag/${j.id}`); }}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{j.project_name}</div>
                      <div className="t-muted" style={{ fontSize: 12 }}>
                        {j.customer_name} · {UPPDRAGSTYPER[j.uppdragstyp]}{j.material ? ` · ${j.material}` : ''}
                      </div>
                    </td>
                    <td className="num">
                      {formatDate(j.datum_fran)}
                      {j.datum_till && j.datum_till !== j.datum_fran && <span className="t-muted"> – {formatDate(j.datum_till)}</span>}
                      {j.tid && <div className="t-muted" style={{ fontSize: 12 }}>kl {j.tid}</div>}
                    </td>
                    <td><Today j={j} /></td>
                    <td><Progress j={j} /></td>
                    <td>{j.to_review > 0 ? <span className="badge badge-amber">{j.to_review} lass</span> : <span className="t-muted">–</span>}</td>
                    <td><span className={`badge ${JOB_STATUS[j.status].badge}`}>{JOB_STATUS[j.status].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
