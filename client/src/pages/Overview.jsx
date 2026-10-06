import { Briefcase, Building2, ClipboardCheck, Inbox, Mail, ReceiptText, TriangleAlert, Truck } from 'lucide-react';
import { PageHeader, ErrorNotice } from '../components/PageHeader.jsx';
import { Link } from '../components/Link.jsx';
import { useApi } from '../lib/useApi.js';
import { FORTNOX_STATUS, HAZARD_STATE, formatDate } from '../lib/labels.js';
import { useAuth } from '../lib/auth.js';

/** Hazardous-waste transports that still have to be reported, nearest deadline first. */
function HazardBanner({ rows }) {
  if (!rows?.length) return null;
  const overdue = rows.filter((h) => h.state === 'forsenad').length;
  return (
    <div className={`notice ${overdue ? 'notice-red' : 'notice-amber'}`} role="status" style={{ marginBottom: 20, flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <TriangleAlert size={15} />
        {rows.length === 1 ? 'Ett lass med farligt avfall' : `${rows.length} lass med farligt avfall`} ska rapporteras till avfallsregistret
        {overdue > 0 && ` (${overdue} försenade)`}
      </div>
      {rows.slice(0, 3).map((h) => (
        <Link key={h.id} to={`/lass/${h.id}`} style={{ color: 'inherit' }}>
          Senast {formatDate(h.deadline)}: {h.project_name}, {h.avfallskod ?? 'avfallskod saknas'}, vågsedel {h.vagsedel_nr ?? '–'}
          {' '}<span className={`badge ${HAZARD_STATE[h.state].badge}`}>{HAZARD_STATE[h.state].label}</span>
        </Link>
      ))}
      {rows.length > 3 && <Link to="/lass?flik=farligt" style={{ color: 'inherit' }}>Visa alla</Link>}
    </div>
  );
}

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
  const drafts = useApi('/api/intake?status=utkast');
  const jobs = useApi('/api/jobs');
  const customers = useApi('/api/customers');
  const vehicles = useApi('/api/vehicles');
  const integrations = useApi('/api/settings/integrations');
  const lassSummary = useApi('/api/lass/summary');
  const hazards = useApi('/api/lass/farligt-avfall');
  const inbox = useApi('/api/inbox/summary');
  const underlag = useApi('/api/fakturaunderlag');
  const u = underlag.data?.totals;
  const i = integrations.data;
  const error = drafts.error ?? jobs.error ?? customers.error ?? vehicles.error ?? lassSummary.error ?? hazards.error;
  const activeJobs = jobs.data?.filter((j) => j.status === 'bekraftad' || j.status === 'pagar').length;

  return (
    <>
      <PageHeader title={`Hej ${user?.name ?? ''}`.trim()} description="Läget just nu." />
      <ErrorNotice error={error} />
      <HazardBanner rows={hazards.data} />

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {inbox.data?.connected && <Stat label="Order i inkorgen" value={inbox.data.att_hantera} Icon={Mail} to="/inkorg" />}
        <Stat label="Utkast att granska" value={drafts.data?.length} Icon={Inbox} to="/bestallning" />
        <Stat label="Lass att granska" value={lassSummary.data?.to_review} Icon={ClipboardCheck} to="/lass" />
        <Stat label={`Underlag ${underlag.data?.label.split(' · ')[0] ?? ''}`} value={u ? `${u.ready + u.invoiced}/${u.groups}` : null} Icon={ReceiptText} to="/faktura" />
        <Stat label="Aktiva uppdrag" value={activeJobs} Icon={Briefcase} to="/uppdrag" />
        <Stat label="Kunder" value={customers.data?.length} Icon={Building2} to="/kunder" />
        <Stat label="Fordon i trafik" value={vehicles.data?.length} Icon={Truck} to="/flotta" />
      </div>

      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-head"><h2 className="t-heading">Kopplingar</h2></div>
        <div className="panel-body" style={{ paddingTop: 6 }}>
          {i ? (
            <>
              <StatusRow label="AI (beställningar och vågsedlar)" ok={i.ai.configured} text={i.ai.configured ? `${i.ai.month_cost_usd} av ${i.ai.budget_usd} USD denna månad` : 'Ingen API-nyckel'} />
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
