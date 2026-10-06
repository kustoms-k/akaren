import { useRef, useState } from 'react';
import { FileDown, FileUp, RotateCcw, SearchCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { PageHeader, ErrorNotice } from '../components/PageHeader.jsx';
import { MappingPicker, PreviewTable } from '../components/ListImport.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useToast } from '../lib/toast.js';
import { readListFile } from '../lib/listFile.js';
import { downloadLossPdf } from '../lib/lossPdf.js';
import { formatDate, formatKr, formatKgDiff, formatPeriod, formatTon } from '../lib/labels.js';

const INVOICE_FIELDS = ['datum', 'vagsedel_nr', 'regnr', 'netto_kg', 'belopp', 'material', 'referens'];
const EMPTY_SOURCE = { text: '', name: null, preview: null, mapping: null };
const weekLabel = (key) => `v. ${Number(key.split('-W')[1])}`;
const slug = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** One of the two files: paste or pick it, read it, check the columns. */
function Source({ kind, title, hint, source, onChange }) {
  const fileInput = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const invoice = kind === 'faktura';

  async function preview(text, mapping) {
    setBusy(true);
    setError(null);
    try {
      const p = await api('/api/forlustkontroll/preview', { method: 'POST', body: { text, kind, ...(mapping ? { mapping } : {}) } });
      onChange((s) => ({ ...s, text, preview: p, mapping: p.mapping }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await readListFile(file);
      onChange({ ...EMPTY_SOURCE, text, name: file.name });
      preview(text, null);
    } catch (err) {
      setError(err);
    }
  }

  const p = source.preview;
  return (
    <section className="panel" style={{ minWidth: 0 }}>
      <div className="panel-head">
        <div>
          <h2 className="t-heading">{title}</h2>
          <p className="t-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{hint}</p>
        </div>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {p && !p.error && <span className="badge badge-green">{p.row_count} rader</span>}
          <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}><FileUp size={13} /> Välj fil</Button>
          <input ref={fileInput} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden onChange={onFile} />
        </span>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
        {error && <div className="notice notice-red" role="alert">{error.fields?.text ?? error.message}</div>}
        {!p ? (
          <>
            {source.name && <span className="badge badge-blue" style={{ justifySelf: 'start' }}>{source.name}</span>}
            <textarea
              className="input num" rows={7} value={source.text} spellCheck={false} aria-label={title}
              placeholder={invoice
                ? 'Klistra in fakturaraderna med rubrikraden överst, t.ex. en export från Fortnox eller affärssystemet.'
                : 'Klistra in vägningarna med rubrikraden överst, eller välj CSV-filen från tippen.'}
              onChange={(e) => onChange({ ...EMPTY_SOURCE, text: e.target.value })}
              style={{ fontSize: 12.5, whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
            <Button variant="secondary" onClick={() => preview(source.text, null)} loading={busy} disabled={!source.text.trim()} style={{ justifySelf: 'start' }}>
              Läs in
            </Button>
          </>
        ) : (
          <>
            {p.error && <div className="notice notice-amber"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {p.error}</div>}
            <MappingPicker
              headers={p.headers} mapping={source.mapping} labels={p.labels} idPrefix={`${kind}-`}
              fields={invoice ? INVOICE_FIELDS : undefined} required={invoice ? { datum: true } : null}
              onChange={(m) => { onChange((s) => ({ ...s, mapping: m })); preview(source.text, m); }}
            />
            {p.row_count > 0 && (
              <>
                <div className="t-muted" style={{ fontSize: 12.5 }}>
                  {p.row_count} rader{p.period ? ` · ${formatPeriod(p.period.from, p.period.to)}` : ''}
                  {p.skipped_count > 0 && ` · ${p.skipped_count} kunde inte läsas`}
                </div>
                <PreviewTable rows={p.rows.slice(0, 5)} amounts={invoice} />
              </>
            )}
            <Button size="sm" variant="ghost" style={{ justifySelf: 'start' }} onClick={() => onChange(EMPTY_SOURCE)}>
              <RotateCcw size={13} /> Byt fil
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function Result({ r, onPdf, busy }) {
  const t = r.totals;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className={`panel loss-hero ${t.total_value_ore > 0 ? 'loss-found' : 'loss-clear'}`}>
        <div className="panel-body" style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="t-label">{r.prospect_name ? `${r.prospect_name} · ` : ''}{r.facility_name} · {formatPeriod(r.period.from, r.period.to)}</div>
            <div className="loss-value num">
              {t.total_value_ore > 0 ? `${formatKr(t.total_value_ore, { round: true })} ofakturerat` : 'Allt är fakturerat'}
            </div>
            <div style={{ fontSize: 14 }}>
              {t.missing > 0
                ? <>{t.missing} lass ({formatTon(t.missing_kg)}) vägdes men finns inte på fakturorna</>
                : 'Varje vägning finns på en faktura'}
              {t.diff_kg > 0 && <>, och {formatTon(t.diff_kg)} fakturerades för lite</>}.
            </div>
            {r.price && (
              <div className="t-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                Värderat med {formatKr(r.price.ore)} {r.price.unit === 'ton' ? 'per ton' : 'per lass'} {r.price.source === 'fakturor' ? 'enligt fakturorna' : '(angivet pris)'}, exkl. moms.
              </div>
            )}
          </div>
          <Button size="lg" onClick={onPdf} loading={busy}><FileDown size={16} /> PDF-rapport</Button>
        </div>
      </section>

      <div className="stat-grid">
        <div className="panel stat"><div className="t-label">Vägningar</div><div className="stat-value num">{t.weighed}</div><div className="t-muted" style={{ fontSize: 12 }}>{formatTon(t.weighed_kg)}</div></div>
        <div className="panel stat"><div className="t-label">På fakturorna</div><div className="stat-value num">{t.matched}</div><div className="t-muted" style={{ fontSize: 12 }}>{t.matched_by_ticket} via vågsedelnumret</div></div>
        <div className="panel stat"><div className="t-label">Inte fakturerade</div><div className="stat-value num" style={{ color: t.missing ? 'var(--danger)' : undefined }}>{t.missing}</div><div className="t-muted" style={{ fontSize: 12 }}>{t.missing ? `≈ ${formatKr(t.missing_value_ore, { round: true })}` : '–'}</div></div>
        <div className="panel stat"><div className="t-label">Fakturerat för lite</div><div className="stat-value num" style={{ color: t.diff_kg ? 'var(--amber)' : undefined }}>{t.diff_kg ? formatKgDiff(t.diff_kg) : '0'}</div><div className="t-muted" style={{ fontSize: 12 }}>{t.diff_value_ore ? `≈ ${formatKr(t.diff_value_ore, { round: true })}` : '–'}</div></div>
      </div>

      {r.missing.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2 className="t-heading">Vägda men inte fakturerade</h2><span className="badge badge-red">{r.missing.length}</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Datum</th><th>Vågsedel</th><th>Regnr</th><th>Material</th><th style={{ textAlign: 'right' }}>Netto</th><th style={{ textAlign: 'right' }}>Värde</th></tr></thead>
              <tbody>
                {r.missing.map((m) => (
                  <tr key={m.line}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{formatDate(m.datum)}{m.tid && <span className="t-muted"> {m.tid}</span>}</td>
                    <td className="num">{m.vagsedel_nr ?? '–'}</td>
                    <td className="num">{m.regnr ?? '–'}</td>
                    <td>{m.material ?? '–'}{m.referens && <div className="t-muted" style={{ fontSize: 12 }}>{m.referens}</div>}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{formatTon(m.netto_kg) || '–'}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>{m.value_ore != null ? formatKr(m.value_ore) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {r.differences.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2 className="t-heading">Fakturerat med lägre vikt än vågen</h2><span className="badge badge-amber">{r.differences.length}</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Datum</th><th>Vågsedel</th><th>Fakturarad</th><th style={{ textAlign: 'right' }}>Vägt</th><th style={{ textAlign: 'right' }}>Fakturerat</th><th style={{ textAlign: 'right' }}>Värde</th></tr></thead>
              <tbody>
                {r.differences.map((d) => (
                  <tr key={d.line}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{formatDate(d.datum)}</td>
                    <td className="num">{d.vagsedel_nr ?? '–'}</td>
                    <td className="t-muted" style={{ fontSize: 13 }}>{d.invoice_text ?? `Rad ${d.invoice_line}`}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{formatTon(d.weighed_kg)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{formatTon(d.invoiced_kg)}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--amber)' }}>{formatKr(d.value_ore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h2 className="t-heading">Per vecka</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vecka</th><th style={{ textAlign: 'right' }}>Vägningar</th><th style={{ textAlign: 'right' }}>Vägt</th><th style={{ textAlign: 'right' }}>Fakturarader</th><th style={{ textAlign: 'right' }}>Fakturerat</th><th style={{ textAlign: 'right' }}>Saknas</th></tr></thead>
            <tbody>
              {r.weeks.map((w) => (
                <tr key={w.week}>
                  <td className="num">{weekLabel(w.week)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{w.weighed}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{formatTon(w.weighed_kg)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{w.invoiced}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{w.invoiced_kg ? formatTon(w.invoiced_kg) : '–'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: w.missing ? 600 : undefined, color: w.missing ? 'var(--danger)' : undefined }}>{w.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.totals.invoice_rows_unmatched > 0 && (
          <p className="t-muted" style={{ fontSize: 12.5, padding: '10px 18px' }}>
            {r.totals.invoice_rows_unmatched} fakturarader hörde inte till någon vägning på listan (t.ex. andra tippar, timmar eller avgifter).
          </p>
        )}
      </section>
    </div>
  );
}

export function Forlustkontroll() {
  const toast = useToast();
  const demo = useApi('/api/auth/demo').data?.enabled === true;
  const [weigh, setWeigh] = useState(EMPTY_SOURCE);
  const [invoice, setInvoice] = useState(EMPTY_SOURCE);
  const [facility, setFacility] = useState('');
  const [prospect, setProspect] = useState('');
  const [priceTon, setPriceTon] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const ready = weigh.preview && !weigh.preview.error && invoice.preview && !invoice.preview.error && facility.trim();

  async function loadExample() {
    setBusy('example');
    try {
      const ex = await api('/api/demo/forlustkontroll-exempel');
      setFacility(ex.facility_name);
      setProspect(ex.prospect_name);
      setResult(null);
      const read = async (src, kind) => {
        const p = await api('/api/forlustkontroll/preview', { method: 'POST', body: { text: src.text, kind } });
        return { text: src.text, name: src.name, preview: p, mapping: p.mapping };
      };
      setWeigh(await read(ex.vaglista, 'vaglista'));
      setInvoice(await read(ex.faktura, 'faktura'));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy('run');
    setError(null);
    try {
      setResult(await api('/api/forlustkontroll', {
        method: 'POST',
        body: {
          weigh: { text: weigh.text, mapping: weigh.mapping }, invoice: { text: invoice.text, mapping: invoice.mapping },
          facility_name: facility, prospect_name: prospect || null, ...(priceTon ? { price_ton_kr: priceTon } : {}),
        },
      }));
      requestAnimationFrame(() => document.getElementById('resultat')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function pdf() {
    setBusy('pdf');
    try {
      await downloadLossPdf(result, `forlustkontroll-${slug(result.prospect_name || result.facility_name)}-${result.period.from}-${result.period.to}.pdf`);
    } catch {
      toast('PDF:en kunde inte skapas. Försök igen.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Förlustkontroll"
        description="Jämför tippens våglista med fakturorna och se vilka lass som aldrig fakturerades och vad de var värda. Filerna sparas inte."
        actions={demo && <Button variant="secondary" onClick={loadExample} loading={busy === 'example'}><Sparkles size={15} /> Ladda exempel</Button>}
      />

      <div className="loss-sources">
        <Source kind="vaglista" title="1. Våglista från tippen" source={weigh} onChange={setWeigh}
          hint="Vägningsrapporten för åkeriets kundnummer: datum, vågsedelnummer, regnr och netto." />
        <Source kind="faktura" title="2. Fakturaspecifikation" source={invoice} onChange={setInvoice}
          hint="Fakturaraderna för samma period: vågsedelnumret i texten, antal ton och belopp." />
      </div>

      <section className="panel" style={{ margin: '16px 0' }}>
        <div className="panel-body" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', alignItems: 'end' }}>
          <div className="field">
            <label className="field-label" htmlFor="lk-facility">Tipp / mottagare *</label>
            <input id="lk-facility" className="input" value={facility} onChange={(e) => setFacility(e.target.value)} placeholder="t.ex. Ekbacka massmottagning" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="lk-prospect">Åkeri (står på rapporten)</label>
            <input id="lk-prospect" className="input" value={prospect} onChange={(e) => setProspect(e.target.value)} placeholder="Valfritt" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="lk-price">Pris per ton (kr)</label>
            <input id="lk-price" className="input num" inputMode="decimal" value={priceTon} onChange={(e) => setPriceTon(e.target.value)} placeholder="Räknas från fakturorna" />
          </div>
          <Button size="lg" onClick={run} loading={busy === 'run'} disabled={!ready || busy !== null}>
            <SearchCheck size={16} /> Kör kontrollen
          </Button>
        </div>
        {error && <div style={{ padding: '0 18px 16px' }}><ErrorNotice error={error} /></div>}
      </section>

      <div id="resultat" style={{ scrollMarginTop: 16 }}>
        {result && <Result r={result} onPdf={pdf} busy={busy === 'pdf'} />}
      </div>
    </>
  );
}
