import { useRef, useState } from 'react';
import { ArrowLeft, FileUp, Scale, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { navigate } from '../lib/router.js';
import { useToast } from '../lib/toast.js';
import { formatDateTime, formatKr, formatPeriod, formatTon } from '../lib/labels.js';
import { readListFile } from '../lib/listFile.js';
import { MappingPicker, PreviewTable } from '../components/ListImport.jsx';

/** Two steps: where the list comes from (file or paste, and which facility), then check the columns and import. */
function ImportDialog({ open, onClose }) {
  const toast = useToast();
  const facilities = useApi(open ? '/api/avstamning/facilities' : null);
  const fileInput = useRef(null);
  const [facility, setFacility] = useState('');
  const [orgnr, setOrgnr] = useState('');
  const [text, setText] = useState('');
  const [sourceName, setSourceName] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function pickFacility(name) {
    setFacility(name);
    const known = facilities.data?.find((f) => f.name.toLowerCase() === name.trim().toLowerCase());
    if (known?.orgnr) setOrgnr(known.orgnr);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setText(await readListFile(file));
      setSourceName(file.name);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }

  async function runPreview(nextMapping) {
    setBusy('preview');
    setError(null);
    try {
      const p = await api('/api/avstamning/preview', { method: 'POST', body: { text, ...(nextMapping ? { mapping: nextMapping } : {}) } });
      setPreview(p);
      setMapping(p.mapping);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy('import');
    setError(null);
    setFieldErrors({});
    try {
      const r = await api('/api/avstamning', {
        method: 'POST',
        body: { text, mapping, facility_name: facility, facility_orgnr: orgnr || null, source_name: sourceName },
      });
      const t = r.totals;
      toast(t.saknas
        ? `Våglistan är importerad. ${t.saknas} ${t.saknas === 1 ? 'vägning saknas' : 'vägningar saknas'} i Lasskoll.`
        : 'Våglistan är importerad.');
      onClose();
      navigate(`/avstamning/${r.list.id}`);
    } catch (err) {
      setFieldErrors(err.fields ?? {});
      if (err.fields?.facility_name || err.fields?.facility_orgnr) setPreview(null);
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const step = preview ? 'map' : 'source';
  const canImport = preview && !preview.error && preview.row_count > 0 && facility.trim();

  return (
    <Dialog
      open={open} onClose={onClose} wide
      title="Importera våglista"
      description={step === 'source'
        ? 'Vägningsrapporten från mottagningsanläggningen eller täkten, som CSV eller rader kopierade från Excel.'
        : 'Kontrollera att kolumnerna stämmer. Inget sparas förrän du importerar.'}
      footer={step === 'source' ? (
        <>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={() => runPreview(null)} loading={busy === 'preview'} disabled={!text.trim() || !facility.trim()}>Läs in</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={() => { setPreview(null); setError(null); }}><ArrowLeft size={14} /> Tillbaka</Button>
          <Button onClick={submit} loading={busy === 'import'} disabled={!canImport || busy !== null}>
            Importera {preview.row_count} {preview.row_count === 1 ? 'vägning' : 'vägningar'}
          </Button>
        </>
      )}
    >
      {error && (
        <div className="notice notice-red" role="alert" style={{ marginBottom: 14 }}>
          {error.fields?.text ?? error.message}
        </div>
      )}

      {step === 'source' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '2fr 1fr' }} className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="imp-facility">Mottagningsanläggning *</label>
              <input id="imp-facility" className="input" list="imp-facilities" value={facility} placeholder="t.ex. Ekbacka massmottagning"
                aria-invalid={Boolean(fieldErrors.facility_name) || undefined} onChange={(e) => pickFacility(e.target.value)} autoComplete="off" />
              <datalist id="imp-facilities">
                {(facilities.data ?? []).map((f) => <option key={f.name} value={f.name}>{`${f.lass_count} lass`}</option>)}
              </datalist>
              {fieldErrors.facility_name
                ? <span className="field-error">{fieldErrors.facility_name}</span>
                : <span className="field-hint">Samma namn som på vågsedlarna, så att lassen hittas.</span>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="imp-orgnr">Org.nr</label>
              <input id="imp-orgnr" className="input num" value={orgnr} placeholder="Valfritt" onChange={(e) => setOrgnr(e.target.value)}
                aria-invalid={Boolean(fieldErrors.facility_orgnr) || undefined} />
              {fieldErrors.facility_orgnr && <span className="field-error">{fieldErrors.facility_orgnr}</span>}
            </div>
          </div>

          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label className="field-label" htmlFor="imp-text">Vägningar</label>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {sourceName && <span className="badge badge-blue">{sourceName}</span>}
                <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}><FileUp size={13} /> Välj fil</Button>
                <input ref={fileInput} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden onChange={onFile} />
              </span>
            </div>
            <textarea
              id="imp-text" className="input num" rows={9} value={text} spellCheck={false}
              placeholder={'Klistra in raderna här, med rubrikraden överst.\n\nDatum\tTid\tVågsedelnr\tRegnr\tArtikel\tNetto (kg)\n2026-09-28\t07:12\tEKB418233\tTKA412\tSchaktmassor\t18 420'}
              onChange={(e) => { setText(e.target.value); setSourceName(null); }}
              style={{ fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
            <span className="field-hint">Datum och nettovikt (eller brutto och tara) behövs. Vågsedelnummer och regnr gör matchningen säkrare.</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {preview.error && (
            <div className="notice notice-amber" role="status"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {preview.error}</div>
          )}
          <MappingPicker headers={preview.headers} mapping={mapping} labels={preview.labels}
            onChange={(m) => { setMapping(m); runPreview(m); }} />

          {preview.row_count > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
                <strong>{preview.row_count} vägningar</strong>
                {preview.period && <span className="t-muted">{formatPeriod(preview.period.from, preview.period.to)}</span>}
                {busy === 'preview' && <span className="t-muted">Läser om…</span>}
              </div>
              <PreviewTable rows={preview.rows} />
              {preview.row_count > preview.rows.length && (
                <p className="t-muted" style={{ fontSize: 12, marginTop: -8 }}>Visar de första {preview.rows.length}.</p>
              )}
            </>
          )}

          {preview.duplicates.length > 0 && (
            <div className="notice notice-amber">
              Samma vågsedelnummer finns flera gånger på listan: {preview.duplicates.slice(0, 5).join(', ')}{preview.duplicates.length > 5 ? ' …' : ''}.
            </div>
          )}
          {preview.skipped_count > 0 && (
            <details className="notice notice-amber" style={{ display: 'block' }}>
              <summary style={{ cursor: 'pointer' }}>{preview.skipped_count} rader kunde inte läsas och hoppas över</summary>
              <ul style={{ margin: '8px 0 0 18px', fontSize: 12.5 }}>
                {preview.skipped.map((s) => <li key={s.line}>Rad {s.line}: {s.reason}</li>)}
              </ul>
            </details>
          )}
          {preview.sample?.length > 0 && (
            <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
              <table className="table">
                <thead><tr>{preview.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>{preview.sample.map((cells, i) => <tr key={i}>{cells.map((c, j) => <td key={j} className="num">{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Totals({ t }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {t.saknas > 0 && <span className="badge badge-red">{t.saknas} saknas</span>}
      {t.avvikelse > 0 && <span className="badge badge-amber">{t.avvikelse} avvikelser</span>}
      {t.unlisted > 0 && <span className="badge badge-amber">{t.unlisted} inte på listan</span>}
      {!t.saknas && !t.avvikelse && !t.unlisted && <span className="badge badge-green">Stämmer</span>}
    </div>
  );
}

export function Avstamning() {
  const lists = useApi('/api/avstamning');
  const found = useApi('/api/avstamning/found').data?.totals;
  // Each opening is a fresh dialog (keyed), so a cancelled import doesn't linger.
  const [importing, setImporting] = useState({ open: false, n: 0 });
  const startImport = () => setImporting((s) => ({ open: true, n: s.n + 1 }));
  const rows = lists.data ?? [];
  const missing = rows.reduce((s, l) => s + l.totals.saknas, 0);
  const missingValue = rows.reduce((s, l) => s + l.totals.saknas_value_ore, 0);

  return (
    <>
      <PageHeader
        title="Avstämning"
        description="Jämför mottagarnas våglistor med loggade lass. En vägning utan lass blir aldrig fakturerad."
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate('/forlustkontroll')}>Jämför mot fakturor</Button>
            <Button onClick={startImport}><FileUp size={15} /> Importera våglista</Button>
          </>
        )}
      />
      <ErrorNotice error={lists.error} onRetry={lists.reload} />

      {missing > 0 && (
        <div className="notice notice-red" role="status" style={{ marginBottom: 16, alignItems: 'center' }}>
          <TriangleAlert size={16} style={{ flexShrink: 0 }} />
          <span>
            <strong>{missing} {missing === 1 ? 'vägning' : 'vägningar'}</strong> på våglistorna saknas i Lasskoll
            {missingValue > 0 && <> och är värda ungefär <strong className="num">{formatKr(missingValue, { round: true })}</strong> exkl. moms</>}.
            Skapa lassen så kommer de med på fakturaunderlaget.
          </span>
        </div>
      )}

      {found?.value_ore > 0 && (
        <div className="notice notice-green" role="status" style={{ marginBottom: 16, alignItems: 'center' }}>
          <Sparkles size={16} style={{ flexShrink: 0 }} />
          <span>
            Hittat hittills: <strong className="num">{formatKr(found.value_ore, { round: true })}</strong> som annars inte hade fakturerats.{' '}
            <a href="/hittat" onClick={(e) => { e.preventDefault(); navigate('/hittat'); }}>Visa vad</a>
          </span>
        </div>
      )}

      <section className="panel">
        {lists.loading && !lists.data ? <TableSkeleton /> : rows.length === 0 ? (
          <div className="empty" style={{ display: 'grid', justifyItems: 'center', gap: 10, maxWidth: 520, margin: '0 auto' }}>
            <Scale size={28} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Inga våglistor än</div>
            <p style={{ fontSize: 13 }}>
              Be tippen eller täkten om en vägningsrapport för ert kundnummer, per vecka eller månad, som CSV eller Excel.
              Importera den här så ser du direkt vilka lass som aldrig loggades och var vikterna skiljer sig.
            </p>
            <Button onClick={startImport}><FileUp size={15} /> Importera våglista</Button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Mottagare</th><th>Period</th><th style={{ textAlign: 'right' }}>Vägningar</th><th>Resultat</th><th style={{ textAlign: 'right' }}>Saknas, värde</th><th>Importerad</th></tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="clickable" tabIndex={0}
                    onClick={() => navigate(`/avstamning/${l.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/avstamning/${l.id}`); }}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{l.facility_name}</div>
                      {l.source_name && <div className="t-muted" style={{ fontSize: 12 }}>{l.source_name}</div>}
                    </td>
                    <td className="num">{formatPeriod(l.period_from, l.period_to)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {l.totals.rows}
                      <div className="t-muted" style={{ fontSize: 12 }}>{formatTon(l.totals.list_kg)}</div>
                    </td>
                    <td><Totals t={l.totals} /></td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: l.totals.saknas_value_ore ? 'var(--danger)' : undefined }}>
                      {l.totals.saknas_value_ore ? formatKr(l.totals.saknas_value_ore, { round: true }) : '–'}
                    </td>
                    <td className="t-muted" style={{ fontSize: 12.5 }}>{formatDateTime(l.created_at)}<div>{l.created_by_name}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ImportDialog key={importing.n} open={importing.open} onClose={() => setImporting((s) => ({ ...s, open: false }))} />
    </>
  );
}
