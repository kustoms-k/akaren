import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, CloudOff } from 'lucide-react';
import { cachedGet, driverApi, uploadPhoto, uuid } from './driverApi.js';
import { downscaleImage } from './image.js';
import { queueLass } from './outbox.js';
import { go } from './nav.js';

const nowLocal = () => {
  const d = new Date();
  return {
    datum: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(d),
    tid: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d),
  };
};
const toTon = (kg) => (kg == null ? '' : String(Math.round(kg) / 1000).replace('.', ','));
const toKg = (ton) => {
  const s = String(ton ?? '').replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : NaN;
};

// Form field <- AI vågsedel field
const FROM_AI = {
  vagsedel_nr: 'vagsedel_nr', netto: 'netto_kg', material: 'material', till_namn: 'mottagare', datum: 'datum',
  tid: 'tid', fran_text: 'lastplats', avfallskod: 'avfallskod', farligt_avfall: 'farligt_avfall',
};
const MATERIALS = ['Schaktmassor', 'Förorenade massor', 'Bergkross 0–32', 'Bergkross 0–90', 'Makadam 16–32', 'Grus 0–8', 'Sand 0–4', 'Matjord', 'Asfalt', 'Betong', 'Blandat byggavfall'];

export function ReportLass({ assignmentId, photo, onDone }) {
  const [assignment, setAssignment] = useState(null);
  const [file, setFile] = useState(photo);
  const [attempt, setAttempt] = useState(0); // bumps for "next lass"

  useEffect(() => {
    cachedGet(`/api/driver/assignments/${assignmentId}`).then(({ data }) => setAssignment(data)).catch(() => setAssignment(false));
  }, [assignmentId]);

  if (assignment === null) return <div className="skeleton" style={{ height: 240, borderRadius: 14 }} />;
  if (assignment === false) return <div className="drv-banner err">Uppdraget kunde inte hämtas. Kontrollera täckningen och försök igen.</div>;

  return (
    <ReportForm
      key={attempt}
      assignment={assignment}
      file={file}
      onNext={(next) => { setFile(next); setAttempt((n) => n + 1); }}
      onDone={onDone}
    />
  );
}

