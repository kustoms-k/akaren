import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Link } from '../components/Link.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { navigate } from '../lib/router.js';
import { useToast } from '../lib/toast.js';
import { CONFIDENCE, MANGD_ENHETER, UPPDRAGSTYPER, ZONE_CLASSES, formatPhone, formatTimestamp, phoneKey } from '../lib/labels.js';

// Job fields; keys match the AI extraction so the server can compare.
const JOB_KEYS = ['uppdragstyp', 'datum', 'datum_till', 'tid', 'material', 'uppskattad_mangd', 'mangd_enhet',
  'antal_lass', 'fran', 'till', 'instruktioner', 'kontaktperson', 'telefon'];

const toInput = (v) => (v == null ? '' : String(v));
const same = (a, b, key) => (key === 'telefon'
  ? phoneKey(a) === phoneKey(b)
  : toInput(a).trim() === toInput(b).trim());

function ConfidenceBadge({ confidence }) {
  const c = CONFIDENCE[confidence];
  if (!c) return null;
  return <span className={`badge ${c.badge}`} title={c.hint}>{c.label}</span>;
}

/**
 * A form field that shows how sure the AI was. Low-confidence values must be changed or ticked
 * as correct; required empty fields are marked.
 */
function ConfField({ name, label, extracted, value, ack, onAck, required, error, className = '', children }) {
  const conf = extracted?.confidence;
  const needsAck = conf === 'lag' && extracted.value != null && same(value, extracted.value, name);
  const missingRequired = required && toInput(value).trim() === '';
  const changed = extracted?.value != null && !same(value, extracted.value, name);
  const cls = needsAck && !ack ? 'conf-lag' : missingRequired ? 'conf-required' : '';
  const id = `f-${name}`;
  return (
    <div className={`field ${cls} ${className}`}>
      <div className="field-top">
        <label className="field-label" htmlFor={id}>{label}{required && ' *'}</label>
        {changed ? <span className="badge badge-muted">Ändrat</span> : <ConfidenceBadge confidence={conf} />}
      </div>
      {children(id)}
      {error ? <span className="field-error" role="alert">{error}</span>
        : needsAck ? (
          <label className="ack">
            <input type="checkbox" checked={Boolean(ack)} onChange={(e) => onAck(e.target.checked)} />
            Stämmer, jag har kontrollerat
          </label>
        )
        : changed ? <span className="ai-was">AI läste: {toInput(extracted.value)}</span>
        : missingRequired ? <span className="field-error">Obligatoriskt</span>
        : null}
    </div>
  );
}

function Choice({ checked, onSelect, title, meta, reasons, children }) {
  return (
    <div className="choice" data-checked={checked} onClick={onSelect}>
      <input type="radio" checked={checked} onChange={onSelect} aria-label={title} />
      <div>
        <div className="choice-title">{title}</div>
        {meta && <div className="choice-meta">{meta}</div>}
        {reasons?.length > 0 && (
          <div className="reasons">{reasons.map((r) => <span key={r} className="badge badge-green">{r}</span>)}</div>
        )}
        {checked && children && <div className="choice-body" onClick={(e) => e.stopPropagation()}>{children}</div>}
      </div>
    </div>
  );
}

