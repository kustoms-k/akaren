import { useState } from 'react';
import {
  ArrowRight, ChevronLeft, ChevronRight, ClipboardCheck, Eye, FileDown, FileSpreadsheet, Lock, Send, Tags, TriangleAlert, Undo2, UserPlus,
} from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { Link } from '../components/Link.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api, downloadFile } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { navigate, useLocation } from '../lib/router.js';
import { useToast } from '../lib/toast.js';
import { UNDERLAG_STATUS, formatDate, formatDateTime, formatKr, formatQty } from '../lib/labels.js';
import { downloadUnderlagPdf } from '../lib/underlagPdf.js';

const PREVIEW_ROWS = 8;
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function StatTile({ label, value, sub, tone }) {
  return (
    <div className="panel stat">
      <div className="t-label">{label}</div>
      <div className="stat-value num" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="t-muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function RowStatus({ r, labels }) {
  if (r.invoiced) {
    return <span className="badge badge-muted">{r.invoiced.kind === 'fortnox' ? `Fortnox ${r.invoiced.fortnox_document_nr ?? ''}`.trim() : 'Låst'}</span>;
  }
  return r.blockers.map((b) => <span key={b} className="badge badge-amber" style={{ marginRight: 4 }}>{labels[b]}</span>);
}

/** The Fortnox draft exactly as it would be sent; creating it is the confirm step. */
function PreviewDialog({ open, query, canCreate, onClose, onCreate, creating }) {
  const { data, error } = useApi(open ? `/api/fakturaunderlag/preview?${query}` : null);
  const inv = data?.payload.Invoice;
  const net = inv?.InvoiceRows.reduce((s, r) => s + Math.round(r.Price * 100 * r.DeliveredQuantity), 0) ?? 0;
  return (
    <Dialog
      open={open} onClose={onClose} wide title="Utkast till Fortnox"
      description="Så här skapas fakturan i Fortnox. Den bokförs inte och skickas inte till kunden. Det gör ni själva i Fortnox."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Stäng</Button>
          {canCreate && <Button onClick={onCreate} loading={creating} disabled={!inv}><Send size={14} /> Skapa utkast i Fortnox</Button>}
        </>
      )}
    >
      <ErrorNotice error={error} />
      {!inv ? !error && <TableSkeleton rows={5} /> : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="facts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            <div><div className="fact-label">Kund</div><div className="fact-value">{data.customer.name}</div></div>
            <div><div className="fact-label">Kundnummer</div><div className="fact-value num">{inv.CustomerNumber}</div></div>
            <div><div className="fact-label">Er referens</div><div className="fact-value">{inv.YourReference ?? '–'}</div></div>
            <div><div className="fact-label">Extern referens</div><div className="fact-value num">{inv.ExternalInvoiceReference2}</div></div>
          </div>
          <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
            <table className="table">
              <thead><tr><th>Benämning</th><th style={{ textAlign: 'right' }}>Antal</th><th>Enhet</th><th style={{ textAlign: 'right' }}>À-pris</th><th style={{ textAlign: 'right' }}>Moms</th></tr></thead>
              <tbody>
                {inv.InvoiceRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.Description}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{String(r.DeliveredQuantity).replace('.', ',')}</td>
                    <td>{r.Unit}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{formatKr(Math.round(r.Price * 100))}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{r.VAT} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <p className="t-muted" style={{ fontSize: 12.5, whiteSpace: 'pre-line', maxWidth: 460 }}>{inv.Remarks}</p>
            <div style={{ display: 'grid', gap: 2, fontSize: 13, textAlign: 'right' }}>
              <span>Netto <strong className="num">{formatKr(net)}</strong></span>
              <span className="t-muted">{data.vat_mode === 'omvand_bygg' ? 'Omvänd byggmoms, 0 % på fakturan' : `Moms 25 %: ${formatKr(Math.round(net * 0.25))}`}</span>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function GroupCard({ g, data, company, onChanged }) {
  const toast = useToast();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(false);
  const status = UNDERLAG_STATUS[g.status];
  const fx = data.fortnox;
  const connected = fx.configured && fx.status === 'connected';
  const mapped = Boolean(g.customer.fortnox_customer_nr);
  const billable = g.status === 'klar' || g.status === 'delvis';
  const ids = { week: data.week, customer_id: g.customer.id, project_id: g.project.id };
  const query = new URLSearchParams(ids).toString();
  const batches = data.batches.filter((b) => b.customer_id === g.customer.id && b.project_id === g.project.id && b.status !== 'makulerad');
  const rows = all ? g.rows : g.rows.slice(0, PREVIEW_ROWS);
  const fileBase = `fakturaunderlag-${data.week}-${slug(g.customer.name)}-${slug(g.project.name)}`;

  async function run(kind, fn) {
    setBusy(kind);
    try { await fn(); } catch (err) { toast(err.message, 'error'); } finally { setBusy(null); }
  }
  const createDraft = () => run('fortnox', async () => {
    const r = await api('/api/fakturaunderlag/fortnox', { method: 'POST', body: ids });
    setPreview(false);
    toast(`Utkast ${r.fortnox_document_nr} är skapat i Fortnox (${formatKr(r.total_ore)} exkl. moms).`);
    onChanged();
  });
  const lock = () => run('lock', async () => {
    if (!window.confirm(`Lås underlaget för ${g.customer.name}, ${g.project.name}? Raderna kan inte faktureras igen förrän låset makuleras.`)) return;
    const r = await api('/api/fakturaunderlag/lock', { method: 'POST', body: ids });
    toast(`Underlaget är låst: ${r.rows} rader, ${formatKr(r.total_ore)} exkl. moms. Ladda ner PDF:en och skicka den till kunden.`);
    onChanged();
  });
  const mapCustomer = () => run('map', async () => {
    const r = await api(`/api/fakturaunderlag/customers/${g.customer.id}/fortnox`, { method: 'POST' });
    toast(`${g.customer.name} finns nu i Fortnox som kund ${r.fortnox_customer_nr}.`);
    onChanged();
  });
  const voidBatch = (b) => run(`void${b.id}`, async () => {
    const msg = b.kind === 'fortnox' && b.fortnox_document_nr
      ? `Makulera? Raderna blir fakturerbara igen. Ta också bort utkast ${b.fortnox_document_nr} i Fortnox, annars kan kunden faktureras två gånger.`
      : 'Makulera låset? Raderna blir fakturerbara igen.';
    if (!window.confirm(msg)) return;
    await api(`/api/fakturaunderlag/batches/${b.id}/void`, { method: 'POST' });
    toast('Underlaget är makulerat');
    onChanged();
  });
  const pdf = () => run('pdf', () => downloadUnderlagPdf({ group: g, company, weekLabel: data.label, labels: data.blocker_labels }, `${fileBase}.pdf`));
  const csv = () => run('csv', () => downloadFile(`/api/fakturaunderlag/export.csv?${query}`, `${fileBase}.csv`));

  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="t-heading">{g.customer.name}</h2>
          <div className="t-muted" style={{ fontSize: 13, marginTop: 2 }}>
            {g.project.name}{g.project.customer_ref && <> · Er ref <span className="num">{g.project.customer_ref}</span></>}
            {' · '}{g.vat_mode === 'omvand_bygg' ? 'Omvänd byggmoms' : 'Moms 25 %'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`badge ${status.badge}`}>{status.label}</span>
          <span className="num" style={{ fontSize: 17, fontWeight: 650 }}>{formatKr(g.status === 'fakturerad' ? g.totals.invoiced_net_ore : g.totals.net_ore)}</span>
        </div>
      </div>

      {g.status === 'blockerad' && (
        <div className="notice notice-amber" style={{ margin: '14px 18px 0', alignItems: 'center', flexWrap: 'wrap' }}>
          <TriangleAlert size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Kan inte faktureras än: {g.blockers.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(', ')}.
          </span>
          {g.blockers.some((b) => b.code === 'granskas') && <Link to="/lass"><Button size="sm" variant="secondary"><ClipboardCheck size={13} /> Granska lass</Button></Link>}
          {g.blockers.some((b) => b.code === 'pris_saknas') && <Link to="/prislistor"><Button size="sm" variant="secondary"><Tags size={13} /> Prislistor</Button></Link>}
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Datum</th><th>Beskrivning</th><th style={{ textAlign: 'right' }}>Antal</th><th style={{ textAlign: 'right' }}>À-pris</th><th style={{ textAlign: 'right' }}>Belopp</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.lass_id ? 'clickable' : undefined} style={r.invoiced ? { opacity: 0.6 } : undefined}
                onClick={r.lass_id ? () => navigate(`/lass/${r.lass_id}`) : undefined}>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.datum)}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.description}</div>
                  <div className="t-muted" style={{ fontSize: 12 }}>{r.detail}{r.price_source && <> · {r.price_source}</>}</div>
                </td>
                <td className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatQty(r.quantity, r.unit) || '–'}</td>
                <td className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatKr(r.price_ore) || '–'}</td>
                <td className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{formatKr(r.amount_ore) || '–'}</td>
                <td style={{ whiteSpace: 'nowrap' }}><RowStatus r={r} labels={data.blocker_labels} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {g.rows.length > PREVIEW_ROWS && (
        <button type="button" className="mail-collapsed" style={{ justifyContent: 'center', borderBottom: '1px solid var(--border)' }} onClick={() => setAll((s) => !s)}>
          {all ? 'Visa färre rader' : `Visa alla ${g.rows.length} rader`}
        </button>
      )}

      {batches.length > 0 && (
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'grid', gap: 6 }}>
          {batches.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
              {b.status === 'misslyckad'
                ? <span className="badge badge-red">Misslyckades</span>
                : <span className={`badge ${b.kind === 'fortnox' ? 'badge-green' : 'badge-blue'}`}>{b.kind === 'fortnox' ? `Utkast ${b.fortnox_document_nr ?? '…'} i Fortnox` : 'Låst för manuell faktura'}</span>}
              <span className="t-muted" style={{ flex: 1 }}>
                {formatKr(b.total_ore)} exkl. moms · {b.line_count || 0} rader · {formatDateTime(b.created_at)} av {b.created_by_name}
                {b.status === 'misslyckad' && ' · raderna släpptes, försök igen'}
              </span>
              {b.status !== 'misslyckad' && (
                <Button size="sm" variant="ghost" onClick={() => voidBatch(b)} loading={busy === `void${b.id}`}><Undo2 size={13} /> Makulera</Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="composer-foot" style={{ padding: '12px 18px' }}>
        <div style={{ fontSize: 13, display: 'flex', gap: 14, flexWrap: 'wrap' }} className="num">
          {g.status === 'fakturerad' ? (
            <span><span className="t-muted">Fakturerat</span> <strong>{formatKr(g.totals.invoiced_net_ore)}</strong> <span className="t-muted">exkl. moms</span></span>
          ) : (<>
          <span><span className="t-muted">Netto</span> {formatKr(g.totals.net_ore)}</span>
          <span><span className="t-muted">{g.vat_mode === 'omvand_bygg' ? 'Moms (omvänd)' : 'Moms'}</span> {formatKr(g.totals.vat_ore)}</span>
          <span><span className="t-muted">Att fakturera</span> <strong>{formatKr(g.totals.total_ore)}</strong></span>
          </>)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" onClick={csv} loading={busy === 'csv'}><FileSpreadsheet size={13} /> CSV</Button>
          <Button size="sm" variant="ghost" onClick={pdf} loading={busy === 'pdf'} title="Underlaget med ett foto av varje vågsedel"><FileDown size={13} /> PDF med vågsedlar</Button>
          {billable && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setPreview(true)}><Eye size={13} /> Förhandsgranska</Button>
              <Button size="sm" variant="secondary" onClick={lock} loading={busy === 'lock'} title="För kunder som faktureras utanför Fortnox"><Lock size={13} /> Lås underlag</Button>
              {connected && !mapped ? (
                <Button size="sm" onClick={mapCustomer} loading={busy === 'map'}><UserPlus size={13} /> Skapa kunden i Fortnox</Button>
              ) : (
                <span title={!fx.configured ? 'Fortnox är inte konfigurerat på servern' : !connected ? 'Anslut Fortnox under Inställningar' : undefined}>
                  <Button size="sm" disabled={!connected} onClick={() => setPreview(true)}><Send size={13} /> Skapa utkast i Fortnox</Button>
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <PreviewDialog open={preview} query={query} canCreate={connected && mapped} creating={busy === 'fortnox'}
        onClose={() => setPreview(false)} onCreate={createDraft} />
    </section>
  );
}

export function Fakturaunderlag() {
  const { query } = useLocation();
  const week = query.get('vecka');
  const { data, error, loading, reload } = useApi(`/api/fakturaunderlag${week ? `?week=${encodeURIComponent(week)}` : ''}`);
  const company = useApi('/api/settings');
  const go = (w) => navigate(w === data?.current_week ? '/faktura' : `/faktura?vecka=${w}`);

  const t = data?.totals;
  const pct = t?.groups ? Math.round(((t.ready + t.invoiced) / t.groups) * 100) : 0;
  return (
    <>
      <PageHeader
        title="Fakturaunderlag"
        description="Veckans fakturerbara arbete per kund och projekt. Skapa utkast i Fortnox, eller lås underlaget och skicka PDF:en."
        actions={<Link to="/prislistor" style={{ textDecoration: 'none' }}><Button variant="ghost"><Tags size={14} /> Prislistor</Button></Link>}
      />
      <ErrorNotice error={error} onRetry={reload} />

      {data && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <Button variant="secondary" size="sm" onClick={() => go(data.prev_week)} aria-label="Föregående vecka"><ChevronLeft size={15} /></Button>
            <span style={{ fontWeight: 650, fontSize: 15, minWidth: 210, textAlign: 'center' }}>{data.label}</span>
            <Button variant="secondary" size="sm" onClick={() => go(data.next_week)} aria-label="Nästa vecka"><ChevronRight size={15} /></Button>
            {data.week !== data.current_week && <Button variant="ghost" size="sm" onClick={() => go(data.current_week)}>Denna vecka</Button>}
            <span style={{ flex: 1 }} />
            <span className={`badge ${data.fortnox.status === 'connected' ? 'badge-green' : data.fortnox.status === 'reconnect_required' ? 'badge-red' : 'badge-muted'}`}>
              Fortnox: {!data.fortnox.configured ? 'inte konfigurerat' : data.fortnox.status === 'connected' ? 'anslutet' : data.fortnox.status === 'reconnect_required' ? 'anslut igen' : 'inte anslutet'}
            </span>
          </div>

          {data.week === data.current_week && data.prev_week_open_lass > 0 && (
            <div className="notice notice-blue" style={{ marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1 }}>Förra veckan har {data.prev_week_open_lass} lass som inte är fakturerade än.</span>
              <Button size="sm" variant="secondary" onClick={() => go(data.prev_week)}>Visa förra veckan <ArrowRight size={13} /></Button>
            </div>
          )}

          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <StatTile label="Klart att fakturera" value={formatKr(t.ready_net_ore, { round: true })} sub={`${t.ready} av ${t.groups} underlag`} tone={t.ready ? 'var(--success)' : undefined} />
            <StatTile label="Blockerat" value={t.blocked} sub={t.blocked ? 'Lass att granska eller pris saknas' : 'Inget som stoppar'} tone={t.blocked ? 'var(--warning)' : undefined} />
            <StatTile label="Fakturerat" value={formatKr(t.invoiced_net_ore, { round: true })} sub={`${t.invoiced} underlag klara`} />
            <div className="panel stat">
              <div className="t-label">Veckan</div>
              <div className="stat-value num">{pct} %</div>
              <div style={{ height: 6, background: 'var(--surface-elevated)', borderRadius: 99, overflow: 'hidden', marginTop: 6 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--success)', borderRadius: 99, transition: 'width 400ms var(--ease-out)' }} />
              </div>
            </div>
          </div>
        </>
      )}

      {loading && !data ? <TableSkeleton rows={8} /> : data && (
        data.groups.length === 0 ? (
          <section className="panel"><div className="empty">Inget fakturerbart arbete den här veckan.</div></section>
        ) : data.groups.map((g) => (
          <GroupCard key={`${data.week}:${g.key}`} g={g} data={data} company={company.data ?? {}} onChanged={reload} />
        ))
      )}
    </>
  );
}
