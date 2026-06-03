import { useState, useEffect, Fragment } from 'react';
import { Download, Mail, FileText, Truck, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useLiveQuery }    from 'dexie-react-hooks';
import { useAuth }         from '../context/AuthContext.jsx';
import { useLanguage }     from '../context/LanguageContext.jsx';
import { generateFaktura } from '../utils/generateFaktura.js';
import { apiFetch }        from '../utils/apiFetch.js';
import { Toast }           from '../components/Toast.jsx';
import { db }              from '../db/dexie.js';
import { Button }          from '../components/Button.jsx';

// ── Design tokens ─────────────────────────────────────────────────────────────
const AMBER   = '#B56510';
const CYAN    = '#2563eb';
const CYAN_BR = '#2A5FAA';
const SUCCESS = '#16a34a';
const DANGER  = '#dc2626';
const WARNING_C = '#B56510';
const BG_BASE = '#f4f5f7';
const BORDER  = '#ececef';
const TEXT_PR = '#1a1d24';
const TEXT_SEC= '#6b7280';
const TEXT_MU = '#9ca3af';
const INTER   = "'Geist', system-ui, sans-serif";

const OUTFIT  = INTER;
const WHITE   = '#ffffff';
const TEXT    = TEXT_PR;
const MUTED   = TEXT_SEC;
const FAINT   = TEXT_MU;
const SURF    = '#ffffff';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtSEK = (n) =>
  n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

const fmtDate = (s) => {
  if (!s) return '—';
  try {
    const d = new Date(String(s).replace(' ', 'T'));
    return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  } catch { return s; }
};

const fmtDateShort = (s) => {
  if (!s) return '—';
  try {
    const d = new Date(String(s).replace(' ', 'T'));
    return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' }).format(d);
  } catch { return s; }
};

