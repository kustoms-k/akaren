import { useEffect, useState } from 'react';
import { Button } from '../components/Button.jsx';
import { Field, TextField, SelectField } from '../components/Field.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { useToast } from '../lib/toast.js';
import { useAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useForm } from '../lib/useForm.js';
import { navigate, useLocation } from '../lib/router.js';
import { FORTNOX_STATUS, VAT_MODES, formatAgo, formatPhone, formatTimestamp } from '../lib/labels.js';
import { Link } from '../components/Link.jsx';

const COMPANY_FIELDS = ['name', 'org_nr', 'address', 'postnr', 'ort', 'phone', 'email', 'bankgiro', 'default_vat_mode', 'retention_months', 'order_terms'];

const TERMS_EXAMPLE = 'Uppdraget utförs enligt Alltrans 2007. Avbokning senast kl 15.00 vardagen före, annars debiteras framkörning. Väntetid över 15 minuter debiteras per påbörjad kvart.';

function CompanyForm({ company, onSaved }) {
  const form = useForm({});
  const { reset } = form;
  useEffect(() => {
    reset({
      ...Object.fromEntries(COMPANY_FIELDS.map((k) => [k, company[k] ?? ''])),
      phone: formatPhone(company.phone),
      retention_months: String(company.retention_months),
    });
  }, [company, reset]);

  async function save(e) {
    e.preventDefault();
    try {
      onSaved(await form.submit((v) => api('/api/settings', {
        method: 'PATCH',
        body: { ...v, retention_months: Number(v.retention_months) },
      })));
    } catch { /* shown inline */ }
  }

  return (
    <form onSubmit={save}>
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2 className="t-heading">Företaget</h2></div>
        <div className="panel-body form-grid">
          <TextField className="span-2" label="Företagsnamn" required {...form.field('name')} />
          <TextField label="Organisationsnummer" {...form.field('org_nr')} />
          <TextField label="Bankgiro" {...form.field('bankgiro')} />
          <TextField className="span-2" label="Adress" {...form.field('address')} />
          <TextField label="Postnummer" inputMode="numeric" {...form.field('postnr')} />
          <TextField label="Ort" {...form.field('ort')} />
          <TextField label="E-post" type="email" hint="Svar på orderbekräftelser kommer hit." {...form.field('email')} />
          <TextField label="Telefon" type="tel" hint="Visas i orderbekräftelsen." {...form.field('phone')} />
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2 className="t-heading">Orderbekräftelse</h2></div>
        <div className="panel-body form-grid">
          <Field
            className="span-2"
            label="Villkor i orderbekräftelsen"
            hint="Visas sist i varje orderbekräftelse. Hänvisa till de villkor ni använder (t.ex. Alltrans 2007) och skriv vad som gäller för avbokning och väntetid."
            error={form.errors.order_terms}
          >
            {(id) => (
              <textarea id={id} className="input" rows={4} maxLength={2000} placeholder={TERMS_EXAMPLE}
                value={form.values.order_terms ?? ''} onChange={(e) => form.field('order_terms').onChange(e.target.value)} />
            )}
          </Field>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2 className="t-heading">Fakturering och datalagring</h2></div>
        <div className="panel-body form-grid">
          <SelectField
            label="Standardmoms för kunder"
            options={Object.entries(VAT_MODES)}
            hint="Kan ändras per kund. Stäm av omvänd byggmoms med er redovisningskonsult."
            {...form.field('default_vat_mode')}
          />
          <TextField
            label="Spara foton och förardata (månader)"
            type="number" min={12} max={120} inputMode="numeric"
            hint="Varje natt raderas vågsedelfoton som är äldre än så, och förare som slutat anonymiseras. Själva lassen sparas som spårbarhet och bokföringsunderlag."
            {...form.field('retention_months')}
          />
          {form.formError && <div className="notice notice-red span-2">{form.formError}</div>}
        </div>
        <div className="dialog-foot" style={{ borderRadius: '0 0 12px 12px' }}>
          <Button type="submit" loading={form.busy}>Spara inställningar</Button>
        </div>
      </section>
    </form>
  );
}

