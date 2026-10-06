import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, SkipForward, Undo2 } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { AuthImage } from '../components/AuthImage.jsx';
import { Link } from '../components/Link.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { navigate } from '../lib/router.js';
import { useToast } from '../lib/toast.js';
import { useWorkCounts } from '../lib/workCounts.js';
import {
  HAZARD_STATE, LASS_CONFIDENCE, LASS_FIELD_LABELS, REVIEW_STATUS, UPPDRAGSTYPER,
  formatDate, formatDateTime, formatLassValue, kgToTonInput, tonToKg,
} from '../lib/labels.js';

// [key, label, input type, wide]
const FIELDS = [
  ['vagsedel_nr', 'Vågsedelnummer', 'text'],
  ['netto_kg', 'Nettovikt (ton)', 'ton'],
  ['datum', 'Datum', 'date'],
  ['tid', 'Tid', 'time'],
  ['material', 'Material', 'text'],
  ['avfallskod', 'Avfallskod (6 siffror)', 'text'],
  ['fran_text', 'Från', 'text', true],
  ['till_namn', 'Till (mottagare)', 'text', true],
  ['till_orgnr', 'Mottagarens org.nr', 'text'],
  ['till_adress', 'Mottagarens adress', 'text'],
];
const LASS_KEYS = [...FIELDS.map(([k]) => k), 'farligt_avfall'];

// Lass field <- AI vågsedel field, for "AI läste".
const FROM_AI = {
  vagsedel_nr: 'vagsedel_nr', datum: 'datum', tid: 'tid', material: 'material', netto_kg: 'netto_kg',
  avfallskod: 'avfallskod', farligt_avfall: 'farligt_avfall', fran_text: 'lastplats', till_namn: 'mottagare',
  till_orgnr: 'mottagare_orgnr', till_adress: 'mottagare_adress',
};

const toForm = (l) => ({
  ...Object.fromEntries(FIELDS.map(([k]) => [k, k === 'netto_kg' ? kgToTonInput(l[k]) : l[k] ?? ''])),
  farligt_avfall: Boolean(l.farligt_avfall),
  note: l.note ?? '',
});

const same = (a, b) => String(a ?? '') === String(b ?? '');

export function LassDetail({ params }) {
  const { data, error, loading, reload } = useApi(`/api/lass/${params.id}`);
  if (loading && !data) return <TableSkeleton rows={8} />;
  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  if (!data) return null;
  return <LassReview key={`${data.lass.lass_id}-${data.lass.version}`} data={data} reload={reload} />;
}

