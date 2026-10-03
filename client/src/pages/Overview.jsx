import { Building2, FolderKanban, Truck, Users } from 'lucide-react';
import { PageHeader, ErrorNotice } from '../components/PageHeader.jsx';
import { Link } from '../components/Link.jsx';
import { useApi } from '../lib/useApi.js';
import { FORTNOX_STATUS } from '../lib/labels.js';
import { useAuth } from '../lib/auth.js';

function Stat({ label, value, Icon, to }) {
  return (
    <Link to={to} className="panel stat" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="t-label">
        <Icon size={14} /> {label}
      </div>
      <div className="stat-value num">{value ?? '–'}</div>
    </Link>
  );
}

function StatusRow({ label, ok, text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span>{label}</span>
      <span className={`badge ${ok ? 'badge-green' : 'badge-amber'}`}>{text}</span>
    </div>
  );
}

export function Overview() {
  const { user } = useAuth();
  const customers = useApi('/api/customers');
  const projects = useApi('/api/projects');
  const vehicles = useApi('/api/vehicles');
  const drivers = useApi('/api/drivers');
  const integrations = useApi('/api/settings/integrations');
  const i = integrations.data;
  const error = customers.error ?? projects.error ?? vehicles.error ?? drivers.error;

  return (
    <>
      <PageHeader title={`Hej ${user?.name ?? ''}`.trim()} description="Läget just nu." />
      <ErrorNotice error={error} />

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <Stat label="Kunder" value={customers.data?.length} Icon={Building2} to="/kunder" />
        <Stat label="Aktiva projekt" value={projects.data?.length} Icon={FolderKanban} to="/kunder" />
        <Stat label="Fordon" value={vehicles.data?.length} Icon={Truck} to="/flotta" />
        <Stat label="Förare" value={drivers.data?.length} Icon={Users} to="/flotta" />
      </div>

      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-head"><h2 className="t-heading">Kopplingar</h2></div>
        <div className="panel-body" style={{ paddingTop: 6 }}>
          {i ? (
            <>
              <StatusRow label="AI (beställningar och vågsedlar)" ok={i.ai.configured} text={i.ai.configured ? i.ai.model : 'Ingen API-nyckel'} />
              <StatusRow label="SMS till förare (46elks)" ok={i.sms.enabled} text={i.sms.enabled ? `Skickas som ${i.sms.sender}` : 'Simuleras'} />
              <StatusRow label="Fortnox" ok={i.fortnox.status === 'connected'} text={i.fortnox.configured ? FORTNOX_STATUS[i.fortnox.status] : 'Ej konfigurerat'} />
              <p className="t-muted" style={{ fontSize: 12, marginTop: 12 }}>
                Förarlänkar pekar på <span className="num">{i.public_base_url}</span>. Telefonen måste vara på samma nätverk.
              </p>
            </>
          ) : (
            <div className="skeleton" style={{ height: 96 }} />
          )}
        </div>
      </section>
    </>
  );
}
