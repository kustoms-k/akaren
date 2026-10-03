import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Link } from '../components/Link.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useToast } from '../lib/toast.js';
import {
  JOB_STATUS, UPPDRAGSTYPER, ZONE_CLASSES, formatAddress, formatDate, formatPhone, formatQuantity, formatTimestamp,
} from '../lib/labels.js';
import { AssignmentsPanel, LassPanel } from './JobDispatch.jsx';

const FIELD_LABELS = {
  uppdragstyp: 'Uppdragstyp', datum: 'Datum', datum_till: 'Slutdatum', tid: 'Tid', material: 'Material',
  uppskattad_mangd: 'Mängd', mangd_enhet: 'Enhet', antal_lass: 'Antal lass', fran: 'Från', till: 'Till',
  instruktioner: 'Instruktioner', kontaktperson: 'Kontaktperson', telefon: 'Telefon',
};

function Row({ label, children }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="t-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function JobDetail({ params }) {
  const toast = useToast();
  const { data: job, error, loading, reload } = useApi(`/api/jobs/${params.id}`);
  const [busy, setBusy] = useState(false);

  if (loading && !job) return <TableSkeleton rows={8} />;
  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  if (!job) return null;

  async function setStatus(status) {
    setBusy(true);
    try {
      await api(`/api/jobs/${job.id}/status`, { method: 'POST', body: { status } });
      toast(status === 'klar' ? 'Uppdraget är klart' : 'Uppdraget är återöppnat');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm('Avbryta uppdraget?')) return;
    setBusy(true);
    try {
      await api(`/api/jobs/${job.id}/cancel`, { method: 'POST' });
      toast('Uppdraget är avbrutet');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const status = JOB_STATUS[job.status];
  const changed = Object.entries(job.overrides?.changed ?? {});
  const accepted = job.overrides?.acknowledged ?? [];

  return (
    <>
      <Link to="/uppdrag" className="t-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, textDecoration: 'none', fontSize: 13 }}>
        <ArrowLeft size={14} /> Alla uppdrag
      </Link>
      <PageHeader
        title={`${UPPDRAGSTYPER[job.uppdragstyp]} · ${job.project_name}`}
        description={<>{job.customer_name} · <span className={`badge ${status.badge}`}>{status.label}</span></>}
        actions={(
          <>
            {(job.status === 'bekraftad' || job.status === 'pagar') && job.lass_count === 0 && (
              <Button variant="ghost" onClick={cancel} loading={busy}>Avbryt uppdrag</Button>
            )}
            {job.status === 'pagar' && <Button variant="secondary" onClick={() => setStatus('klar')} loading={busy}>Markera som klart</Button>}
            {job.status === 'klar' && <Button variant="ghost" onClick={() => setStatus('pagar')} loading={busy}>Återöppna</Button>}
          </>
        )}
      />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-head"><h2 className="t-heading">Uppdraget</h2></div>
          <div className="panel-body" style={{ paddingTop: 4 }}>
            <Row label="Datum">
              {formatDate(job.datum_fran)}{job.datum_till && job.datum_till !== job.datum_fran ? ` – ${formatDate(job.datum_till)}` : ''}{job.tid ? `, kl ${job.tid}` : ''}
            </Row>
            <Row label="Material">{job.material}</Row>
            <Row label="Mängd">{formatQuantity(job.uppskattad_mangd, job.mangd_enhet)}</Row>
            <Row label="Antal lass">{job.antal_lass}</Row>
            <Row label="Från">{job.fran_text}</Row>
            <Row label="Till">{job.till_text}</Row>
            <Row label="Arbetsplats">{formatAddress({ address: job.project_address, postnr: job.project_postnr, ort: job.project_ort })}</Row>
            <Row label="Miljözon">{job.miljozon > 0 && <span className="badge badge-blue">{ZONE_CLASSES[job.miljozon]}</span>}</Row>
            <Row label="Er referens">{job.customer_ref}</Row>
            <Row label="Kontakt">{[job.kontaktperson, formatPhone(job.telefon)].filter(Boolean).join(', ')}</Row>
            <Row label="Instruktioner">{job.instruktioner}</Row>
            <Row label="Lass rapporterade">{String(job.lass_count)}</Row>
          </div>
          <div className="t-muted" style={{ fontSize: 12, padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
            Skapat {formatTimestamp(job.created_at)}{job.created_by_name ? ` av ${job.created_by_name}` : ''}.
          </div>
        </section>

        {job.order_text != null && (
          <section className="panel">
            <div className="panel-head"><h2 className="t-heading">Beställningen</h2></div>
            <pre style={{ margin: 0, padding: '16px 18px', font: '13px/1.6 var(--font-sans)', whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>
              {job.order_text || 'Manuell beställning utan text.'}
            </pre>
            {(changed.length > 0 || accepted.length > 0) && (
              <div className="panel-body" style={{ borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <div className="t-label" style={{ marginBottom: 6 }}>Granskning</div>
                {changed.map(([k, v]) => (
                  <div key={k}>{FIELD_LABELS[k] ?? k}: <span className="t-muted">AI läste {v.ai ?? '–'}</span> → {v.final ?? '–'}</div>
                ))}
                {accepted.length > 0 && <div className="t-muted">Kontrollerat och godkänt: {accepted.map((k) => FIELD_LABELS[k] ?? k).join(', ')}</div>}
              </div>
            )}
          </section>
        )}
      </div>

      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <AssignmentsPanel job={job} onChanged={reload} />
        <LassPanel job={job} />
      </div>
    </>
  );
}
