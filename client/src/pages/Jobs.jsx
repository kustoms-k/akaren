import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { useApi } from '../lib/useApi.js';
import { navigate } from '../lib/router.js';
import { JOB_STATUS, UPPDRAGSTYPER, formatDate, formatQuantity } from '../lib/labels.js';

const FILTERS = [
  ['aktiva', 'Aktiva'],
  ['klar', 'Klara'],
  ['avbruten', 'Avbrutna'],
  ['alla', 'Alla'],
];

export function Jobs() {
  const [filter, setFilter] = useState('aktiva');
  const { data, error, loading, reload } = useApi(`/api/jobs${filter === 'klar' || filter === 'avbruten' ? `?status=${filter}` : ''}`);
  const rows = filter === 'aktiva' ? data?.filter((j) => j.status === 'bekraftad' || j.status === 'pagar') : data;

  return (
    <>
      <PageHeader
        title="Uppdrag"
        description="Bekräftade beställningar. Härifrån tilldelas fordon och förare."
        actions={<Button onClick={() => navigate('/bestallning')}><Plus size={15} /> Ny beställning</Button>}
      />
      <ErrorNotice error={error} onRetry={reload} />
      <section className="panel">
        <div className="panel-head">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label="Filtrera uppdrag">
            {FILTERS.map(([key, label]) => (
              <Button key={key} size="sm" variant={filter === key ? 'primary' : 'ghost'} onClick={() => setFilter(key)} role="tab" aria-selected={filter === key}>
                {label}
              </Button>
            ))}
          </div>
        </div>
        {loading && !data ? <TableSkeleton /> : rows?.length === 0 ? (
          <div className="empty">Inga uppdrag här.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Datum</th><th>Kund / projekt</th><th>Typ</th><th>Material</th><th>Lass</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows?.map((j) => (
                  <tr key={j.id} className="clickable" tabIndex={0}
                    onClick={() => navigate(`/uppdrag/${j.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/uppdrag/${j.id}`); }}>
                    <td className="num">
                      {formatDate(j.datum_fran)}
                      {j.datum_till && j.datum_till !== j.datum_fran && <span className="t-muted"> – {formatDate(j.datum_till)}</span>}
                      {j.tid && <div className="t-muted" style={{ fontSize: 12 }}>{j.tid}</div>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 550 }}>{j.customer_name}</div>
                      <div className="t-muted" style={{ fontSize: 12 }}>{j.project_name}</div>
                    </td>
                    <td>{UPPDRAGSTYPER[j.uppdragstyp]}</td>
                    <td>{j.material ?? '–'}{j.uppskattad_mangd != null && <div className="t-muted" style={{ fontSize: 12 }}>{formatQuantity(j.uppskattad_mangd, j.mangd_enhet)}</div>}</td>
                    <td className="num">{j.lass_count}{j.antal_lass ? <span className="t-muted"> / {j.antal_lass}</span> : null}</td>
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