function LassReview({ data, reload }) {
  const toast = useToast();
  const { lass, context, versions, ai, invoiced, hazard } = data;
  const [form, setForm] = useState(() => toForm(lass));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [zoom, setZoom] = useState(false);
  const reviewed = lass.review_status === 'granskad';
  const readOnly = invoiced;
  const counts = useWorkCounts(lass.lass_id);
  const inQueue = lass.review_status === 'behover_granskas';

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  // Parsed values and what differs from the saved version.
  const nettoKg = tonToKg(form.netto_kg);
  const parsed = {
    ...Object.fromEntries(FIELDS.map(([k]) => [k, String(form[k]).trim() || null])),
    netto_kg: Number.isNaN(nettoKg) ? form.netto_kg : nettoKg,
    farligt_avfall: form.farligt_avfall,
  };
  const changed = LASS_KEYS.filter((k) => !same(parsed[k], k === 'farligt_avfall' ? Boolean(lass[k]) : lass[k]));
  const noteChanged = !same(form.note.trim() || null, lass.note);
  const dirty = changed.length > 0 || noteChanged;

  function body(withReason) {
    if (Number.isNaN(nettoKg)) {
      setErrors({ netto_kg: 'Skriv vikten i ton, t.ex. 18,42' });
      return null;
    }
    return {
      ...(changed.length ? { fields: Object.fromEntries(changed.map((k) => [k, parsed[k]])) } : {}),
      ...(noteChanged ? { note: form.note.trim() || null } : {}),
      ...(withReason && reason.trim() ? { change_reason: reason.trim() } : {}),
    };
  }

  function showErrors(err) {
    const mapped = {};
    for (const [k, v] of Object.entries(err.fields ?? {})) mapped[k.replace(/^fields\./, '')] = v;
    setErrors(mapped);
    setFormError(Object.keys(mapped).length ? null : err.message);
  }

  async function approve() {
    const b = body(true);
    if (!b) return;
    setBusy('approve');
    setFormError(null);
    try {
      const res = await api(`/api/lass/${lass.lass_id}/review`, { method: 'POST', body: b });
      toast(changed.length ? 'Lasset är rättat och godkänt' : 'Lasset är godkänt');
      navigate(res.next_review_id ? `/lass/${res.next_review_id}` : '/lass');
    } catch (err) {
      showErrors(err);
      setBusy(null);
    }
  }

  async function saveCorrection() {
    const b = body(true);
    if (!b) return;
    if (!reason.trim()) {
      setErrors({ change_reason: 'Ange varför värdena ändras.' });
      return;
    }
    setBusy('save');
    setFormError(null);
    try {
      await api(`/api/lass/${lass.lass_id}/versions`, { method: 'POST', body: b });
      toast('Rättelsen är sparad');
      reload();
    } catch (err) {
      showErrors(err);
      setBusy(null);
    }
  }

  const status = REVIEW_STATUS[lass.review_status];
  const canApprove = !readOnly && !reviewed && busy === null && !(changed.length > 0 && !reason.trim());

  // ⌘/Ctrl + Enter approves, so a queue of lass can be worked through from the keyboard.
  const approveRef = useRef(null);
  useEffect(() => { approveRef.current = canApprove ? approve : null; });
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && approveRef.current) {
        e.preventDefault();
        approveRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Link to="/lass" className="t-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, textDecoration: 'none', fontSize: 13 }}>
        <ArrowLeft size={14} /> Granska lass
      </Link>
      <PageHeader
        title={lass.vagsedel_nr ? `Vågsedel ${lass.vagsedel_nr}` : `Lass ${lass.lass_id}`}
        description={<>{context.customer_name} · {context.project_name} · <span className={`badge ${status.badge}`}>{status.label}</span></>}
        actions={inQueue && (
          <>
            {counts.review > 0 && <span className="t-muted" style={{ fontSize: 13, alignSelf: 'center' }}>{counts.review} kvar att granska</span>}
            {data.next_review_id && (
              <Button variant="ghost" size="sm" onClick={() => navigate(`/lass/${data.next_review_id}`)}><SkipForward size={14} /> Hoppa över</Button>
            )}
          </>
        )}
      />

      <div className="review">
        <aside className="panel review-source">
          <div className="panel-head">
            <h2 className="t-heading">Vågsedel</h2>
            {lass.photo_id && <Button size="sm" variant="ghost" onClick={() => setZoom(true)}>Förstora</Button>}
          </div>
          {lass.photo_id ? (
            <button type="button" onClick={() => setZoom(true)} aria-label="Förstora vågsedeln"
              style={{ border: 'none', background: '#e9ebef', padding: 0, cursor: 'zoom-in', flex: 1, minHeight: 0, borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
              <AuthImage src={`/api/photos/${lass.photo_id}`} alt="Fotograferad vågsedel" style={{ width: '100%', height: '100%', minHeight: 320, objectFit: 'contain' }} />
            </button>
          ) : (
            <div className="empty">Inget foto. Föraren eller kontoret har skrivit in uppgifterna för hand.</div>
          )}
        </aside>

        <div style={{ display: 'grid', gap: 16 }}>
          {lass.review_status === 'behover_granskas' && lass.review_reasons.length > 0 && (
            <div className="notice notice-amber" role="status">
              <span><strong>Att kontrollera:</strong> {lass.review_reasons.join(' · ')}</span>
            </div>
          )}
          {ai?.warnings?.length > 0 && <div className="notice notice-blue"><span>AI:n noterade: {ai.warnings.join(' ')}</span></div>}
          {invoiced && <div className="notice notice-blue"><span>Lasset är fakturerat och kan inte ändras.</span></div>}

          {hazard && <HazardPanel lassId={lass.lass_id} hazard={hazard} onChanged={reload} />}

          <section className="panel">
            <div className="panel-head"><h2 className="t-heading">Uppgifter</h2></div>
            <div className="panel-body form-grid">
              {FIELDS.map(([k, label, type, wide]) => {
                const conf = lass.field_confidence?.[k];
                const badge = LASS_CONFIDENCE[conf];
                const aiField = ai?.fields?.[FROM_AI[k]];
                const aiDiffers = aiField?.value != null && !same(aiField.value, lass[k]);
                const isChanged = changed.includes(k);
                return (
                  <div key={k} className={`field ${wide ? 'span-2' : ''} ${conf === 'lag' && !isChanged && !reviewed ? 'conf-lag' : ''}`}>
                    <div className="field-top">
                      <label className="field-label" htmlFor={`l-${k}`}>{label}</label>
                      {isChanged ? <span className="badge badge-muted">Ändrat</span> : badge && <span className={`badge ${badge.badge}`} title={badge.hint}>{badge.label}</span>}
                    </div>
                    <input
                      id={`l-${k}`} className="input" disabled={readOnly}
                      type={type === 'ton' ? 'text' : type} inputMode={type === 'ton' ? 'decimal' : undefined}
                      value={form[k]} onChange={set(k)} aria-invalid={errors[k] ? true : undefined}
                    />
                    {errors[k] ? <span className="field-error" role="alert">{errors[k]}</span>
                      : aiDiffers ? <span className="ai-was">AI läste: {formatLassValue(k, aiField.value)}</span> : null}
                  </div>
                );
              })}
              <label className="checkbox span-2">
                <input type="checkbox" checked={form.farligt_avfall} onChange={set('farligt_avfall')} disabled={readOnly} />
                <span>Farligt avfall</span>
              </label>
              <div className="field span-2">
                <label className="field-label" htmlFor="l-note">Anteckning</label>
                <textarea id="l-note" className="input" rows={2} maxLength={500} value={form.note} onChange={set('note')} disabled={readOnly} />
              </div>
            </div>
          </section>

          <ContextPanel lass={lass} context={context} />
          <HistoryPanel versions={versions} />
        </div>
      </div>

      {!readOnly && (
        <div className="action-bar">
          {dirty && (
            <div className="field" style={{ flex: '1 1 320px' }}>
              <label className="field-label" htmlFor="l-reason">Varför ändras värdena? *</label>
              <input id="l-reason" className="input" value={reason} maxLength={200}
                placeholder="T.ex. Rättad mot vågsedeln"
                onChange={(e) => { setReason(e.target.value); setErrors((er) => ({ ...er, change_reason: undefined })); }}
                aria-invalid={errors.change_reason ? true : undefined} />
              {errors.change_reason && <span className="field-error" role="alert">{errors.change_reason}</span>}
            </div>
          )}
          {formError && <div className="notice notice-red" role="alert" style={{ width: '100%' }}>{formError}</div>}
          {!dirty && (
            <span className="t-muted" style={{ fontSize: 13 }}>
              {reviewed ? 'Lasset är granskat. Ändra ett värde för att rätta det.' : 'Jämför med fotot och godkänn, eller rätta värdena.'}
            </span>
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            {dirty && (
              <Button variant="secondary" size="lg" onClick={saveCorrection} loading={busy === 'save'} disabled={busy !== null}>
                Spara rättelse
              </Button>
            )}
            {!reviewed && (
              <Button size="lg" onClick={approve} loading={busy === 'approve'} disabled={busy !== null || (changed.length > 0 && !reason.trim())}
                title="Godkänn (⌘/Ctrl + Enter)">
                <Check size={16} /> {changed.length ? 'Rätta och godkänn' : 'Godkänn'}
                <kbd className="kbd">{navigator.platform?.startsWith('Mac') ? '⌘↵' : 'Ctrl ↵'}</kbd>
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={zoom} onClose={() => setZoom(false)} wide title={lass.vagsedel_nr ? `Vågsedel ${lass.vagsedel_nr}` : 'Vågsedel'}>
        {zoom && <AuthImage src={`/api/photos/${lass.photo_id}`} alt="Vågsedel" style={{ width: '100%', height: 'auto', objectFit: 'contain', borderRadius: 8 }} />}
      </Dialog>
    </>
  );
}

function ContextPanel({ lass, context }) {
  const otherTruck = context.assigned_regnr && lass.vehicle_regnr && context.assigned_regnr !== lass.vehicle_regnr;
  return (
    <section className="panel">
      <div className="panel-head"><h2 className="t-heading">Uppdrag</h2></div>
      <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, fontSize: 13 }}>
        <div>
          <div className="t-label" style={{ marginBottom: 4 }}>Uppdrag</div>
          <Link to={`/uppdrag/${context.job_id}`}>{UPPDRAGSTYPER[context.uppdragstyp]} · {context.project_name}</Link>
          {context.customer_ref && <div className="t-muted">Er ref {context.customer_ref}</div>}
        </div>
        <div>
          <div className="t-label" style={{ marginBottom: 4 }}>Fordon</div>
          <span className="num">{lass.vehicle_regnr ?? '–'}</span>
          {otherTruck && <div className="t-muted">Tilldelat: {context.assigned_regnr}</div>}
        </div>
        <div>
          <div className="t-label" style={{ marginBottom: 4 }}>Förare</div>
          {context.driver_name ?? '–'}
        </div>
        <div>
          <div className="t-label" style={{ marginBottom: 4 }}>Rapporterat</div>
          {formatDateTime(lass.reported_at)}
        </div>
      </div>
    </section>
  );
}

function HazardPanel({ lassId, hazard, onChanged }) {
  const toast = useToast();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(new Date());
  const [reportedOn, setReportedOn] = useState(today);
  const [reference, setReference] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const state = HAZARD_STATE[hazard.state];

  async function run(fn, message) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast(message);
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const report = () => run(() => api(`/api/lass/${lassId}/hazard-report`, {
    method: 'POST', body: { reported_on: reportedOn, reference: reference.trim() || null },
  }), 'Markerat som rapporterat');
  const undo = () => {
    if (!window.confirm('Ta bort markeringen att lasset är rapporterat?')) return;
    run(() => api(`/api/lass/${lassId}/hazard-report`, { method: 'DELETE' }), 'Markeringen är borttagen');
  };

  return (
    <section className="panel" style={{ borderColor: hazard.state === 'forsenad' ? 'rgba(239,68,68,0.45)' : undefined }}>
      <div className="panel-head">
        <h2 className="t-heading">Farligt avfall</h2>
        <span className={`badge ${state.badge}`}>{state.label}</span>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 12, fontSize: 13 }}>
        <p>
          Transporten ska rapporteras till Naturvårdsverkets avfallsregister senast <strong>{formatDate(hazard.deadline)}</strong> (två arbetsdagar efter transporten).
        </p>
        <ErrorNotice error={error} />
        {hazard.report ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>
              Rapporterad {formatDate(hazard.report.reported_on)}{hazard.report.reported_by_name ? ` av ${hazard.report.reported_by_name}` : ''}
              {hazard.report.reference && <> · ref <span className="num">{hazard.report.reference}</span></>}
            </span>
            <Button size="sm" variant="ghost" onClick={undo} loading={busy}><Undo2 size={13} /> Ångra</Button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', alignItems: 'end' }}>
            <div className="field">
              <label className="field-label" htmlFor="hz-date">Rapporterad datum</label>
              <input id="hz-date" type="date" className="input" value={reportedOn} max={today} onChange={(e) => setReportedOn(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="hz-ref">Referens (valfritt)</label>
              <input id="hz-ref" className="input" value={reference} maxLength={100} placeholder="Ärende-id" onChange={(e) => setReference(e.target.value)} />
            </div>
            <Button onClick={report} loading={busy} disabled={!reportedOn}>Markera som rapporterad</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function author(v) {
  if (v.created_by_kind === 'office') return v.user_name ?? 'Kontoret';
  if (v.created_by_kind === 'driver') return v.driver_name ?? 'Föraren';
  return 'Systemet';
}

function HistoryPanel({ versions }) {
  const rows = versions.map((v, i) => {
    const prev = versions[i - 1];
    const diffs = prev ? [...LASS_KEYS, 'note'].filter((k) => !same(v[k], prev[k])).map((k) => ({ k, from: prev[k], to: v[k] })) : [];
    return { v, diffs };
  }).reverse();

  return (
    <section className="panel">
      <div className="panel-head"><h2 className="t-heading">Historik</h2></div>
      <div className="panel-body" style={{ display: 'grid', gap: 0, paddingTop: 4 }}>
        {rows.map(({ v, diffs }, i) => (
          <div key={v.version} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>Version {v.version}</strong>
              <span className={`badge ${REVIEW_STATUS[v.review_status].badge}`}>{REVIEW_STATUS[v.review_status].label}</span>
              <span className="t-muted">{formatDateTime(v.created_at)} · {author(v)}</span>
            </div>
            {v.version === 1 && <div className="t-muted" style={{ marginTop: 2 }}>{v.created_by_kind === 'driver' ? 'Rapporterat av föraren' : 'Inskrivet av kontoret'}</div>}
            {v.change_reason && <div style={{ marginTop: 2 }}>”{v.change_reason}”</div>}
            {diffs.map(({ k, from, to }) => (
              <div key={k} className="t-muted">
                {LASS_FIELD_LABELS[k]}: {formatLassValue(k, from)} → <span style={{ color: 'var(--text-primary)' }}>{formatLassValue(k, to)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
