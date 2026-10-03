import { useState } from 'react';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { useToast } from '../lib/toast.js';
import { useApi } from '../lib/useApi.js';
import { Link } from '../components/Link.jsx';
import { VAT_MODES, ZONE_CLASSES, formatAddress, formatPhone } from '../lib/labels.js';
import { CustomerDialog, ProjectDialog } from './CustomerDialogs.jsx';

function Detail({ label, children }) {
  return (
    <div>
      <div className="t-label" style={{ marginBottom: 4 }}>{label}</div>
      <div>{children || <span className="t-muted">–</span>}</div>
    </div>
  );
}

export function CustomerDetail({ params }) {
  const toast = useToast();
  const { data: customer, error, loading, reload } = useApi(`/api/customers/${params.id}`);
  const [editing, setEditing] = useState(false);
  const [projectDialog, setProjectDialog] = useState(null); // { project } | null

  if (loading && !customer) return <TableSkeleton rows={6} />;
  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  if (!customer) return null;

  return (
    <>
      <Link to="/kunder" className="t-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, textDecoration: 'none', fontSize: 13 }}>
        <ArrowLeft size={14} /> Alla kunder
      </Link>
      <PageHeader
        title={customer.name}
        description={customer.active ? null : 'Inaktiv kund'}
        actions={<Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={14} /> Redigera</Button>}
      />

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 18 }}>
          <Detail label="Org.nr"><span className="num">{customer.org_nr}</span></Detail>
          <Detail label="Adress">{formatAddress(customer)}</Detail>
          <Detail label="E-post">{customer.email}</Detail>
          <Detail label="Telefon">{formatPhone(customer.phone)}</Detail>
          <Detail label="Moms">{customer.vat_mode ? VAT_MODES[customer.vat_mode] : 'Företagets standard'}</Detail>
          <Detail label="Fortnox">{customer.fortnox_customer_nr ? `Kundnr ${customer.fortnox_customer_nr}` : 'Inte kopplad'}</Detail>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="t-heading">Projekt</h2>
          <Button size="sm" onClick={() => setProjectDialog({ project: null })}><Plus size={14} /> Nytt projekt</Button>
        </div>
        {customer.projects.length === 0 ? (
          <div className="empty">Inga projekt än. Lägg till kundens arbetsplatser så kan lass kopplas till dem.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Projekt / arbetsplats</th><th>Er referens</th><th>Adress</th><th>Miljözon</th><th>Kontakt</th></tr>
              </thead>
              <tbody>
                {customer.projects.map((p) => (
                  <tr key={p.id} className={`clickable${p.active ? '' : ' inactive'}`} tabIndex={0}
                    onClick={() => setProjectDialog({ project: p })}
                    onKeyDown={(e) => { if (e.key === 'Enter') setProjectDialog({ project: p }); }}>
                    <td style={{ fontWeight: 550 }}>{p.name}{!p.active && <span className="badge badge-muted" style={{ marginLeft: 8 }}>Avslutat</span>}</td>
                    <td className="num">{p.customer_ref ?? '–'}</td>
                    <td>{formatAddress(p) || '–'}</td>
                    <td>{p.miljozon > 0 ? <span className="badge badge-blue">{ZONE_CLASSES[p.miljozon]}</span> : <span className="t-muted">Ingen</span>}</td>
                    <td>{p.kontaktperson ?? '–'}{p.telefon && <div className="t-muted num" style={{ fontSize: 12 }}>{formatPhone(p.telefon)}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CustomerDialog
        open={editing}
        customer={customer}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); toast('Kunden är sparad'); reload(); }}
      />
      <ProjectDialog
        open={Boolean(projectDialog)}
        customerId={customer.id}
        project={projectDialog?.project ?? null}
        onClose={() => setProjectDialog(null)}
        onSaved={(p) => { setProjectDialog(null); toast(`${p.name} är sparat`); reload(); }}
      />
    </>
  );
}
