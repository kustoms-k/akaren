import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CircleCheck, EyeOff, FileSpreadsheet, Plus, Trash2, TriangleAlert, Undo2, Wand2 } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { Link } from '../components/Link.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api, downloadFile } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { navigate } from '../lib/router.js';
import { useToast } from '../lib/toast.js';
import { workChanged } from '../lib/workCounts.js';
import {
  MATCH_KIND, PRICE_UNITS, REVIEW_STATUS, UPPDRAGSTYPER, WEIGH_DIFF_LABELS, formatDate, formatDateTime, formatDiffValue,
  formatKgDiff, formatKr, formatPeriod, formatTon,
} from '../lib/labels.js';

const IGNORE_REASONS = ['Inte vår bil', 'Underåkaren fakturerar själv', 'Redan fakturerat på annat sätt', 'Dubbel rad på listan'];

function StatTile({ label, value, sub, tone }) {
  return (
    <div className="panel stat">
      <div className="t-label">{label}</div>
      <div className="stat-value num" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="t-muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const When = ({ datum, tid }) => (
  <span className="num" style={{ whiteSpace: 'nowrap' }}>{formatDate(datum)}{tid && <span className="t-muted"> {tid}</span>}</span>
);

/** What the weighing would add to the fakturaunderlag, or why it adds nothing. */
function EstimateText({ estimate }) {
  if (!estimate) return <span className="t-muted">Välj uppdrag</span>;
  if (estimate.amount_ore == null) return <span className="t-muted">{estimate.note}</span>;
  return (
    <span>
      <strong className="num">{formatKr(estimate.amount_ore)}</strong>
      <div className="t-muted" style={{ fontSize: 11.5 }}>{formatKr(estimate.price_ore)} {PRICE_UNITS[estimate.unit]}</div>
    </span>
  );
}

// ── Dialogs ──

/** Log a weighing as a lass: pick the job (the truck's assignment that day is suggested), confirm material and waste code. */
function CreateLassDialog({ listId, row, open, onClose, onDone }) {
  const toast = useToast();
  const jobs = useApi(open ? '/api/jobs' : null);
  // 'a:<assignment id>' (the truck's assignment that day) or 'j:<job id>' (any other job).
  const [choice, setChoice] = useState(() => (row?.suggestion ? `a:${row.suggestion.assignment_id}` : ''));
  const [material, setMaterial] = useState('');
  const [avfallskod, setAvfallskod] = useState('');
  const [farligt, setFarligt] = useState(false);
  const [suggest, setSuggest] = useState(null);       // { jobId, ...suggestion } for the job it was loaded for
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const option = row?.options.find((o) => `a:${o.assignment_id}` === choice);
  const jobId = option ? option.job_id : choice.startsWith('j:') ? Number(choice.slice(2)) || null : null;
  const current = suggest?.jobId === jobId ? suggest : null;

  // The job decides the price and the suggested material and waste code.
  useEffect(() => {
    if (!row || !jobId) return undefined;
    const ctrl = new AbortController();
    api(`/api/avstamning/${listId}/rows/${row.id}/suggest?job_id=${jobId}`, { signal: ctrl.signal })
      .then((s) => {
        setSuggest({ ...s, jobId });
        setMaterial(s.material ?? '');
        setAvfallskod(s.avfallskod ?? '');
        setFarligt(s.farligt_avfall);
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err); });
    return () => ctrl.abort();
  }, [row, jobId, listId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/api/avstamning/${listId}/rows/${row.id}/lass`, {
        method: 'POST',
        body: {
          job_id: jobId, assignment_id: option?.assignment_id ?? null,
          material: material || null, avfallskod: avfallskod || null, farligt_avfall: farligt,
        },
      });
      toast(r.lass.review_status === 'behover_granskas'
        ? 'Lasset är skapat och ligger i Granska lass.'
        : 'Lasset är skapat och kommer med på fakturaunderlaget.');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const activeJobs = (jobs.data ?? []).filter((j) => j.status === 'bekraftad' || j.status === 'pagar' || j.status === 'klar');
  const otherJobs = activeJobs.filter((j) => !row?.options.some((o) => o.job_id === j.id));

  return (
    <Dialog
      open={open} onClose={onClose} wide
      title="Skapa lass från vägningen"
      description="Lasset loggas med anläggningens uppgifter. Raden på våglistan är underlaget i stället för ett foto."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={submit} loading={busy} disabled={!jobId || !current}>
            <Plus size={14} /> Skapa lass{current?.estimate?.amount_ore != null ? ` · ${formatKr(current.estimate.amount_ore, { round: true })}` : ''}
          </Button>
        </>
      )}
    >
      {row && (
        <div style={{ display: 'grid', gap: 16 }}>
          <ErrorNotice error={error} />
          <div className="facts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
            <div><div className="fact-label">Datum</div><div className="fact-value"><When datum={row.datum} tid={row.tid} /></div></div>
            <div><div className="fact-label">Vågsedel</div><div className="fact-value num">{row.vagsedel_nr ?? '–'}</div></div>
            <div><div className="fact-label">Regnr</div><div className="fact-value num">{row.regnr ?? '–'}</div></div>
            <div><div className="fact-label">Netto</div><div className="fact-value num">{formatTon(row.netto_kg) || '–'}</div></div>
            {row.referens && <div><div className="fact-label">Märkning</div><div className="fact-value">{row.referens}</div></div>}
          </div>

          <div>
            <div className="field-label" style={{ marginBottom: 8 }}>Uppdrag</div>
            <div className="choice-list" role="radiogroup" aria-label="Uppdrag">
              {row.options.map((o) => (
                <label key={o.assignment_id} className="choice" data-checked={choice === `a:${o.assignment_id}`}>
                  <input type="radio" name="job" checked={choice === `a:${o.assignment_id}`} onChange={() => setChoice(`a:${o.assignment_id}`)} />
                  <span>
                    <span className="choice-title">{o.customer_name} · {o.project_name}</span>
                    <span className="choice-meta" style={{ display: 'block' }}>
                      {o.regnr} med {o.driver_name} den här dagen · {UPPDRAGSTYPER[o.uppdragstyp]}
                      {o.lass_to_facility > 0 && ` · ${o.lass_to_facility} lass hit samma dag`}
                    </span>
                  </span>
                </label>
              ))}
              <label className="choice" data-checked={choice.startsWith('j:')}>
                <input type="radio" name="job" checked={choice.startsWith('j:')} onChange={() => setChoice('j:')} />
                <span>
                  <span className="choice-title">{row.options.length ? 'Ett annat uppdrag' : 'Välj uppdrag'}</span>
                  <span className="choice-meta" style={{ display: 'block' }}>
                    {row.options.length ? 'T.ex. en inhyrd bil eller en annan kund.' : `${row.regnr ?? 'Bilen'} hade ingen tilldelning den dagen, t.ex. en inhyrd bil.`}
                  </span>
                  {choice.startsWith('j:') && (
                    <select className="input" style={{ marginTop: 8 }} value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Uppdrag">
                      <option value="j:">{jobs.loading ? 'Laddar uppdrag…' : 'Välj uppdrag…'}</option>
                      {otherJobs.map((j) => (
                        <option key={j.id} value={`j:${j.id}`}>
                          {j.customer_name} · {j.project_name} · {UPPDRAGSTYPER[j.uppdragstyp]} (#{j.id})
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </label>
            </div>
          </div>

          {current && (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', alignItems: 'start' }}>
              <div className="field">
                <label className="field-label" htmlFor="cl-material">Material</label>
                <input id="cl-material" className="input" value={material} onChange={(e) => setMaterial(e.target.value)} />
                {row.material && row.material !== material && <span className="field-hint">På listan: {row.material}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="cl-avfallskod">Avfallskod</label>
                <input id="cl-avfallskod" className="input num" value={avfallskod} placeholder="t.ex. 170504" inputMode="numeric"
                  onChange={(e) => setAvfallskod(e.target.value)} />
                {current?.avfallskod && <span className="field-hint">Från uppdragets senaste lass</span>}
              </div>
              <label className="checkbox" style={{ marginTop: 30 }}>
                <input type="checkbox" checked={farligt} onChange={(e) => setFarligt(e.target.checked)} />
                <span>Farligt avfall</span>
              </label>
            </div>
          )}

          {current && (
            <div className="notice notice-blue" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1 }}>På fakturaunderlaget: <EstimateText estimate={current.estimate} /></span>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Correct the matched lass with the scale's values. */
function FixDialog({ listId, row, open, facility, onClose, onDone }) {
  const toast = useToast();
  const [fields, setFields] = useState(() => row?.fixable ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/avstamning/${listId}/rows/${row.id}/fix`, { method: 'POST', body: { fields } });
      toast('Lasset är rättat enligt våglistan.');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open} onClose={onClose}
      title="Rätta lasset enligt våglistan"
      description={`En ny version av lasset sparas med orsaken "Rättad enligt våglista från ${facility}". Det gamla värdet finns kvar i historiken.`}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={submit} loading={busy} disabled={!fields.length}><Wand2 size={14} /> Rätta lasset</Button>
        </>
      )}
    >
      {row && (
        <div style={{ display: 'grid', gap: 10 }}>
          <ErrorNotice error={error} />
          {row.differences.filter((d) => row.fixable.includes(d.field)).map((d) => (
            <label key={d.field} className="choice" data-checked={fields.includes(d.field)}>
              <input type="checkbox" checked={fields.includes(d.field)}
                onChange={(e) => setFields((f) => (e.target.checked ? [...f, d.field] : f.filter((x) => x !== d.field)))} />
              <span>
                <span className="choice-title">{WEIGH_DIFF_LABELS[d.field]}</span>
                <span className="choice-meta num" style={{ display: 'block' }}>
                  {formatDiffValue(d.field, d.lass)} → <strong style={{ color: 'var(--text-primary)' }}>{formatDiffValue(d.field, d.list)}</strong>
                  {d.field === 'netto_kg' && d.lass != null && ` (${formatKgDiff(d.list - d.lass)})`}
                </span>
              </span>
            </label>
          ))}
          {row.differences.some((d) => d.field === 'regnr') && (
            <p className="t-muted" style={{ fontSize: 12.5 }}>Regnr rättas inte härifrån. Kontrollera tilldelningen på uppdraget om bilen var fel.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}

function IgnoreDialog({ listId, row, open, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/avstamning/${listId}/rows/${row.id}/ignore`, { method: 'POST', body: { reason } });
      toast('Vägningen är ignorerad.');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open} onClose={onClose}
      title="Ignorera vägningen"
      description="Vägningen räknas inte som saknad längre. Orsaken sparas och kan ses i efterhand."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={submit} loading={busy} disabled={!reason.trim()}><EyeOff size={14} /> Ignorera</Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <ErrorNotice error={error} />
        <div className="template-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {IGNORE_REASONS.map((r) => (
            <Button key={r} size="sm" variant={reason === r ? 'primary' : 'ghost'} onClick={() => setReason(r)}>{r}</Button>
          ))}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ign-reason">Orsak *</label>
          <input id="ign-reason" className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          {error?.fields?.reason && <span className="field-error">{error.fields.reason}</span>}
        </div>
      </div>
    </Dialog>
  );
}

// ── Sections ──

function MissingTable({ rows, onCreate, onIgnore }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Vägning</th><th>Vågsedel</th><th>Regnr</th><th>Material</th><th style={{ textAlign: 'right' }}>Netto</th><th>Troligt uppdrag</th><th>Värde</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = r.options.find((o) => o.assignment_id === r.suggestion?.assignment_id);
            return (
              <tr key={r.id}>
                <td><When datum={r.datum} tid={r.tid} /><div className="t-muted" style={{ fontSize: 11.5 }}>Rad {r.line_no}</div></td>
                <td className="num">{r.vagsedel_nr ?? '–'}</td>
                <td className="num">{r.regnr ?? '–'}</td>
                <td>{r.material ?? '–'}{r.referens && <div className="t-muted" style={{ fontSize: 12 }}>{r.referens}</div>}</td>
                <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{formatTon(r.netto_kg) || '–'}</td>
                <td>
                  {s ? (
                    <>
                      <div style={{ fontWeight: 550 }}>{s.project_name}</div>
                      <div className="t-muted" style={{ fontSize: 12 }}>{s.customer_name} · {s.driver_name}</div>
                    </>
                  ) : <span className="badge badge-muted">Ingen tilldelning</span>}
                </td>
                <td><EstimateText estimate={r.estimate} /></td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <Button size="sm" onClick={() => onCreate(r)}><Plus size={13} /> Skapa lass</Button>
                    <Button size="sm" variant="ghost" onClick={() => onIgnore(r)} title="Ignorera" aria-label={`Ignorera rad ${r.line_no}`}><EyeOff size={13} /></Button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DifferenceTable({ rows, onFix }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Vägning</th><th>Lass</th><th>Skillnad</th><th>Värde</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <When datum={r.datum} tid={r.tid} />
                <div className="t-muted num" style={{ fontSize: 12 }}>{r.vagsedel_nr ?? '–'} · {r.regnr ?? '–'}</div>
              </td>
              <td>
                <Link to={`/lass/${r.lass.lass_id}`} style={{ fontWeight: 550 }}>{r.lass.vagsedel_nr ?? `Lass ${r.lass.lass_id}`}</Link>
                <div className="t-muted" style={{ fontSize: 12 }}>{r.lass.customer_name} · {r.lass.project_name}</div>
              </td>
              <td>
                {r.differences.map((d) => (
                  <div key={d.field} className="num" style={{ fontSize: 13 }}>
                    <span className="t-muted">{WEIGH_DIFF_LABELS[d.field]}:</span> {formatDiffValue(d.field, d.lass)} i Åkaren,{' '}
                    <strong>{formatDiffValue(d.field, d.list)}</strong> på listan
                    {d.field === 'netto_kg' && d.lass != null && <span className="t-muted"> ({formatKgDiff(d.list - d.lass)})</span>}
                  </div>
                ))}
              </td>
              <td className="num" style={{ whiteSpace: 'nowrap', fontWeight: 600, color: r.diff_value_ore > 0 ? 'var(--danger)' : undefined }}>
                {r.diff_value_ore ? `${r.diff_value_ore > 0 ? '+' : ''}${formatKr(r.diff_value_ore)}` : '–'}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {r.lass.invoiced
                  ? <span className="badge badge-muted" title="Lasset är fakturerat. Justera fakturan i Fortnox.">Fakturerad</span>
                  : r.fixable.length > 0 && <Button size="sm" variant="secondary" onClick={() => onFix(r)}><Wand2 size={13} /> Rätta</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnlistedTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Datum</th><th>Vågsedel</th><th>Regnr</th><th>Material</th><th style={{ textAlign: 'right' }}>Netto</th><th>Kund / projekt</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.lass_id} className="clickable" tabIndex={0}
              onClick={() => navigate(`/lass/${l.lass_id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/lass/${l.lass_id}`); }}>
              <td><When datum={l.datum} tid={l.tid} /></td>
              <td className="num">{l.vagsedel_nr ?? '–'}</td>
              <td className="num">{l.vehicle_regnr ?? '–'}</td>
              <td>{l.material ?? '–'}</td>
              <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{formatTon(l.netto_kg) || '–'}</td>
              <td>{l.customer_name}<div className="t-muted" style={{ fontSize: 12 }}>{l.project_name}</div></td>
              <td><span className={`badge ${REVIEW_STATUS[l.review_status].badge}`}>{REVIEW_STATUS[l.review_status].label}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IgnoredTable({ rows, onUndo, busyId }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Vägning</th><th>Vågsedel</th><th>Regnr</th><th style={{ textAlign: 'right' }}>Netto</th><th>Orsak</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="inactive">
              <td><When datum={r.datum} tid={r.tid} /></td>
              <td className="num">{r.vagsedel_nr ?? '–'}</td>
              <td className="num">{r.regnr ?? '–'}</td>
              <td className="num" style={{ textAlign: 'right' }}>{formatTon(r.netto_kg) || '–'}</td>
              <td>{r.resolution_note}</td>
              <td style={{ textAlign: 'right' }}>
                <Button size="sm" variant="ghost" loading={busyId === r.id} onClick={() => onUndo(r)}><Undo2 size={13} /> Ångra</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchedTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Vägning</th><th>Vågsedel</th><th>Regnr</th><th style={{ textAlign: 'right' }}>Netto</th><th>Lass</th><th>Matchning</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="clickable" tabIndex={0}
              onClick={() => navigate(`/lass/${r.lass.lass_id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/lass/${r.lass.lass_id}`); }}>
              <td><When datum={r.datum} tid={r.tid} /></td>
              <td className="num">{r.vagsedel_nr ?? '–'}</td>
              <td className="num">{r.regnr ?? '–'}</td>
              <td className="num" style={{ textAlign: 'right' }}>{formatTon(r.netto_kg) || '–'}</td>
              <td>{r.lass.project_name}<div className="t-muted" style={{ fontSize: 12 }}>{r.lass.customer_name}</div></td>
              <td className="t-muted" style={{ fontSize: 12.5 }}>{MATCH_KIND[r.match.kind]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A row dialog's state. The row stays set while the dialog animates closed; each open is a fresh instance
 * (the dialog is keyed on `n`), so its form starts from the row.
 */
function useRowDialog() {
  const [state, setState] = useState({ row: null, open: false, n: 0 });
  const show = useCallback((row) => setState((s) => ({ row, open: true, n: s.n + 1 })), []);
  const hide = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  return { ...state, show, hide };
}

function Section({ title, count, hint, children, tone }) {
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h2 className="t-heading" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {title}
          <span className={`badge ${tone ?? 'badge-muted'}`}>{count}</span>
        </h2>
      </div>
      {hint && <p className="t-muted" style={{ fontSize: 12.5, padding: '10px 18px 0' }}>{hint}</p>}
      {children}
    </section>
  );
}

export function AvstamningDetail({ params }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/api/avstamning/${params.id}`);
  const creating = useRowDialog();
  const fixing = useRowDialog();
  const ignoring = useRowDialog();
  const [busy, setBusy] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = (dialog) => () => { dialog.hide(); reload(); workChanged(); };

  async function undoIgnore(row) {
    setBusy(row.id);
    try {
      await api(`/api/avstamning/${params.id}/rows/${row.id}/ignore`, { method: 'DELETE' });
      reload();
      workChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    setBusy('csv');
    try {
      await downloadFile(`/api/avstamning/${params.id}/export.csv`, 'avstamning.csv');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    try {
      await api(`/api/avstamning/${params.id}`, { method: 'DELETE' });
      toast('Våglistan är borttagen.');
      navigate('/avstamning');
    } catch (err) {
      toast(err.message, 'error');
      setConfirmDelete(false);
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) {
    return (
      <>
        <Link to="/avstamning" className="reader-back"><ArrowLeft size={14} /> Avstämning</Link>
        <ErrorNotice error={error} onRetry={reload} />
      </>
    );
  }
  if (loading && !data) return <TableSkeleton rows={8} />;
  if (!data) return null;

  const { list, totals: t } = data;
  const of = (s) => data.rows.filter((r) => r.status === s);
  const missing = of('saknas');
  const diffs = of('avvikelse');
  const ignored = of('ignorerad');
  const matched = data.rows.filter((r) => r.match);
  const allGood = !t.saknas && !t.avvikelse && !t.unlisted;

  return (
    <>
      <Link to="/avstamning" className="reader-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 13 }}>
        <ArrowLeft size={14} /> Avstämning
      </Link>
      <PageHeader
        title={list.facility_name}
        description={`Våglista ${formatPeriod(list.period_from, list.period_to)} · importerad ${formatDateTime(list.created_at)} av ${list.created_by_name}${list.source_name ? ` · ${list.source_name}` : ''}`}
        actions={(
          <>
            <Button variant="secondary" onClick={exportCsv} loading={busy === 'csv'}><FileSpreadsheet size={15} /> CSV</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Ta bort våglistan"><Trash2 size={15} /></Button>
          </>
        )}
      />
      <ErrorNotice error={error} onRetry={reload} />

      {t.saknas > 0 ? (
        <div className="notice notice-red" role="status" style={{ marginBottom: 16, alignItems: 'center' }}>
          <TriangleAlert size={16} style={{ flexShrink: 0 }} />
          <span>
            <strong>{t.saknas} {t.saknas === 1 ? 'vägning' : 'vägningar'}</strong> hos {list.facility_name} saknas i Åkaren
            {t.saknas_value_ore > 0 && <> och är värda ungefär <strong className="num">{formatKr(t.saknas_value_ore, { round: true })}</strong> exkl. moms</>}
            {t.saknas_value_ore > 0 && t.saknas_unpriced > 0 && <>, plus {t.saknas_unpriced} utan uppdrag eller pris</>}.
            {' '}Utan lass blir de aldrig fakturerade.
          </span>
        </div>
      ) : allGood && (
        <div className="notice notice-blue" role="status" style={{ marginBottom: 16, alignItems: 'center' }}>
          <CircleCheck size={16} style={{ flexShrink: 0, color: 'var(--success)' }} />
          <span>Allt stämmer: varje vägning på listan har ett lass med samma uppgifter.</span>
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatTile label="Vägningar" value={t.rows} sub={formatTon(t.list_kg)} />
        <StatTile label="Matchade" value={matched.length} sub={`${t.matchad} helt lika`} tone={matched.length === t.rows ? 'var(--success)' : undefined} />
        <StatTile label="Saknas i Åkaren" value={t.saknas}
          sub={t.saknas ? `${formatTon(t.saknas_kg)}${t.saknas_value_ore ? ` · ≈ ${formatKr(t.saknas_value_ore, { round: true })}` : ''}` : 'Inget saknas'}
          tone={t.saknas ? 'var(--danger)' : undefined} />
        <StatTile label="Avvikelser" value={t.avvikelse}
          sub={t.weight_diff_kg ? `Vikt ${formatKgDiff(t.weight_diff_kg)}${t.diff_value_ore ? ` · ${t.diff_value_ore > 0 ? '+' : ''}${formatKr(t.diff_value_ore, { round: true })}` : ''}` : 'Inga'}
          tone={t.avvikelse ? 'var(--amber)' : undefined} />
        <StatTile label="Inte på listan" value={t.unlisted} sub="Lass hit utan vägning" tone={t.unlisted ? 'var(--amber)' : undefined} />
      </div>

      {missing.length > 0 && (
        <Section title="Saknas i Åkaren" count={missing.length} tone="badge-red"
          hint="Vägda hos anläggningen men inte loggade. Skapa lasset på rätt uppdrag så kommer det med på fakturaunderlaget, eller ignorera vägningen om den inte är er.">
          <MissingTable rows={missing} onCreate={creating.show} onIgnore={ignoring.show} />
        </Section>
      )}

      {diffs.length > 0 && (
        <Section title="Avvikelser" count={diffs.length} tone="badge-amber"
          hint="Lasset finns men uppgifterna skiljer sig från vågen. Anläggningens vikt är den som gäller mot kunden.">
          <DifferenceTable rows={diffs} onFix={fixing.show} />
        </Section>
      )}

      {data.unlisted.length > 0 && (
        <Section title="Inte på våglistan" count={data.unlisted.length} tone="badge-amber"
          hint={`Lass som enligt Åkaren gick till ${list.facility_name} under perioden men som inte finns på listan. Kontrollera mottagaren på lasset eller fråga anläggningen.`}>
          <UnlistedTable rows={data.unlisted} />
        </Section>
      )}

      {ignored.length > 0 && (
        <Section title="Ignorerade" count={ignored.length}>
          <IgnoredTable rows={ignored} onUndo={undoIgnore} busyId={busy} />
        </Section>
      )}

      {matched.length > 0 && (
        <details className="panel" style={{ marginBottom: 16 }}>
          <summary className="panel-head" style={{ cursor: 'pointer', listStyle: 'revert' }}>
            <span className="t-heading" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Matchade lass <span className="badge badge-green">{matched.length}</span>
            </span>
          </summary>
          <MatchedTable rows={matched} />
        </details>
      )}

      {list.skipped.length > 0 && (
        <details className="notice notice-amber" style={{ display: 'block', marginBottom: 16 }}>
          <summary style={{ cursor: 'pointer' }}>{list.skipped.length} rader i filen kunde inte läsas vid importen</summary>
          <ul style={{ margin: '8px 0 0 18px', fontSize: 12.5 }}>
            {list.skipped.map((s) => <li key={s.line}>Rad {s.line}: {s.reason}</li>)}
          </ul>
        </details>
      )}

      <CreateLassDialog key={`c${creating.n}`} listId={params.id} row={creating.row} open={creating.open} onClose={creating.hide} onDone={done(creating)} />
      <FixDialog key={`f${fixing.n}`} listId={params.id} row={fixing.row} open={fixing.open} facility={list.facility_name} onClose={fixing.hide} onDone={done(fixing)} />
      <IgnoreDialog key={`i${ignoring.n}`} listId={params.id} row={ignoring.row} open={ignoring.open} onClose={ignoring.hide} onDone={done(ignoring)} />
      <Dialog
        open={confirmDelete} onClose={() => setConfirmDelete(false)}
        title="Ta bort våglistan?"
        description="Listan och dess rader tas bort. Lass påverkas inte. Har lass skapats från listan går den inte att ta bort."
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Avbryt</Button>
            <Button variant="danger" onClick={remove} loading={busy === 'delete'}><Trash2 size={14} /> Ta bort</Button>
          </>
        )}
      />
    </>
  );
}