function ReportForm({ assignment, file, onNext, onDone }) {
  const [clientUuid] = useState(uuid);
  const [phase, setPhase] = useState(file ? 'reading' : 'form'); // reading | form | sending | done
  const [upload, setUpload] = useState({ photoId: null, extractionId: null, blob: null, offline: false, aiError: null, warnings: [], demoReading: false, simulated: false });
  const [conf, setConf] = useState({});
  const [values, setValues] = useState(() => ({
    vagsedel_nr: '', netto: '', material: assignment.material ?? '', till_namn: assignment.till_text ?? '',
    fran_text: assignment.fran_text ?? '', avfallskod: '', farligt_avfall: false, note: '', ...nowLocal(),
  }));
  const [showMore, setShowMore] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [result, setResult] = useState(null); // { queued, review_status }
  const nextInput = useRef(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  /** Fill the form from an AI reading and remember how sure it was of each field. */
  function applyExtraction(extraction) {
    const patch = {};
    const c = {};
    for (const [formKey, aiKey] of Object.entries(FROM_AI)) {
      const field = extraction.fields[aiKey];
      if (!field) continue;
      c[formKey] = field.confidence;
      if (field.value != null) patch[formKey] = formKey === 'netto' ? toTon(field.value) : field.value;
    }
    setValues((v) => ({ ...v, ...patch }));
    setConf(c);
  }

  // Demo mode without a key: the simulated reading of the demo slip, labelled as such.
  async function demoReading() {
    setPhase('reading');
    try {
      const { extraction } = await driverApi(`/api/driver/photos/${upload.photoId}/demo-reading`, { method: 'POST', body: { assignment_id: assignment.id } });
      applyExtraction(extraction);
      setUpload((u) => ({ ...u, extractionId: extraction.id, aiError: null, warnings: extraction.warnings ?? [], demoReading: false, simulated: true }));
    } catch (err) {
      setFormError(err.message);
    }
    setPhase('form');
  }

  // Shrink, upload and let the AI read the ticket.
  useEffect(() => {
    if (!file) return undefined;
    let alive = true;
    (async () => {
      const blob = await downscaleImage(file);
      try {
        const res = await uploadPhoto(assignment.id, blob);
        if (!alive) return;
        const next = {
          photoId: res.photo_id, extractionId: res.extraction?.id ?? null, blob: null, offline: false, aiError: res.ai_error,
          warnings: res.extraction?.warnings ?? [], demoReading: Boolean(res.demo_reading), simulated: false,
        };
        if (res.extraction) applyExtraction(res.extraction);
        setUpload(next);
      } catch (err) {
        if (!alive) return;
        if (err.code === 'network') setUpload({ photoId: null, extractionId: null, blob, offline: true, aiError: null, warnings: [], demoReading: false, simulated: false });
        else setFormError(err.message);
      }
      if (alive) setPhase('form');
    })();
    return () => { alive = false; };
  }, [file, assignment.id]);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((s) => ({ ...s, [k]: v }));
    setConf((c) => (c[k] ? { ...c, [k]: 'forare' } : c));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };
  const needsCheck = (k) => conf[k] === 'lag' || ((k === 'vagsedel_nr' || k === 'netto') && file && !values[k]);

  async function submit() {
    const nettoKg = toKg(values.netto);
    if (Number.isNaN(nettoKg)) { setErrors({ netto: 'Skriv vikten i ton, t.ex. 18,42' }); return; }
    setPhase('sending');
    setFormError(null);
    const fields = {
      vagsedel_nr: values.vagsedel_nr || null, datum: values.datum, tid: values.tid || null, material: values.material || null,
      netto_kg: nettoKg, avfallskod: values.avfallskod || null, farligt_avfall: Boolean(values.farligt_avfall),
      fran_text: values.fran_text || null, till_namn: values.till_namn || null,
    };
    let photoId = upload.photoId;
    const queue = async () => {
      await queueLass({
        client_uuid: clientUuid, assignment_id: assignment.id, photo_id: photoId, photo: photoId ? null : upload.blob,
        ai_extraction_id: upload.extractionId, fields, note: values.note || null,
      });
      setResult({ queued: true });
      setPhase('done');
    };
    try {
      if (!photoId && upload.blob) photoId = (await uploadPhoto(assignment.id, upload.blob, { extract: false })).photo_id;
      const lass = await driverApi('/api/driver/lass', {
        method: 'POST',
        body: { assignment_id: assignment.id, client_uuid: clientUuid, photo_id: photoId, ai_extraction_id: upload.extractionId, fields, note: values.note || null },
      });
      setResult({ queued: false, review_status: lass.review_status });
      setPhase('done');
    } catch (err) {
      if (err.code === 'network' || err.status >= 500) { await queue(); return; }
      const mapped = {};
      for (const [k, v] of Object.entries(err.fields ?? {})) mapped[k.replace(/^fields\./, '').replace('netto_kg', 'netto')] = v;
      setErrors(mapped);
      setFormError(Object.keys(mapped).length ? 'Kontrollera de markerade fälten.' : err.message);
      setPhase('form');
    }
  }

  if (phase === 'done') {
    return (
      <div style={{ textAlign: 'center', paddingTop: 32 }}>
        {result.queued ? <CloudOff size={56} color="#b45309" /> : <CheckCircle2 size={56} color="#16a34a" />}
        <h1 style={{ marginTop: 12 }}>{result.queued ? 'Sparat på telefonen' : 'Lasset är skickat'}</h1>
        <p className="drv-meta" style={{ margin: '8px 0 24px' }}>
          {result.queued ? 'Det skickas automatiskt när du har täckning. Låt sidan vara öppen.'
            : result.review_status === 'behover_granskas' ? 'Kontoret dubbelkollar några uppgifter.' : 'Tack!'}
        </p>
        <input ref={nextInput} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onNext(f); }} />
        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" className="drv-btn" onClick={() => nextInput.current?.click()}><Camera size={22} /> Nästa lass</button>
          <button type="button" className="drv-btn secondary" onClick={onDone}>Klar</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => go(`/uppdrag/${assignment.id}`)} className="drv-meta" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: 'none', border: 'none', padding: '4px 0 10px', font: 'inherit' }}>
        <ArrowLeft size={18} /> {assignment.project_name}
      </button>
      <h1>{file ? 'Kontrollera vågsedeln' : 'Rapportera lass'}</h1>

      {preview && <img src={preview} alt="Vågsedeln" className="drv-photo" style={{ margin: '12px 0' }} />}

      {phase === 'reading' && (
        <div className="drv-banner info" role="status">Läser vågsedeln… Det tar några sekunder.</div>
      )}
      {upload.offline && <div className="drv-banner warn">Ingen täckning. Skriv av vågsedeln så skickas lasset med bilden när du har täckning.</div>}
      {upload.demoReading && phase !== 'reading' ? (
        <div className="drv-banner info">
          <div style={{ marginBottom: 10 }}>Demoläge: automatisk avläsning är inte påslagen i demon.</div>
          <button type="button" className="drv-btn secondary small" onClick={demoReading}>Demo: läs av demovågsedeln</button>
        </div>
      ) : upload.aiError && <div className="drv-banner warn">{upload.aiError}</div>}
      {upload.simulated && (
        <div className="drv-banner info" role="status">
          Simulerad avläsning (demoläge): uppgifterna kommer från demovågsedeln, inte från fotot. Kontrollera de markerade fälten.
        </div>
      )}
      {!file && <div className="drv-banner warn">Utan foto kontrollerar kontoret lasset innan det faktureras.</div>}
      {upload.warnings.length > 0 && <div className="drv-banner warn">{upload.warnings.join(' ')}</div>}

      {phase !== 'reading' && (
        <>
          <Field id="f-vagsedel_nr" label="Vågsedelnummer" check={needsCheck('vagsedel_nr')} error={errors.vagsedel_nr}>
            <input id="f-vagsedel_nr" className="drv-input" value={values.vagsedel_nr} onChange={set('vagsedel_nr')} autoCapitalize="characters" />
          </Field>
          <Field id="f-netto" label="Nettovikt (ton)" check={needsCheck('netto')} error={errors.netto}>
            <input id="f-netto" className="drv-input num" inputMode="decimal" placeholder="18,42" value={values.netto} onChange={set('netto')} />
          </Field>
          <Field id="f-material" label="Material" check={needsCheck('material')} error={errors.material}>
            <input id="f-material" className="drv-input" list="drv-materials" value={values.material} onChange={set('material')} />
            <datalist id="drv-materials">{MATERIALS.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field id="f-till_namn" label="Till (mottagare)" check={needsCheck('till_namn')} error={errors.till_namn}>
            <input id="f-till_namn" className="drv-input" value={values.till_namn} onChange={set('till_namn')} />
          </Field>
          <div className="drv-row" style={{ alignItems: 'flex-start' }}>
            <Field id="f-datum" label="Datum" check={needsCheck('datum')} error={errors.datum} style={{ flex: 1.3 }}>
              <input id="f-datum" type="date" className="drv-input" value={values.datum} onChange={set('datum')} />
            </Field>
            <Field id="f-tid" label="Tid" check={needsCheck('tid')} error={errors.tid} style={{ flex: 1 }}>
              <input id="f-tid" type="time" className="drv-input" value={values.tid} onChange={set('tid')} />
            </Field>
          </div>

          {!showMore ? (
            <button type="button" className="drv-btn secondary small" style={{ marginBottom: 14 }} onClick={() => setShowMore(true)}>Fler uppgifter (avfallskod, anteckning…)</button>
          ) : (
            <>
              <Field id="f-fran_text" label="Från" error={errors.fran_text}>
                <input id="f-fran_text" className="drv-input" value={values.fran_text} onChange={set('fran_text')} />
              </Field>
              <Field id="f-avfallskod" label="Avfallskod (6 siffror)" check={needsCheck('avfallskod')} error={errors.avfallskod}>
                <input id="f-avfallskod" className="drv-input num" inputMode="numeric" value={values.avfallskod} onChange={set('avfallskod')} />
              </Field>
              <label className="drv-card drv-row" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={values.farligt_avfall} onChange={set('farligt_avfall')} style={{ width: 26, height: 26, accentColor: '#dc2626' }} />
                <span style={{ fontWeight: 700 }}>Farligt avfall</span>
              </label>
              <Field id="f-note" label="Anteckning till kontoret">
                <textarea id="f-note" className="drv-input" rows={2} value={values.note} onChange={set('note')} />
              </Field>
            </>
          )}

          {formError && <div className="drv-banner err" role="alert">{formError}</div>}
          <div className="drv-sheet-actions">
            <button type="button" className="drv-btn" onClick={submit} disabled={phase === 'sending'}>
              {phase === 'sending' ? 'Skickar…' : 'Skicka lass'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Field({ id, label, check, error, style, children }) {
  return (
    <div className={`drv-field${check ? ' check' : ''}`} style={style}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="drv-hint" style={{ color: 'var(--danger)' }}>{error}</span>
        : check ? <span className="drv-hint">Kontrollera mot vågsedeln</span> : null}
    </div>
  );
}
