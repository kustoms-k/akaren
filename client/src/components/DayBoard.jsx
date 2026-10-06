import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import { Button } from './Button.jsx';
import { Link } from './Link.jsx';
import { ErrorNotice, TableSkeleton } from './PageHeader.jsx';
import { useApi } from '../lib/useApi.js';
import { SMS_STATUS, UPPDRAGSTYPER, VEHICLE_TYPES, formatTon } from '../lib/labels.js';
import { dayName, todayLocal } from '../lib/days.js';

function AssignmentLine({ a, past }) {
  const smsProblem = a.sms_status === 'misslyckat' || a.sms_status === 'ej_skickat';
  return (
    <div className="board-job">
      <div style={{ minWidth: 0 }}>
        <Link to={`/uppdrag/${a.job_id}`} className="board-project">{a.project_name}</Link>
        <div className="t-muted board-sub">
          {a.customer_name} · {UPPDRAGSTYPER[a.uppdragstyp]}{a.tid ? ` · ${a.tid}` : ''}
        </div>
      </div>
      <div className="board-driver">
        {a.driver_name}
        {smsProblem && <div><span className={`badge ${SMS_STATUS[a.sms_status].badge}`}>{SMS_STATUS[a.sms_status].label}</span></div>}
      </div>
      <div className="board-progress num">
        {a.timmar != null ? (
          <strong>{String(a.timmar).replace('.', ',')} h</strong>
        ) : a.lass_count > 0 ? (
          <>
            <strong>{a.lass_count} lass</strong> <span className="t-muted">· {formatTon(a.netto_kg)}</span>
            <div className="t-muted board-sub">Senast {a.last_lass_tid ?? '–'}</div>
          </>
        ) : (
          <span className="t-muted">{past ? 'Inga lass' : 'Inga lass än'}</span>
        )}
        {a.to_review > 0 && (
          <div><Link to="/lass" className="badge badge-amber" style={{ textDecoration: 'none' }}>{a.to_review} att granska</Link></div>
        )}
      </div>
    </div>
  );
}

/**
 * Where every truck is on a day: job, driver, what it has logged. Free trucks and drivers, and the active jobs
 * running that day without a truck. Steps day by day.
 */
export function DayBoard({ datum, onDatum }) {
  const { data, error, loading, reload } = useApi(`/api/board?datum=${datum}`);
  const today = todayLocal();
  const past = datum < today;
  const b = data?.datum === datum ? data : null;

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button size="sm" variant="ghost" onClick={() => onDatum(b?.previous ?? datum)} aria-label="Föregående dag"><ChevronLeft size={14} /></Button>
          <h2 className="t-heading" style={{ minWidth: 92, textAlign: 'center' }}>{dayName(datum)}</h2>
          <Button size="sm" variant="ghost" onClick={() => onDatum(b?.next ?? datum)} aria-label="Nästa dag"><ChevronRight size={14} /></Button>
          {datum !== today && <Button size="sm" variant="ghost" onClick={() => onDatum(today)}>Idag</Button>}
        </div>
        {b && (
          <span className="t-muted num" style={{ fontSize: 13 }}>
            {b.totals.vehicles_out} av {b.totals.vehicles} bilar ute
            {b.totals.lass > 0 && <> · {b.totals.lass} lass · {formatTon(b.totals.netto_kg)}</>}
          </span>
        )}
      </div>
      <ErrorNotice error={error} onRetry={reload} />
      {!b ? (loading && <TableSkeleton rows={4} />) : (
        <>
          {b.uncovered.length > 0 && (
            <div className="board-uncovered">
              <TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>{b.uncovered.length === 1 ? 'Ett uppdrag saknar bil' : `${b.uncovered.length} uppdrag saknar bil`}</strong>
                {b.uncovered.map((j) => (
                  <div key={j.id}>
                    <Link to={`/uppdrag/${j.id}`} style={{ color: 'inherit', fontWeight: 550 }}>{j.project_name}</Link>
                    <span> · {j.customer_name} · {UPPDRAGSTYPER[j.uppdragstyp]}{j.tid ? ` kl ${j.tid}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="board">
            {b.vehicles.map((v) => (
              <div key={v.id} className={`board-row${v.assignments.length ? '' : ' board-free'}`}>
                <div className="board-truck">
                  <span className="num" style={{ fontWeight: 650 }}>{v.regnr}</span>
                  <span className="t-muted board-sub">{VEHICLE_TYPES[v.typ]}</span>
                </div>
                <div className="board-jobs">
                  {v.assignments.length === 0
                    ? <span className="t-muted">Ledig</span>
                    : v.assignments.map((a) => <AssignmentLine key={a.id} a={a} past={past} />)}
                </div>
              </div>
            ))}
          </div>
          {b.free_drivers.length > 0 && (
            <div className="t-muted" style={{ fontSize: 12.5, padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
              Lediga förare: {b.free_drivers.map((d) => d.name).join(', ')}
            </div>
          )}
        </>
      )}
    </section>
  );
}