function FortnoxPanel() {
  const toast = useToast();
  const { data: status, error, reload, setData } = useApi('/api/fortnox/status');
  const [busy, setBusy] = useState(null);

  async function run(kind, fn) {
    setBusy(kind);
    try { await fn(); } catch (err) { toast(err.message, 'error'); reload(); } finally { setBusy(null); }
  }

  const connect = () => run('connect', async () => {
    const { url } = await api('/api/fortnox/connect-url');
    window.location.assign(url);
  });
  const disconnect = () => run('disconnect', async () => {
    setData(await api('/api/fortnox/disconnect', { method: 'POST' }));
    toast('Fortnox är frånkopplat');
  });
  const sync = () => run('sync', async () => {
    const r = await api('/api/fortnox/sync-customers', { method: 'POST' });
    toast(`Kunder synkade: ${r.created} nya, ${r.linked} kopplade, ${r.updated} uppdaterade`);
    reload();
  });

  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h2 className="t-heading">Fortnox</h2>
        {status && <span className={`badge ${status.status === 'connected' ? 'badge-green' : status.status === 'reconnect_required' ? 'badge-red' : 'badge-muted'}`}>{FORTNOX_STATUS[status.status]}</span>}
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
        <ErrorNotice error={error} onRetry={reload} />
        {!status ? <TableSkeleton rows={2} /> : !status.configured ? (
          <p className="t-muted">Fortnox är inte konfigurerat på servern. Lägg in <code>FORTNOX_CLIENT_ID</code>, <code>FORTNOX_CLIENT_SECRET</code> och <code>FORTNOX_REDIRECT_URI</code> i <code>server/.env</code>.</p>
        ) : (
          <>
            {status.status === 'reconnect_required' && (
              <div className="notice notice-red">Kopplingen har gått ut (Fortnox kräver ny inloggning efter 45 dagar utan användning). Anslut igen för att kunna skapa fakturautkast.</div>
            )}
            <p className="t-muted" style={{ fontSize: 13 }}>
              Åkaren skapar bara <strong>fakturautkast</strong> i Fortnox. Inget bokförs eller skickas automatiskt.
              {status.connected_at && <> Ansluten {formatTimestamp(status.connected_at)}.</>}
              {status.last_sync_at && <> Kunder synkade {formatTimestamp(status.last_sync_at)}.</>}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {status.status !== 'connected' ? (
                <Button onClick={connect} loading={busy === 'connect'}>{status.status === 'reconnect_required' ? 'Anslut igen' : 'Anslut Fortnox'}</Button>
              ) : (
                <>
                  <Button onClick={sync} loading={busy === 'sync'}>Synka kunder</Button>
                  <Button variant="ghost" onClick={disconnect} loading={busy === 'disconnect'}>Koppla från</Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

const PROVIDERS = { demo: 'Demoinkorg', microsoft: 'Microsoft 365', google: 'Google', imap: 'IMAP' };

function InboxPanel() {
  const { data } = useApi('/api/settings/integrations');
  if (!data) return null;
  const box = data.inbox;
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h2 className="t-heading">Inkorg för beställningar</h2>
        <span className={`badge ${box ? (box.provider === 'demo' ? 'badge-blue' : 'badge-green') : 'badge-muted'}`}>{box ? PROVIDERS[box.provider] : 'Inte kopplad'}</span>
      </div>
      <div className="panel-body">
        <p className="t-muted" style={{ fontSize: 13 }}>
          {box
            ? <>Åkaren läser <strong>{box.address}</strong>, sorterar ut beställningarna och läser av dem. Senast hämtad {formatAgo(box.last_sync_at)}. <Link to="/inkorg">Öppna inkorgen</Link>.</>
            : <>Koppla en adress som tar emot beställningar, så hamnar de i <Link to="/inkorg">inkorgen</Link> sorterade och avlästa. Koppling till Microsoft 365, Google och IMAP kommer snart.</>}
        </p>
      </div>
    </section>
  );
}

function MailPanel() {
  const { data } = useApi('/api/settings/integrations');
  const mail = data?.mail;
  if (!mail) return null;
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h2 className="t-heading">E-post</h2>
        <span className={`badge ${mail.enabled ? 'badge-green' : 'badge-blue'}`}>{mail.enabled ? 'Aktiv' : 'Simuleras'}</span>
      </div>
      <div className="panel-body">
        <p className="t-muted" style={{ fontSize: 13 }}>
          {mail.enabled
            ? <>Orderbekräftelser skickas från <strong>{mail.from}</strong> med ert företagsnamn som avsändare.</>
            : <>Orderbekräftelser sparas men skickas inte. Lägg in <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code> och <code>MAIL_FROM</code> i <code>server/.env</code> för att skicka på riktigt.</>}
        </p>
      </div>
    </section>
  );
}

function AiPanel() {
  const { data } = useApi('/api/settings/integrations');
  const ai = data?.ai;
  if (!ai) return null;
  const pct = ai.budget_usd > 0 ? Math.min(100, Math.round((ai.month_cost_usd / ai.budget_usd) * 100)) : 100;
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h2 className="t-heading">AI-tolkning</h2>
        <span className={`badge ${ai.configured ? 'badge-green' : 'badge-amber'}`}>{ai.demo ? 'Demoläge' : ai.configured ? ai.model : 'Ingen API-nyckel'}</span>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span>Denna månad: <strong className="num">{ai.month_cost_usd} USD</strong> av {ai.budget_usd} USD ({ai.calls} anrop)</span>
          <span className="t-muted num">{pct} %</span>
        </div>
        <div style={{ height: 6, background: 'var(--surface-elevated)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? 'var(--danger)' : 'var(--accent)', borderRadius: 99 }} />
        </div>
        <p className="t-muted" style={{ fontSize: 12 }}>
          Uppskattad kostnad enligt listpris. När budgeten är slut stoppas AI-tolkningen till nästa månad. Ändra med AI_MONTHLY_BUDGET_USD i server/.env.
        </p>
      </div>
    </section>
  );
}

export function Settings() {
  const toast = useToast();
  const { query } = useLocation();
  const { setCompanyName } = useAuth();
  const { data: company, error, reload, setData } = useApi('/api/settings');

  // Result of the Fortnox OAuth redirect.
  const fortnoxResult = query.get('fortnox');
  useEffect(() => {
    if (!fortnoxResult) return;
    if (fortnoxResult === 'connected') toast('Fortnox är anslutet');
    else toast('Fortnox kunde inte anslutas. Försök igen.', 'error');
    navigate('/installningar', { replace: true });
  }, [fortnoxResult, toast]);

  return (
    <>
      <PageHeader title="Inställningar" />
      <ErrorNotice error={error} onRetry={reload} />
      <div style={{ maxWidth: 760 }}>
        <FortnoxPanel />
        <InboxPanel />
        <AiPanel />
        <MailPanel />
        {company ? (
          <CompanyForm company={company} onSaved={(c) => { setData(c); setCompanyName(c.name); toast('Inställningarna är sparade'); }} />
        ) : !error && <TableSkeleton rows={6} />}
      </div>
    </>
  );
}
