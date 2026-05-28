import { useState, useEffect, Fragment } from 'react';
import { Download, Mail, FileText, Truck, ChevronDown, ChevronUp } from 'lucide-react';
import { useLiveQuery }    from 'dexie-react-hooks';
import { useAuth }         from '../context/AuthContext.jsx';
import { useLanguage }     from '../context/LanguageContext.jsx';
import { generateFaktura } from '../utils/generateFaktura.js';
import { apiFetch }        from '../utils/apiFetch.js';
import { Toast }           from '../components/Toast.jsx';
import { db }              from '../db/dexie.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const AMBER   = '#B56510';
const AMBER_DK= '#9A6410';
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
const INTER   = "'Plus Jakarta Sans', system-ui, sans-serif";
const MONO    = "'Plus Jakarta Sans', system-ui, sans-serif";
// Legacy aliases
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

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const { t } = useLanguage();
  const colors = {
    planerad:   { color: WARNING_C, bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
    aktiv:      { color: SUCCESS,   bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
    fakturerad: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)' },
  };
  const s = colors[status] ?? colors.planerad;
  const label = t.jobs.statuses[status] ?? status;
  return (
    <span style={{
      fontFamily: INTER, fontSize: 11, letterSpacing: '0.02em', fontWeight: 600,
      textTransform: 'uppercase', color: s.color, background: s.bg,
      border: `1px solid ${s.border}`,
      padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
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
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: AMBER, marginTop: 2 }}>{fmtSEK(match.totalpris_sek)}</div>
        </div>
        <div>
          <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEXT_MU }}>{bh.emptyKmSaved(match.empty_km_eliminated)}</div>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: SUCCESS, marginTop: 2 }}>{bh.savedSek(match.saved_sek)}</div>
        </div>
        <div>
          <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEXT_MU }}>{bh.combinedRevenue}</div>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TEXT_PR, marginTop: 2 }}>{fmtSEK(match.combined_revenue)}</div>
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