function Input({ id, value, onChange, ...rest }) {
  return <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function OrderReview({ params }) {
  const { data: intake, error, loading, reload } = useApi(`/api/intake/${params.id}`);
  if (loading && !intake) return <TableSkeleton rows={8} />;
  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  if (!intake) return null;
  if (intake.status !== 'utkast') {
    return (
      <div className="empty">
        <p style={{ marginBottom: 8 }}>Den här beställningen är redan {intake.status === 'bekraftad' ? 'bekräftad' : 'kasserad'}.</p>
        {intake.job_id ? <Link to={`/uppdrag/${intake.job_id}`}>Visa uppdraget</Link> : <Link to="/bestallning">Till beställningar</Link>}
      </div>
    );
  }
  return <ReviewForm key={intake.id} intake={intake} />;
}

function ReviewForm({ intake }) {
  const toast = useToast();
  const ex = intake.fields;
  const allCustomers = useApi('/api/customers');

  // ── Job fields ──
  const [values, setValues] = useState(() => Object.fromEntries(JOB_KEYS.map((k) => [k, k === 'telefon' ? formatPhone(ex[k]?.value) : toInput(ex[k]?.value)])));
  const [acks, setAcks] = useState(() => new Set());
  const set = (k) => (v) => setValues((s) => ({ ...s, [k]: v }));
  const ack = (k) => (on) => setAcks((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; });

  // ── Submit state ──
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [conflict, setConflict] = useState(null); // { code, message, candidates }
  const [allowSimilar, setAllowSimilar] = useState({ customer: false, project: false });

  // ── Customer ──
  const pre = intake.preselect;
  const [customerMode, setCustomerMode] = useState(() =>
    pre.customer_id ? `s:${pre.customer_id}` : intake.suggestions.customers.length ? '' : 'new');
  const [otherCustomerId, setOtherCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState(() => ({ name: toInput(ex.kund?.value), org_nr: toInput(ex.kund_orgnr?.value) }));
  const customerId = customerMode.startsWith('s:') ? Number(customerMode.slice(2))
    : customerMode === 'other' && otherCustomerId ? Number(otherCustomerId) : null;

  // ── Project ──
  const customerDetail = useApi(customerId ? `/api/customers/${customerId}` : null);
  const projectSuggestions = useMemo(
    () => intake.suggestions.projects.filter((p) => p.customer_id === customerId),
    [intake.suggestions.projects, customerId],
  );
  const [projectMode, setProjectMode] = useState(() => (pre.project_id ? `s:${pre.project_id}` : ''));
  const [otherProjectId, setOtherProjectId] = useState('');
  const [newProject, setNewProject] = useState(() => ({
    name: toInput(ex.projekt?.value), customer_ref: '', address: toInput(ex.adress?.value),
    postnr: toInput(ex.postnr?.value), ort: toInput(ex.ort?.value), miljozon: '0',
    kontaktperson: toInput(ex.kontaktperson?.value), telefon: formatPhone(ex.telefon?.value),
  }));
  // A new customer can only get a new project.
  const effectiveProjectMode = customerMode === 'new' ? 'new' : projectMode;
  const projectId = effectiveProjectMode.startsWith('s:') ? Number(effectiveProjectMode.slice(2))
    : effectiveProjectMode === 'other' && otherProjectId ? Number(otherProjectId) : null;

  function chooseCustomer(mode) {
    setCustomerMode(mode);
    setProjectMode('');
    setOtherProjectId('');
    setConflict(null);
  }

  // Select an existing customer/project by id, whether it was suggested or not.
  function pickCustomer(id) {
    if (intake.suggestions.customers.some((c) => c.id === id)) chooseCustomer(`s:${id}`);
    else { chooseCustomer('other'); setOtherCustomerId(String(id)); }
  }
  function pickProject(id) {
    if (projectSuggestions.some((p) => p.id === id)) setProjectMode(`s:${id}`);
    else { setProjectMode('other'); setOtherProjectId(String(id)); }
    setConflict(null);
  }


  const unresolved = JOB_KEYS.filter((k) => ex[k]?.confidence === 'lag' && ex[k].value != null && same(values[k], ex[k].value, k) && !acks.has(k));
  const missing = intake.required.filter((k) => !values[k].trim());
  const customerReady = customerMode === 'new' ? newCustomer.name.trim() !== '' : customerId != null;
  const projectReady = effectiveProjectMode === 'new' ? newProject.name.trim() !== '' : projectId != null;
  const blockers = [
    ...(!customerReady ? ['välj kund'] : []),
    ...(!projectReady ? ['välj projekt'] : []),
    ...(missing.length ? ['fyll i obligatoriska fält'] : []),
    ...(unresolved.length ? [`kontrollera ${unresolved.length} osäkra fält`] : []),
  ];

  async function confirm() {
    setBusy(true);
    setErrors({});
    setFormError(null);
    setConflict(null);
    const fields = Object.fromEntries(JOB_KEYS.map((k) => [k, values[k].trim() === '' ? null : values[k].trim()]));
    const body = {
      fields,
      acknowledged: [...acks],
      customer: customerMode === 'new'
        ? { new: { name: newCustomer.name, org_nr: newCustomer.org_nr || null }, ...(allowSimilar.customer ? { allow_similar: true } : {}) }
        : { id: customerId },
      project: effectiveProjectMode === 'new'
        ? { new: { ...newProject, miljozon: Number(newProject.miljozon) }, ...(allowSimilar.project ? { allow_similar: true } : {}) }
        : { id: projectId },
    };
    try {
      const res = await api(`/api/intake/${intake.id}/confirm`, { method: 'POST', body });
      toast('Uppdraget är skapat');
      navigate(`/uppdrag/${res.job_id}`);
    } catch (err) {
      setBusy(false);
      if (['similar_customer', 'similar_project', 'duplicate_org_nr'].includes(err.code)) {
        setConflict({ code: err.code, message: err.message, candidates: err.body?.error?.candidates ?? [], existingId: err.body?.error?.existing_id });
        return;
      }
      const mapped = {};
      for (const [k, v] of Object.entries(err.fields ?? {})) mapped[k.replace(/^fields\./, '')] = v;
      setErrors(mapped);
      if (!Object.keys(mapped).length) setFormError(err.message);
    }
  }

  async function discard() {
    if (!window.confirm('Kassera beställningen? Texten sparas inte som uppdrag.')) return;
    try {
      await api(`/api/intake/${intake.id}/discard`, { method: 'POST' });
      toast('Beställningen är kasserad');
      navigate('/bestallning');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const cf = (name, label, { required, className, render } = {}) => (
    <ConfField
      key={name} name={name} label={label} extracted={ex[name]} value={values[name]}
      ack={acks.has(name)} onAck={ack(name)} required={required} error={errors[name]} className={className}
    >
      {(id) => render ? render(id) : <Input id={id} value={values[name]} onChange={set(name)} />}
    </ConfField>
  );

  const otherCustomers = (allCustomers.data ?? []).filter((c) => !intake.suggestions.customers.some((s) => s.id === c.id));
  const customerProjects = customerDetail.data?.projects?.filter((p) => p.active) ?? [];
  const otherProjects = customerProjects.filter((p) => !projectSuggestions.some((s) => s.id === p.id));

  return (
    <>
      <Link to="/bestallning" className="t-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, textDecoration: 'none', fontSize: 13 }}>
        <ArrowLeft size={14} /> Beställningar
      </Link>
      <PageHeader
        title="Granska beställning"
        description={intake.source === 'ai'
          ? 'Kontrollera uppgifterna mot texten. Osäkra fält är markerade.'
          : 'Fyll i uppgifterna för uppdraget.'}
        actions={<Button variant="ghost" onClick={discard}><Trash2 size={14} /> Kassera</Button>}
      />

      <div className="review">
        <aside className="panel review-source">
          <div className="panel-head">
            <h2 className="t-heading">Originaltext</h2>
            {intake.source === 'ai' && <span className="badge badge-muted"><Sparkles size={11} /> {intake.model}</span>}
          </div>
          <pre>{intake.raw_text || 'Ingen text (manuell beställning).'}</pre>
          <div className="t-muted" style={{ fontSize: 12, padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
            Inläst {formatTimestamp(intake.created_at)}{intake.created_by_name ? ` av ${intake.created_by_name}` : ''}
          </div>
        </aside>

        <div style={{ display: 'grid', gap: 16 }}>
          {intake.warnings.length > 0 && (
            <div className="notice notice-amber" role="status">
              <span>{intake.warnings.join(' ')}</span>
            </div>
          )}

          {/* Customer */}
          <section className="panel">
            <div className="panel-body">
              <div className="section-title">
                <h2 className="t-heading">Kund</h2>
                {ex.kund?.value && <span className="t-muted" style={{ fontSize: 13 }}>AI läste: {ex.kund.value}{ex.kund_orgnr?.value ? ` (${ex.kund_orgnr.value})` : ''}</span>}
              </div>
              <div className="choice-list" role="radiogroup" aria-label="Kund">
                {intake.suggestions.customers.map((c) => (
                  <Choice key={c.id} checked={customerMode === `s:${c.id}`} onSelect={() => chooseCustomer(`s:${c.id}`)}
                    title={c.name} meta={c.org_nr} reasons={c.reasons} />
                ))}
                <Choice checked={customerMode === 'other'} onSelect={() => chooseCustomer('other')}
                  title={intake.suggestions.customers.length ? 'Annan befintlig kund' : 'Befintlig kund'}>
                  <select className="input" value={otherCustomerId} onChange={(e) => { setOtherCustomerId(e.target.value); setProjectMode(''); }} aria-label="Välj kund">
                    <option value="">Välj kund…</option>
                    {otherCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.org_nr ? ` (${c.org_nr})` : ''}</option>)}
                  </select>
                </Choice>
                <Choice checked={customerMode === 'new'} onSelect={() => chooseCustomer('new')} title="Ny kund">
                  <div className="form-grid">
                    <div className="field span-2">
                      <label className="field-label" htmlFor="nc-name">Namn *</label>
                      <Input id="nc-name" value={newCustomer.name} onChange={(v) => setNewCustomer((s) => ({ ...s, name: v }))} />
                      {errors['customer.new.name'] && <span className="field-error">{errors['customer.new.name']}</span>}
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor="nc-org">Organisationsnummer</label>
                      <Input id="nc-org" value={newCustomer.org_nr} onChange={(v) => setNewCustomer((s) => ({ ...s, org_nr: v }))} />
                      {errors['customer.new.org_nr'] && <span className="field-error">{errors['customer.new.org_nr']}</span>}
                    </div>
                  </div>
                </Choice>
              </div>
            </div>
          </section>

          {/* Project */}
          <section className="panel">
            <div className="panel-body">
              <div className="section-title">
                <h2 className="t-heading">Projekt / arbetsplats</h2>
                {ex.projekt?.value && <span className="t-muted" style={{ fontSize: 13 }}>AI läste: {ex.projekt.value}</span>}
              </div>
              {customerMode === '' || (customerMode === 'other' && !otherCustomerId) ? (
                <p className="t-muted">Välj kund först.</p>
              ) : (
                <div className="choice-list" role="radiogroup" aria-label="Projekt">
                  {customerMode !== 'new' && projectSuggestions.map((p) => (
                    <Choice key={p.id} checked={effectiveProjectMode === `s:${p.id}`} onSelect={() => setProjectMode(`s:${p.id}`)}
                      title={p.name} meta={[p.address, p.customer_ref && `Ref ${p.customer_ref}`].filter(Boolean).join(' · ')} reasons={p.reasons} />
                  ))}
                  {customerMode !== 'new' && otherProjects.length > 0 && (
                    <Choice checked={effectiveProjectMode === 'other'} onSelect={() => setProjectMode('other')}
                      title={projectSuggestions.length ? 'Annat projekt hos kunden' : 'Befintligt projekt'}>
                      <select className="input" value={otherProjectId} onChange={(e) => setOtherProjectId(e.target.value)} aria-label="Välj projekt">
                        <option value="">Välj projekt…</option>
                        {otherProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </Choice>
                  )}
                  <Choice checked={effectiveProjectMode === 'new'} onSelect={() => setProjectMode('new')} title="Nytt projekt">
                    <div className="form-grid">
                      {[
                        ['name', 'Projekt / arbetsplats *', 'span-2'],
                        ['customer_ref', 'Kundens referens'],
                        ['address', 'Adress'],
                        ['postnr', 'Postnummer'],
                        ['ort', 'Ort'],
                      ].map(([k, label, cls]) => (
                        <div key={k} className={`field ${cls ?? ''}`}>
                          <label className="field-label" htmlFor={`np-${k}`}>{label}</label>
                          <Input id={`np-${k}`} value={newProject[k]} onChange={(v) => setNewProject((s) => ({ ...s, [k]: v }))} />
                          {errors[`project.new.${k}`] && <span className="field-error">{errors[`project.new.${k}`]}</span>}
                        </div>
                      ))}
                      <div className="field">
                        <label className="field-label" htmlFor="np-zon">Miljözon</label>
                        <select id="np-zon" className="input" value={newProject.miljozon} onChange={(e) => setNewProject((s) => ({ ...s, miljozon: e.target.value }))}>
                          {Object.entries(ZONE_CLASSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                  </Choice>
                </div>
              )}
            </div>
          </section>

          {/* Job */}
          <section className="panel">
            <div className="panel-body">
              <div className="section-title"><h2 className="t-heading">Uppdrag</h2></div>
              <div className="form-grid">
                {cf('uppdragstyp', 'Uppdragstyp', {
                  required: true,
                  render: (id) => (
                    <select id={id} className="input" value={values.uppdragstyp} onChange={(e) => set('uppdragstyp')(e.target.value)}>
                      <option value="">Välj…</option>
                      {Object.entries(UPPDRAGSTYPER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ),
                })}
                {cf('material', 'Material')}
                {cf('datum', 'Datum', { required: true, render: (id) => <Input id={id} type="date" value={values.datum} onChange={set('datum')} /> })}
                {cf('tid', 'Starttid', { render: (id) => <Input id={id} type="time" value={values.tid} onChange={set('tid')} /> })}
                {cf('datum_till', 'Slutdatum (flera dagar)', { render: (id) => <Input id={id} type="date" value={values.datum_till} onChange={set('datum_till')} /> })}
                {cf('antal_lass', 'Antal lass', { render: (id) => <Input id={id} type="number" min={1} inputMode="numeric" value={values.antal_lass} onChange={set('antal_lass')} /> })}
                {cf('uppskattad_mangd', 'Uppskattad mängd', {
                  render: (id) => <Input id={id} type="number" min={0} step="any" inputMode="decimal" value={values.uppskattad_mangd} onChange={set('uppskattad_mangd')} />,
                })}
                {cf('mangd_enhet', 'Enhet', {
                  render: (id) => (
                    <select id={id} className="input" value={values.mangd_enhet} onChange={(e) => set('mangd_enhet')(e.target.value)}>
                      <option value="">–</option>
                      {Object.entries(MANGD_ENHETER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ),
                })}
                {cf('fran', 'Från')}
                {cf('till', 'Till')}
                {cf('kontaktperson', 'Kontaktperson')}
                {cf('telefon', 'Telefon', { render: (id) => <Input id={id} type="tel" value={values.telefon} onChange={set('telefon')} /> })}
                {cf('instruktioner', 'Instruktioner till föraren', {
                  className: 'span-2',
                  render: (id) => <textarea id={id} className="input" rows={3} value={values.instruktioner} onChange={(e) => set('instruktioner')(e.target.value)} />,
                })}
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="action-bar">
        {conflict && (
          <div className="notice notice-amber" role="alert" style={{ flexDirection: 'column', gap: 8, width: '100%' }}>
            <div>{conflict.message}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {conflict.code === 'duplicate_org_nr' && conflict.existingId && (
                <Button size="sm" onClick={() => pickCustomer(conflict.existingId)}>
                  Använd befintlig kund
                </Button>
              )}
              {conflict.code === 'similar_customer' && conflict.candidates.map((c) => (
                <Button key={c.id} size="sm" variant="secondary" onClick={() => pickCustomer(c.id)}>
                  Använd {c.name}
                </Button>
              ))}
              {conflict.code === 'similar_project' && conflict.candidates.map((p) => (
                <Button key={p.id} size="sm" variant="secondary" onClick={() => pickProject(p.id)}>
                  Använd {p.name}
                </Button>
              ))}
              {conflict.code !== 'duplicate_org_nr' && (
                <Button size="sm" variant="ghost" onClick={() => {
                  setAllowSimilar((s) => ({ ...s, [conflict.code === 'similar_customer' ? 'customer' : 'project']: true }));
                  setConflict(null);
                }}>
                  Nej, det är ny – skapa ändå
                </Button>
              )}
            </div>
          </div>
        )}
        {formError && <div className="notice notice-red" role="alert" style={{ width: '100%' }}>{formError}</div>}
        <span className={blockers.length ? 't-muted' : ''} style={{ fontSize: 13 }}>
          {blockers.length ? `Kvar att göra: ${blockers.join(', ')}.` : 'Allt är kontrollerat.'}
        </span>
        <Button size="lg" onClick={confirm} loading={busy} disabled={blockers.length > 0}>
          <Check size={16} /> Skapa uppdrag
        </Button>
      </div>
    </>
  );
}