const STATUS_CFG = {
  planerad:   { color: WARNING_C,  bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  aktiv:      { color: SUCCESS,    bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  avslutad:   { color: SUCCESS,    bg: 'rgba(22,163,74,0.10)',  border: 'rgba(22,163,74,0.20)' },
  slutförd:   { color: SUCCESS,    bg: 'rgba(22,163,74,0.10)',  border: 'rgba(22,163,74,0.20)' },
  fakturerad: { color: '#60a5fa',  bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)' },
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const { t } = useLanguage();
  const s = STATUS_CFG[status] ?? STATUS_CFG.planerad;
  return (
    <span style={{
      fontFamily: INTER, fontSize: 11, letterSpacing: '0.02em', fontWeight: 600,
      textTransform: 'uppercase', color: s.color, background: s.bg,
      border: `1px solid ${s.border}`,
      padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap',
    }}>
      {t.jobs.statuses[status] ?? status}
    </span>
  );
}

// ── Status pipeline strip ─────────────────────────────────────────────────────
function StatusPipeline({ jobs, t }) {
  const stages = ['planerad', 'aktiv', 'avslutad', 'fakturerad'];
  const counts = Object.fromEntries(
    stages.map((s) => [s, jobs.filter((j) => j.status === s || (s === 'avslutad' && j.status === 'slutförd')).length])
  );
  const total = jobs.length;

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0,
      background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
      overflow: 'hidden', marginBottom: 20, flexShrink: 0,
    }}>
      {stages.map((stage, i) => {
        const cfg   = STATUS_CFG[stage];
        const count = counts[stage];
        const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
        const isLast = i === stages.length - 1;
        return (
          <Fragment key={stage}>
            <div style={{
              flex: 1, padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 4,
              position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: cfg.color, flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: INTER, fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  color: count > 0 ? cfg.color : FAINT,
                }}>
                  {t.jobs.statuses[stage] ?? stage}
                </span>
              </div>
              <div style={{
                fontFamily: INTER, fontSize: 22, fontWeight: 700,
                color: count > 0 ? TEXT_PR : FAINT,
                lineHeight: 1, fontFeatureSettings: '"tnum"',
              }}>
                {count}
              </div>
              <div style={{ height: 2, background: BG_BASE, borderRadius: 1, marginTop: 4 }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 1,
                  background: count > 0 ? cfg.color : 'transparent',
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
            {!isLast && (
              <div style={{
                width: 1, background: BORDER, flexShrink: 0, alignSelf: 'stretch',
              }} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Job detail slide-in panel ─────────────────────────────────────────────────
function JobDetailPanel({ job, t, onClose, onInvoice, onDownload, onEmail }) {
  if (!job) return null;
  const fakturaNr  = job.invoice_faktura_nr || job.faktura_nr;
  const isFakturerad = job.status === 'fakturerad';
  const hasInvoice   = Boolean(job.invoice_id);
  const jobNr = `${t.jobs.jobPrefix}-${new Date().getFullYear()}-${String(job.id).padStart(3, '0')}`;

  const Row = ({ label, value, mono }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '9px 0', borderBottom: `1px solid ${BORDER}`,
    }}>
      <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED, flexShrink: 0, marginRight: 12 }}>
        {label}
      </span>
      <span style={{
        fontFamily: INTER, fontSize: 13, color: TEXT_PR, fontWeight: 500, textAlign: 'right',
        fontFeatureSettings: mono ? '"tnum"' : 'normal',
        wordBreak: 'break-word',
      }}>
        {value ?? '—'}
      </span>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.18)',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 401,
        width: 380, background: WHITE,
        borderLeft: `1px solid ${BORDER}`,
        boxShadow: '-8px 0 40px rgba(0,0,0,0.10)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: AMBER, marginBottom: 4 }}>
              {jobNr}
            </div>
            <div style={{ fontFamily: INTER, fontSize: 17, fontWeight: 700, color: TEXT_PR, lineHeight: 1.2 }}>
              {job.lasttyp || t.jobs.invoiceModal.defaultCargo}
            </div>
            {(job.upphämtning || job.leverans) && (
              <div style={{ fontFamily: INTER, fontSize: 12, color: MUTED, marginTop: 4 }}>
                {[job.upphämtning, job.leverans].filter(Boolean).join(' → ')}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: MUTED, padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Status */}
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <StatusBadge status={job.status} />
        </div>

        {/* Detail rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 16px' }}>

          {job.totalpris_sek != null && (
            <Row label={t.jobs.amount} value={
              <span>
                <span style={{ color: AMBER, fontWeight: 700 }}>{fmtSEK(job.totalpris_sek)}</span>
                <span style={{ color: FAINT, fontSize: 10, marginLeft: 5 }}>{t.jobs.exclVat}</span>
              </span>
            } />
          )}
          {job.avstand_km != null && (
            <Row label="Distance" value={`${job.avstand_km} km`} mono />
          )}
          <Row label={t.jobs.date} value={fmtDate(job.datum || job.created_at)} />
          {job.customer_name && <Row label={t.customers?.modal?.name ?? 'Customer'} value={job.customer_name} />}
          {job.customer_email && <Row label={t.jobs.invoiceModal.email} value={job.customer_email} />}
          {job.customer_org_nr && <Row label={t.jobs.invoiceModal.orgNr} value={job.customer_org_nr} mono />}
          {job.customer_address && <Row label={t.jobs.invoiceModal.address} value={job.customer_address} />}
          {fakturaNr && <Row label={t.jobs.invoice} value={fakturaNr} mono />}
          {job.due_date && <Row label="Due" value={fmtDate(job.due_date)} />}
          {job.invoice_total != null && (
            <Row label="Invoice total" value={
              <span style={{ color: SUCCESS, fontWeight: 700 }}>{fmtSEK(job.invoice_total)}</span>
            } />
          )}
        </div>

        {/* Action buttons */}
        <div style={{
          padding: '14px 20px',
          borderTop: `1px solid ${BORDER}`,
          display: 'flex', flexDirection: 'column', gap: 8,
          flexShrink: 0,
        }}>
          {!isFakturerad ? (
            <Button variant="primary" onClick={() => { onInvoice(job); onClose(); }}>
              <FileText size={14} />
              {t.jobs.generateInvoice}
            </Button>
          ) : (
            <>
              {hasInvoice && (
                <Button variant="secondary" onClick={() => onDownload(job)}>
                  <Download size={14} />
                  {t.jobs.downloadPdf}
                </Button>
              )}
              <Button variant="secondary" onClick={() => onEmail(job)}>
                <Mail size={14} />
                {t.jobs.sendEmail}
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Returlast match card ───────────────────────────────────────────────────────
function MatchCard({ match, jobId, onLink, linkingId }) {
  const { t } = useLanguage();
  const bh = t.backhaul;
  const isLinking = linkingId === match.quote_id;

  return (
    <div style={{
      border: `1px solid rgba(44,95,191,0.20)`,
      borderRadius: 10, padding: '14px 16px',
      background: '#f7f9ff',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div>
        <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: TEXT_PR }}>
          {match.upphämtning || '—'} → {match.leverans || '—'}
        </div>
        <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU, marginTop: 2 }}>
          {match.lasttyp || '—'}
          {match.datum ? ` · ${new Date(match.datum).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}` : ''}
          {match.avstand_km != null ? ` · ${match.avstand_km} km` : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEXT_MU }}>{bh.extraRevenue}</div>
          <div style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 13, fontWeight: 600, color: AMBER, marginTop: 2 }}>{fmtSEK(match.totalpris_sek)}</div>
        </div>
        <div>
          <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEXT_MU }}>{bh.emptyKmSaved(match.empty_km_eliminated)}</div>
          <div style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 13, fontWeight: 600, color: SUCCESS, marginTop: 2 }}>{bh.savedSek(match.saved_sek)}</div>
        </div>
        <div>
          <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEXT_MU }}>{bh.combinedRevenue}</div>
          <div style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 13, fontWeight: 700, color: TEXT_PR, marginTop: 2 }}>{fmtSEK(match.combined_revenue)}</div>
        </div>
      </div>

      <button
        onClick={() => onLink(jobId, match.quote_id)}
        disabled={isLinking}
        style={{
          alignSelf: 'flex-start',
          fontFamily: INTER, fontSize: 12, fontWeight: 600,
          padding: '6px 14px', borderRadius: 8, cursor: isLinking ? 'not-allowed' : 'pointer',
          background: isLinking ? 'rgba(44,95,191,0.1)' : '#2C5FBF',
          color: isLinking ? CYAN : '#fff',
          border: 'none', opacity: isLinking ? 0.7 : 1,
          transition: 'opacity 150ms',
        }}
        onMouseEnter={(e) => { if (!isLinking) e.currentTarget.style.opacity = '0.85'; }}
        onMouseLeave={(e) => { if (!isLinking) e.currentTarget.style.opacity = '1'; }}
      >
        {isLinking ? bh.linking : bh.linkBtn}
      </button>
    </div>
  );
}