// ── Returlast expansion panel ─────────────────────────────────────────────────
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
          background: '#FAF9F7',
          border: '1px solid rgba(28,26,22,0.09)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(28,26,22,0.14)', padding: 28, width: 460,
        }}
      >
        <div style={{ fontFamily: INTER, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT_MU, fontWeight: 700, marginBottom: 6 }}>
          {t.jobs.invoiceModal.heading}
        </div>
        <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 600, color: TEXT_PR, marginBottom: 4 }}>
          {job.lasttyp || 'Transport'}
        </div>
        {(job.upphämtning || job.leverans) && (
          <div style={{ fontFamily: INTER, fontSize: 13, color: TEXT_SEC, marginBottom: 20 }}>
            {[job.upphämtning, job.leverans].filter(Boolean).join(' – ')}
            {job.totalpris_sek != null && (
              <span style={{ color: AMBER, marginLeft: 10, fontWeight: 600 }}>{fmtSEK(job.totalpris_sek)} {t.jobs.exclVat}</span>
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
            placeholder="Företagsnamn AB"
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
          <textarea rows={3} value={form.customer_address} onChange={(e) => setForm((f) => ({ ...f, customer_address: e.target.value }))} placeholder={'Gatuadress\nPostnummer Ort'} style={{ ...inputStyle, resize: 'none' }} />
        </div>

        {err && <div style={{ fontFamily: INTER, fontSize: 12, color: DANGER, marginBottom: 14 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{
              fontFamily: INTER, fontSize: 13, fontWeight: 500, padding: '9px 18px',
              border: '1px solid rgba(94,234,212,0.25)', borderRadius: 10, background: 'transparent',
              color: CYAN, cursor: 'pointer',
            }}>
            {t.jobs.invoiceModal.cancel}
          </button>
          <button type="submit" disabled={busy || !form.customer_name.trim()}
            style={{
              fontFamily: INTER, fontSize: 13, fontWeight: 600, padding: '9px 20px',
              border: 'none', borderRadius: 10,
              background: busy || !form.customer_name.trim() ? 'rgba(28,26,22,0.06)' : '#1C1A17',
              color: busy || !form.customer_name.trim() ? TEXT_MU : '#FAF9F7',
              cursor: busy || !form.customer_name.trim() ? 'not-allowed' : 'pointer',
              boxShadow: 'none',
            }}>
            {busy ? t.jobs.invoiceModal.generating : t.jobs.invoiceModal.generate}
          </button>
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

  function toggleReturlast(jobId) {
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
      desc:   `Transport — ${job.lasttyp || 'Frakt'}`,
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
    const subject = encodeURIComponent(`Faktura ${fakturaNr} — ${company?.name || 'Åkaren'}`);
    const body    = encodeURIComponent(
      `Hej,\n\nTack för ert uppdrag!\n\nBifogat finner ni faktura ${fakturaNr}.\n\n` +
      `Belopp att betala: ${total} (inkl. 25% moms)\n` +
      `Förfallodatum: ${due}\n` +
      `OCR-nummer: ${fakturaNr}\n` +
      `Bankgiro: ${company?.bankgiro || '—'}\n\n` +
      `OBS: Bifoga den nedladdade PDF-filen till detta meddelande innan du skickar.\n\n` +
      `Med vänliga hälsningar,\n${company?.name || ''}\n${company?.phone || ''}\n${company?.email || ''}`,
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
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

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px', background: 'transparent', minHeight: 0 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: INTER, fontSize: 24, fontWeight: 700, color: TEXT_PR, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            {t.jobs.heading}
          </h1>
          <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_SEC, margin: 0 }}>
            {loading ? t.jobs.loading : t.jobs.count(jobs.length)}
          </p>
        </div>
      </div>

      <div style={{
        background: SURF,
        border: `1px solid `,
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: 'transparent', borderBottom: `1px solid ` }}>
                {COLS.map((c) => (
                  <th key={c.label} style={{
                    fontFamily: INTER, fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase', color: TEXT_MU,
                    padding: '10px 16px', textAlign: c.right ? 'right' : 'left',
                    width: c.w, whiteSpace: 'nowrap',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{
                    fontFamily: INTER, fontSize: 13, textAlign: 'center',
                    color: TEXT_MU, fontStyle: 'italic', padding: 40,
                  }}>
                    {t.jobs.loading}
                  </td>
                </tr>
              )}
              {!loading && jobs.length === 0 && (
                <tr>
                  <td colSpan={7} style={{
                    fontFamily: INTER, fontSize: 13, textAlign: 'center',
                    color: TEXT_MU, fontStyle: 'italic', padding: 40,
                  }}>
                    {t.jobs.noJobs}
                  </td>
                </tr>
              )}
              {!loading && jobs.map((job, i) => {
                const isFakturerad = job.status === 'fakturerad';
                const hasInvoice   = Boolean(job.invoice_id);
                const fakturaNr    = job.invoice_faktura_nr || job.faktura_nr;
                const isLast       = i === jobs.length - 1;
                const isExpanded   = expandedJobId === job.id;
                const jobNr        = `JOB-${new Date().getFullYear()}-${String(job.id).padStart(3, '0')}`;

                return (
                  <Fragment key={job.id}>
                    <tr
                      style={{ background: isExpanded ? 'rgba(44,95,191,0.04)' : 'transparent' }}
                      onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = 'rgba(28,26,22,0.025)'; }}
                      onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{
                        fontFamily: MONO, fontSize: 12, padding: '12px 16px', color: TEXT_PR,
                        borderBottom: (!isLast || isExpanded) ? '1px solid rgba(255,255,255,0.05)' : 'none', verticalAlign: 'middle',
                      }}>
                        <span style={{ color: AMBER, fontWeight: 600 }}>{jobNr}</span>
                      </td>

                      <td style={{
                        fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_PR,
                        borderBottom: (!isLast || isExpanded) ? '1px solid rgba(255,255,255,0.05)' : 'none', verticalAlign: 'middle',
                      }}>
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

                      <td style={{
                        fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_PR,
                        borderBottom: (!isLast || isExpanded) ? '1px solid rgba(255,255,255,0.05)' : 'none', verticalAlign: 'middle',
                        maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {job.lasttyp || '—'}
                      </td>

                      <td style={{
                        fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_PR,
                        borderBottom: (!isLast || isExpanded) ? '1px solid rgba(255,255,255,0.05)' : 'none', verticalAlign: 'middle',
                        textAlign: 'right',
                      }}>
                        {job.totalpris_sek != null ? (
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500, color: AMBER }}>{fmtSEK(job.totalpris_sek)}</div>
                            <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MU }}>{t.jobs.exclVat}</div>
                          </div>
                        ) : '—'}
                      </td>

                      <td style={{
                        fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_SEC,
                        borderBottom: (!isLast || isExpanded) ? '1px solid rgba(255,255,255,0.05)' : 'none', verticalAlign: 'middle',
                      }}>
                        {fmtDate(job.created_at)}
                      </td>

                      <td style={{
                        fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_PR,
                        borderBottom: (!isLast || isExpanded) ? '1px solid rgba(255,255,255,0.05)' : 'none', verticalAlign: 'middle',
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <StatusBadge status={job.status} />
                          {fakturaNr && <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU }}>{fakturaNr}</span>}
                        </div>
                      </td>

                      <td style={{
                        fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT_PR,
                        borderBottom: (!isLast || isExpanded) ? '1px solid rgba(255,255,255,0.05)' : 'none', verticalAlign: 'middle',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {!isFakturerad ? (
                            <button
                              onClick={() => setModal(job)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
                                padding: '7px 14px', borderRadius: 8,
                                border: 'none', background: '#1C1A17', color: '#FAF9F7',
                                cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#343230'}
                              onMouseLeave={(e) => e.currentTarget.style.background = '#1C1A17'}
                            >
                              <FileText size={13} />
                              {t.jobs.generateInvoice}
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              {hasInvoice && (
                                <button
                                  onClick={() => handleReDownload(job)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
                                    padding: '6px 12px', borderRadius: 8,
                                    border: `1px solid ${BORDER}`, background: WHITE,
                                    color: TEXT, cursor: 'pointer', whiteSpace: 'nowrap',
                                  }}
                                >
                                  <Download size={13} />
                                  {t.jobs.downloadPdf}
                                </button>
                              )}
                              <button
                                onClick={() => handleSendEmail(job)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  fontFamily: OUTFIT, fontSize: 13, fontWeight: 600,
                                  padding: '6px 12px', borderRadius: 8,
                                  border: `1px solid ${BORDER}`, background: SURF,
                                  color: TEXT_PR, cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                              >
                                <Mail size={13} />
                                {t.jobs.sendEmail}
                              </button>
                            </div>
                          )}

                          {/* Returlast toggle button */}
                          <button
                            onClick={() => toggleReturlast(job.id)}
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

                    {/* ── Returlast expansion row ─────────────────────────── */}
                    {isExpanded && (
                      <tr key={`${job.id}-bh`}>
                        <td colSpan={7} style={{
                          padding: '0 16px 18px 16px',
                          background: 'rgba(44,95,191,0.03)',
                          borderBottom: isLast ? 'none' : '1px solid rgba(44,95,191,0.12)',
                        }}>
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
              })}
            </tbody>
          </table>
        </div>
      </div>

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

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </div>
  );
}