function ReturlastPanel({ jobId, job, data, onLink, linkingId }) {
  const { t } = useLanguage();
  const bh = t.backhaul;

  if (!data || data.loading) {
    return (
      <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MU, padding: '12px 0', fontStyle: 'italic' }}>
        {bh.loading}
      </div>
    );
  }

  if (data.already_paired) {
    return (
      <div style={{ fontFamily: INTER, fontSize: 12, color: SUCCESS, padding: '10px 0', fontWeight: 600 }}>
        {bh.alreadyPaired}
      </div>
    );
  }

  if (!data.matches || data.matches.length === 0) {
    return (
      <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MU, padding: '10px 0', fontStyle: 'italic' }}>
        {bh.noMatches}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {data.matches.map((match) => (
        <MatchCard
          key={match.quote_id}
          match={match}
          jobId={jobId}
          onLink={onLink}
          linkingId={linkingId}
        />
      ))}
    </div>
  );
}

// ── Invoice modal ─────────────────────────────────────────────────────────────
function InvoiceModal({ job, customers, onClose, onSuccess }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    customer_name: '', customer_org_nr: '', customer_address: '', customer_email: '',
  });
  const [selectedCustId, setSelectedCustId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);

  function pickCustomer(id) {
    setSelectedCustId(id);
    if (!id) return;
    const c = customers.find((x) => String(x.id) === id);
    if (c) {
      setForm({
        customer_name:    c.name    || '',
        customer_org_nr:  c.org_nr  || '',
        customer_address: [c.address, c.zip_code, c.city].filter(Boolean).join(', '),
        customer_email:   c.email   || '',
      });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.customer_name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id:              job.id,
          customer_name:       form.customer_name.trim()    || null,
          customer_org_nr:     form.customer_org_nr.trim()  || null,
          customer_address:    form.customer_address.trim() || null,
          customer_email:      form.customer_email.trim()   || null,
          fortnox_customer_id: selectedCustId ? Number(selectedCustId) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const invoice = await res.json();

      await db.jobs.update(job.id, {
        status:            'fakturerad',
        faktura_nr:         invoice.faktura_nr,
        invoice_id:         invoice.id,
        invoice_faktura_nr: invoice.faktura_nr,
        invoice_total:      invoice.total,
        invoice_subtotal:   invoice.subtotal,
        invoice_vat:        invoice.vat,
        customer_name:      invoice.customer_name,
        customer_org_nr:    invoice.customer_org_nr,
        customer_address:   invoice.customer_address,
        customer_email:     invoice.customer_email,
        due_date:           invoice.due_date,
        line_items:         JSON.stringify(invoice.line_items),
      }).catch(() => {});

      await generateFaktura(invoice, invoice.company);
      onSuccess(invoice);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    width: '100%', fontFamily: INTER, fontSize: 13, color: TEXT_PR,
    border: '1px solid rgba(28,26,22,0.12)', borderRadius: 8, padding: '9px 14px',
    outline: 'none', boxSizing: 'border-box', background: '#ffffff',
  };
  const labelStyle = {
    fontFamily: INTER, fontSize: 11, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: TEXT_MU, fontWeight: 700,
    display: 'block', marginBottom: 5,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(28,26,22,0.5)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#ffffff',
          border: `1px solid #ececef`,
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)', padding: 28, width: 460,
        }}
      >
        <div style={{ fontFamily: INTER, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT_MU, fontWeight: 700, marginBottom: 6 }}>
          {t.jobs.invoiceModal.heading}
        </div>
        <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 600, color: TEXT_PR, marginBottom: 4 }}>
          {job.lasttyp || t.jobs.invoiceModal.defaultCargo}
        </div>
        {(job.upphämtning || job.leverans) && (
          <div style={{ fontFamily: INTER, fontSize: 13, color: TEXT_SEC, marginBottom: 20 }}>
            {[job.upphämtning, job.leverans].filter(Boolean).join(' – ')}
            {job.totalpris_sek != null && (
              <span style={{ color: AMBER, marginLeft: 10, fontWeight: 600, fontFamily: INTER, fontFeatureSettings: '"tnum"' }}>{fmtSEK(job.totalpris_sek)} {t.jobs.exclVat}</span>
            )}
          </div>
        )}

        {customers.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t.jobs.invoiceModal.selectCustomer}</label>
            <select value={selectedCustId} onChange={(e) => pickCustomer(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">{t.jobs.invoiceModal.selectOrManual}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.org_nr ? `(${c.org_nr})` : ''}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t.jobs.invoiceModal.customerName}</label>
          <input
            autoFocus={customers.length === 0}
            required
            value={form.customer_name}
            onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
            placeholder={t.jobs.invoiceModal.placeholderName}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>{t.jobs.invoiceModal.orgNr}</label>
            <input value={form.customer_org_nr} onChange={(e) => setForm((f) => ({ ...f, customer_org_nr: e.target.value }))} placeholder="556xxx-xxxx" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t.jobs.invoiceModal.email}</label>
            <input type="email" value={form.customer_email} onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))} placeholder="faktura@kund.se" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>{t.jobs.invoiceModal.address}</label>
          <textarea rows={3} value={form.customer_address} onChange={(e) => setForm((f) => ({ ...f, customer_address: e.target.value }))} placeholder={t.jobs.invoiceModal.placeholderAddress} style={{ ...inputStyle, resize: 'none' }} />
        </div>

        {err && <div style={{ fontFamily: INTER, fontSize: 12, color: DANGER, marginBottom: 14 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t.jobs.invoiceModal.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !form.customer_name.trim()}>
            {busy ? t.jobs.invoiceModal.generating : t.jobs.invoiceModal.generate}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Jobs page ─────────────────────────────────────────────────────────────────
export function Jobs() {
  const { t } = useLanguage();
  const { company } = useAuth();
  const [customers,     setCustomers]     = useState([]);
  const [modal,         setModal]         = useState(null);
  const [toast,         setToast]         = useState(null);
  const [expandedJobId, setExpandedJobId] = useState(null);
  const [backhaulData,  setBackhaulData]  = useState({});
  const [linkingId,     setLinkingId]     = useState(null);
  const [selectedJob,   setSelectedJob]   = useState(null);
  const [viewMode,      setViewMode]      = useState('list');

  const jobs    = useLiveQuery(() => db.jobs.orderBy('created_at').reverse().toArray(), [], null) ?? [];
  const loading = useLiveQuery(() => db.jobs.count(), [], null) === null;

  useEffect(() => {
    apiFetch('/api/fortnox/customers')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  async function fetchBackhaul(jobId) {
    setBackhaulData((prev) => ({ ...prev, [jobId]: { loading: true, matches: [], already_paired: false } }));
    try {
      const r = await apiFetch(`/api/backhaul/${jobId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setBackhaulData((prev) => ({ ...prev, [jobId]: { loading: false, ...data } }));
    } catch {
      setBackhaulData((prev) => ({ ...prev, [jobId]: { loading: false, matches: [], already_paired: false } }));
    }
  }

  function toggleReturlast(e, jobId) {
    e.stopPropagation();
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
    } else {
      setExpandedJobId(jobId);
      if (!backhaulData[jobId]) fetchBackhaul(jobId);
    }
  }

  async function handleLink(jobId, quoteId) {
    setLinkingId(quoteId);
    try {
      const r = await apiFetch('/api/backhaul/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, quote_id: quoteId }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      setBackhaulData((prev) => ({
        ...prev,
        [jobId]: { loading: false, matches: [], already_paired: true },
      }));
      setToast({ message: t.backhaul.linked, variant: 'success' });
    } catch (err) {
      setToast({ message: err.message, variant: 'error' });
    } finally {
      setLinkingId(null);
    }
  }

  async function handleReDownload(job) {
    const lineItems = (() => {
      try { return job.line_items ? JSON.parse(job.line_items) : null; }
      catch { return null; }
    })() ?? [{
      desc:   `${t.jobs.invoiceModal.defaultCargo} — ${job.lasttyp || t.jobs.invoiceModal.defaultCargo}`,
      antal:  job.avstand_km || 1,
      unit:   job.avstand_km ? 'km' : 'st',
      apris:  job.totalpris_sek || 0,
      belopp: job.totalpris_sek || 0,
    }];

    const subtotal = job.invoice_subtotal ?? job.totalpris_sek ?? 0;
    const vat      = job.invoice_vat      ?? subtotal * 0.25;
    const total    = job.invoice_total    ?? subtotal + vat;

    const invoice = {
      id:               job.invoice_id,
      job_id:           job.id,
      faktura_nr:       job.invoice_faktura_nr || job.faktura_nr || '—',
      customer_name:    job.customer_name,
      customer_org_nr:  job.customer_org_nr,
      customer_address: job.customer_address,
      customer_email:   job.customer_email,
      line_items:       lineItems,
      subtotal,
      vat,
      total,
      due_date:         job.due_date,
      created_at:       job.created_at,
    };
    try {
      await generateFaktura(invoice, company);
    } catch {
      setToast({ message: t.jobs.invoiceFailed, variant: 'error' });
    }
  }

  function handleSendEmail(job) {
    const fakturaNr = job.invoice_faktura_nr || job.faktura_nr || '—';
    const total     = job.invoice_total != null
      ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(job.invoice_total) + ' kr'
      : '—';
    const due   = job.due_date ? new Date(job.due_date).toLocaleDateString('sv-SE') : '—';
    const email = job.customer_email || '';
    const subject = encodeURIComponent(t.jobs.invoiceModal.emailSubject(fakturaNr, company?.name || 'Åkaren'));
    const body    = encodeURIComponent(
      t.jobs.invoiceModal.emailBody(
        fakturaNr, total, due,
        company?.bankgiro || '—',
        company?.name || '',
        company?.phone || '',
        company?.email || '',
      ),
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  // ── Calendar / date-grouped helpers ────────────────────────────────────────
  function groupByMonth(jobs) {
    const groups = {};
    for (const j of jobs) {
      const d = new Date(String(j.datum || j.created_at || '').replace(' ', 'T'));
      const key = isNaN(d) ? 'Unknown' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(j);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }

  const COLS = [
    { label: '#',              w: '8%'  },
    { label: t.jobs.route,     w: '22%' },
    { label: t.jobs.cargo,     w: '12%' },
    { label: t.jobs.amount,    w: '11%', right: true },
    { label: t.jobs.date,      w: '10%' },
    { label: t.jobs.status,    w: '12%' },
    { label: '',               w: '25%' },
  ];

  const JobTableBody = ({ jobs: jobList }) => jobList.map((job, i) => {
    const isFakturerad = job.status === 'fakturerad';
    const hasInvoice   = Boolean(job.invoice_id);
    const fakturaNr    = job.invoice_faktura_nr || job.faktura_nr;
    const isLast       = i === jobList.length - 1;
    const isExpanded   = expandedJobId === job.id;
    const isSelected   = selectedJob?.id === job.id;
    const jobNr        = `${t.jobs.jobPrefix}-${new Date().getFullYear()}-${String(job.id).padStart(3, '0')}`;

    const cellBorder = (!isLast || isExpanded) ? '1px solid rgba(0,0,0,0.05)' : 'none';

    return (
      <Fragment key={job.id}>
        <tr
          style={{
            background: isSelected
              ? 'rgba(181,101,16,0.06)'
              : isExpanded ? 'rgba(44,95,191,0.04)' : 'transparent',
            cursor: 'pointer',
            transition: 'background 0.1s',
          }}
          onClick={() => setSelectedJob(isSelected ? null : job)}
          onMouseEnter={(e) => { if (!isSelected && !isExpanded) e.currentTarget.style.background = 'rgba(28,26,22,0.025)'; }}
          onMouseLeave={(e) => { if (!isSelected && !isExpanded) e.currentTarget.style.background = 'transparent'; }}
        >
          <td style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 12, padding: '12px 16px', color: TEXT_PR, borderBottom: cellBorder, verticalAlign: 'middle' }}>
            <span style={{ color: AMBER, fontWeight: 600 }}>{jobNr}</span>
          </td>

          <td style={{ fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_PR, borderBottom: cellBorder, verticalAlign: 'middle' }}>
            {job.upphämtning || job.leverans ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{job.upphämtning || '—'}</span>
                  <span style={{ color: TEXT_MU, flexShrink: 0 }}>–</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{job.leverans || '—'}</span>
                </div>
                {job.avstand_km != null && (
                  <div style={{ fontSize: 11, color: TEXT_MU, marginTop: 2 }}>{job.avstand_km} km</div>
                )}
              </div>
            ) : <span style={{ color: TEXT_MU }}>—</span>}
          </td>

          <td style={{ fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_PR, borderBottom: cellBorder, verticalAlign: 'middle', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.lasttyp || '—'}
          </td>

          <td style={{ fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_PR, borderBottom: cellBorder, verticalAlign: 'middle', textAlign: 'right' }}>
            {job.totalpris_sek != null ? (
              <div>
                <div style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 13, fontWeight: 500, color: AMBER }}>{fmtSEK(job.totalpris_sek)}</div>
                <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MU }}>{t.jobs.exclVat}</div>
              </div>
            ) : '—'}
          </td>

          <td style={{ fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_SEC, borderBottom: cellBorder, verticalAlign: 'middle' }}>
            {fmtDate(job.datum || job.created_at)}
          </td>

          <td style={{ fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_PR, borderBottom: cellBorder, verticalAlign: 'middle' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <StatusBadge status={job.status} />
              {fakturaNr && <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU }}>{fakturaNr}</span>}
            </div>
          </td>

          <td style={{ fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_PR, borderBottom: cellBorder, verticalAlign: 'middle' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {!isFakturerad ? (
                <Button variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); setModal(job); }}>
                  <FileText size={13} />
                  {t.jobs.generateInvoice}
                </Button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  {hasInvoice && (
                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleReDownload(job); }}>
                      <Download size={13} />
                      {t.jobs.downloadPdf}
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleSendEmail(job); }}>
                    <Mail size={13} />
                    {t.jobs.sendEmail}
                  </Button>
                </div>
              )}

              <button
                onClick={(e) => toggleReturlast(e, job.id)}
                title={t.backhaul.panelHeading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: INTER, fontSize: 12, fontWeight: 600,
                  padding: '6px 12px', borderRadius: 8,
                  border: `1px solid ${isExpanded ? 'rgba(44,95,191,0.35)' : BORDER}`,
                  background: isExpanded ? 'rgba(44,95,191,0.08)' : 'transparent',
                  color: isExpanded ? CYAN : TEXT_MU,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => { if (!isExpanded) { e.currentTarget.style.background = 'rgba(44,95,191,0.06)'; e.currentTarget.style.color = CYAN; } }}
                onMouseLeave={(e) => { if (!isExpanded) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = TEXT_MU; } }}
              >
                <Truck size={12} />
                {t.backhaul.btnOpen}
                {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            </div>
          </td>
        </tr>

        {isExpanded && (
          <tr key={`${job.id}-bh`}>
            <td colSpan={7} style={{ padding: '0 16px 18px 16px', background: 'rgba(44,95,191,0.03)', borderBottom: isLast ? 'none' : '1px solid rgba(44,95,191,0.12)' }}>
              <div style={{ paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Truck size={13} color={CYAN} />
                  <span style={{ fontFamily: INTER, fontSize: 12, fontWeight: 700, color: TEXT_PR, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {t.backhaul.panelHeading}
                  </span>
                  {job.leverans && (
                    <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU }}>
                      {t.backhaul.panelSub(job.leverans)}
                    </span>
                  )}
                </div>
                <ReturlastPanel
                  jobId={job.id}
                  job={job}
                  data={backhaulData[job.id]}
                  onLink={handleLink}
                  linkingId={linkingId}
                />
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  });

  const TableShell = ({ children, withGroups }) => (
    <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
      {!withGroups && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: 'transparent', borderBottom: `1px solid ${BORDER}` }}>
                {COLS.map((c) => (
                  <th key={c.label} style={{
                    fontFamily: INTER, fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT_MU,
                    padding: '10px 16px', textAlign: c.right ? 'right' : 'left',
                    width: c.w, whiteSpace: 'nowrap',
                  }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
      {withGroups && children}
    </div>
  );

  const grouped = groupByMonth(jobs);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px', background: 'transparent', minHeight: 0 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: INTER, fontSize: 24, fontWeight: 700, color: TEXT_PR, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            {t.jobs.heading}
          </h1>
          <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_SEC, margin: 0 }}>
            {loading ? t.jobs.loading : t.jobs.count(jobs.length)}
          </p>
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', background: BG_BASE, borderRadius: 8, padding: 3, gap: 2, border: `1px solid ${BORDER}` }}>
          {['list', 'calendar'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                fontFamily: INTER, fontSize: 12, fontWeight: 600,
                padding: '6px 14px', borderRadius: 6, border: 'none',
                background: viewMode === mode ? WHITE : 'transparent',
                color: viewMode === mode ? TEXT_PR : MUTED,
                cursor: 'pointer',
                boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {mode === 'list' ? t.jobs.viewList : t.jobs.viewCalendar}
            </button>
          ))}
        </div>
      </div>

      {/* Status pipeline */}
      {!loading && jobs.length > 0 && <StatusPipeline jobs={jobs} t={t} />}

      {/* List view */}
      {viewMode === 'list' && (
        <TableShell>
          {loading && (
            <tr>
              <td colSpan={7} style={{ fontFamily: INTER, fontSize: 13, textAlign: 'center', color: TEXT_MU, fontStyle: 'italic', padding: 40 }}>
                {t.jobs.loading}
              </td>
            </tr>
          )}
          {!loading && jobs.length === 0 && (
            <tr>
              <td colSpan={7} style={{ fontFamily: INTER, fontSize: 13, textAlign: 'center', color: TEXT_MU, fontStyle: 'italic', padding: 40 }}>
                {t.jobs.noJobs}
              </td>
            </tr>
          )}
          {!loading && <JobTableBody jobs={jobs} />}
        </TableShell>
      )}

      {/* Calendar (date-grouped) view */}
      {viewMode === 'calendar' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {jobs.length === 0 && (
            <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: 'center', fontFamily: INTER, fontSize: 13, color: TEXT_MU, fontStyle: 'italic' }}>
              {t.jobs.noJobs}
            </div>
          )}
          {grouped.map(([monthKey, monthJobs]) => {
            const d = monthKey !== 'Unknown' ? new Date(monthKey + '-01') : null;
            const label = d ? new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(d) : monthKey;
            const monthRevenue = monthJobs.reduce((s, j) => s + (j.totalpris_sek ?? 0), 0);
            return (
              <div key={monthKey}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 700, color: TEXT_PR, textTransform: 'capitalize' }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: INTER, fontSize: 11, color: MUTED }}>
                    {monthJobs.length} {t.jobs.count(monthJobs.length).replace(/^\d+ /, '')}
                  </span>
                  {monthRevenue > 0 && (
                    <span style={{ fontFamily: INTER, fontFeatureSettings: '"tnum"', fontSize: 12, fontWeight: 600, color: AMBER, marginLeft: 'auto' }}>
                      {fmtSEK(monthRevenue)}
                    </span>
                  )}
                </div>
                <div style={{ background: SURF, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                          {COLS.map((c) => (
                            <th key={c.label} style={{
                              fontFamily: INTER, fontSize: 11, fontWeight: 700,
                              letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT_MU,
                              padding: '9px 16px', textAlign: c.right ? 'right' : 'left',
                              width: c.w, whiteSpace: 'nowrap',
                            }}>{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <JobTableBody jobs={monthJobs} />
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontFamily: OUTFIT, fontSize: 12, color: FAINT, marginTop: 12 }}>
        {t.jobs.emailNote}
      </div>

      {modal && (
        <InvoiceModal
          job={modal}
          customers={customers}
          onClose={() => setModal(null)}
          onSuccess={(invoice) => {
            setModal(null);
            setToast({ message: t.jobs.invoiceCreated(invoice.faktura_nr), variant: 'success' });
          }}
        />
      )}

      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          t={t}
          onClose={() => setSelectedJob(null)}
          onInvoice={(job) => setModal(job)}
          onDownload={handleReDownload}
          onEmail={handleSendEmail}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </div>
  );
}
