import { useState, useEffect } from 'react';
import { Download, Mail, FileText } from 'lucide-react';
import { useLiveQuery }    from 'dexie-react-hooks';
import { useAuth }         from '../context/AuthContext.jsx';
import { generateFaktura } from '../utils/generateFaktura.js';
import { apiFetch }        from '../utils/apiFetch.js';
import { Toast }           from '../components/Toast.jsx';
import { db }              from '../db/dexie.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BLUE    = '#4361ee';
const BLUE_DK = '#3451d1';
const BG      = '#f0f2f5';
const WHITE   = '#ffffff';
const BORDER  = '#e9ecef';
const TEXT    = '#1a1a2e';
const MUTED   = '#6c757d';
const FAINT   = '#9ca3af';
const INTER   = "'Inter', sans-serif";
const SURF    = '#f8f9fa';

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
  const map = {
    planerad:   { label: 'Planerad',   color: '#d97706', bg: '#fff7ed' },
    aktiv:      { label: 'Aktiv',      color: '#15803d', bg: '#f0fdf4' },
    fakturerad: { label: 'Fakturerad', color: '#3b82f6', bg: '#eff6ff' },
  };
  const s = map[status] ?? map.planerad;
  return (
    <span style={{
      fontFamily: INTER, fontSize: 11, letterSpacing: '0.02em', fontWeight: 600,
      textTransform: 'uppercase', color: s.color, background: s.bg,
      padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

// ── Invoice modal ─────────────────────────────────────────────────────────────
function InvoiceModal({ job, customers, onClose, onSuccess }) {
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
    width: '100%', fontFamily: INTER, fontSize: 13, color: TEXT,
    border: '1.5px solid #e9ecef', borderRadius: 8, padding: '9px 14px',
    outline: 'none', boxSizing: 'border-box', background: WHITE,
  };
  const labelStyle = {
    fontFamily: INTER, fontSize: 11, letterSpacing: '0.04em',
    textTransform: 'uppercase', color: FAINT, fontWeight: 600,
    display: 'block', marginBottom: 5,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(26,26,46,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: WHITE, border: '1px solid #e9ecef', borderRadius: 12,
          boxShadow: '0 8px 40px rgba(0,0,0,0.13)', padding: 28, width: 460,
        }}
      >
        <div style={{ fontFamily: INTER, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: FAINT, fontWeight: 600, marginBottom: 6 }}>
          Generera Faktura / Generate Invoice
        </div>
        <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
          {job.lasttyp || 'Transport'}
        </div>
        {(job.upphämtning || job.leverans) && (
          <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, marginBottom: 20 }}>
            {[job.upphämtning, job.leverans].filter(Boolean).join(' → ')}
            {job.totalpris_sek != null && (
              <span style={{ color: BLUE, marginLeft: 10, fontWeight: 600 }}>{fmtSEK(job.totalpris_sek)} exkl. moms</span>
            )}
          </div>
        )}

        {customers.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Välj kund (Fortnox) / Select customer</label>
            <select value={selectedCustId} onChange={(e) => pickCustomer(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">— Välj eller fyll i manuellt —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.org_nr ? `(${c.org_nr})` : ''}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Kundnamn *</label>
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
            <label style={labelStyle}>Org.nr</label>
            <input value={form.customer_org_nr} onChange={(e) => setForm((f) => ({ ...f, customer_org_nr: e.target.value }))} placeholder="556xxx-xxxx" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>E-post</label>
            <input type="email" value={form.customer_email} onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))} placeholder="faktura@kund.se" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Fakturaadress</label>
          <textarea rows={3} value={form.customer_address} onChange={(e) => setForm((f) => ({ ...f, customer_address: e.target.value }))} placeholder={'Gatuadress\nPostnummer Ort'} style={{ ...inputStyle, resize: 'none' }} />
        </div>

        {err && <div style={{ fontFamily: INTER, fontSize: 12, color: '#e74c3c', marginBottom: 14 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{
              fontFamily: INTER, fontSize: 13, fontWeight: 600, padding: '9px 18px',
              border: '1.5px solid #e9ecef', borderRadius: 8, background: WHITE,
              color: '#374151', cursor: 'pointer',
            }}>
            Avbryt
          </button>
          <button type="submit" disabled={busy || !form.customer_name.trim()}
            style={{
              fontFamily: INTER, fontSize: 13, fontWeight: 600, padding: '9px 20px',
              border: 'none', borderRadius: 8,
              background: busy || !form.customer_name.trim() ? '#d1d5db' : BLUE,
              color: busy || !form.customer_name.trim() ? MUTED : WHITE,
              cursor: busy || !form.customer_name.trim() ? 'not-allowed' : 'pointer',
            }}>
            {busy ? 'Genererar…' : 'Generera & ladda ned PDF'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Jobs page ─────────────────────────────────────────────────────────────────
export function Jobs() {
  const { company } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [modal,     setModal]     = useState(null);
  const [toast,     setToast]     = useState(null);

  const jobs    = useLiveQuery(() => db.jobs.orderBy('created_at').reverse().toArray(), [], null) ?? [];
  const loading = useLiveQuery(() => db.jobs.count(), [], null) === null;

  useEffect(() => {
    apiFetch('/api/fortnox/customers')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

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
      setToast({ message: 'Kunde inte generera PDF', variant: 'error' });
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
    { label: '#',               w: '8%'  },
    { label: 'Rutt / Route',    w: '25%' },
    { label: 'Last / Cargo',    w: '14%' },
    { label: 'Belopp / Amount', w: '12%', right: true },
    { label: 'Datum / Date',    w: '11%' },
    { label: 'Status',          w: '14%' },
    { label: '',                w: '16%' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 48px', background: BG, minHeight: 0 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: INTER, fontSize: 20, fontWeight: 700, color: TEXT, margin: '0 0 4px' }}>
            Jobs / Uppdrag
          </h1>
          <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: 0 }}>
            {loading ? 'Laddar…' : `${jobs.length} uppdrag`}
          </p>
        </div>
      </div>

      <div style={{
        background: WHITE, border: '1px solid #e9ecef', borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: SURF }}>
                {COLS.map((c) => (
                  <th key={c.label} style={{
                    fontFamily: INTER, fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED,
                    padding: '10px 16px', textAlign: c.right ? 'right' : 'left',
                    width: c.w, whiteSpace: 'nowrap',
                    borderBottom: '1px solid #e9ecef',
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
                    color: MUTED, fontStyle: 'italic', padding: 40,
                  }}>
                    Laddar uppdrag…
                  </td>
                </tr>
              )}
              {!loading && jobs.length === 0 && (
                <tr>
                  <td colSpan={7} style={{
                    fontFamily: INTER, fontSize: 13, textAlign: 'center',
                    color: MUTED, fontStyle: 'italic', padding: 40,
                  }}>
                    Inga uppdrag ännu — skapa en offert för att börja / No jobs yet — create a quote to start
                  </td>
                </tr>
              )}
              {!loading && jobs.map((job, i) => {
                const isFakturerad = job.status === 'fakturerad';
                const hasInvoice   = Boolean(job.invoice_id);
                const fakturaNr    = job.invoice_faktura_nr || job.faktura_nr;
                const isLast       = i === jobs.length - 1;
                const jobNr        = `JOB-${new Date().getFullYear()}-${String(job.id).padStart(3, '0')}`;

                return (
                  <tr
                    key={job.id}
                    style={{ background: WHITE }}
                    onMouseEnter={(e) => e.currentTarget.style.background = SURF}
                    onMouseLeave={(e) => e.currentTarget.style.background = WHITE}
                  >
                    <td style={{
                      fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT,
                      borderBottom: isLast ? 'none' : '1px solid #f0f2f5', verticalAlign: 'middle',
                    }}>
                      <span style={{ fontSize: 12, color: BLUE, fontWeight: 600 }}>{jobNr}</span>
                    </td>

                    <td style={{
                      fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT,
                      borderBottom: isLast ? 'none' : '1px solid #f0f2f5', verticalAlign: 'middle',
                    }}>
                      {job.upphämtning || job.leverans ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{job.upphämtning || '—'}</span>
                            <span style={{ color: FAINT, flexShrink: 0 }}>→</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{job.leverans || '—'}</span>
                          </div>
                          {job.avstand_km != null && (
                            <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{job.avstand_km} km</div>
                          )}
                        </div>
                      ) : <span style={{ color: FAINT }}>—</span>}
                    </td>

                    <td style={{
                      fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT,
                      borderBottom: isLast ? 'none' : '1px solid #f0f2f5', verticalAlign: 'middle',
                      maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {job.lasttyp || '—'}
                    </td>

                    <td style={{
                      fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT,
                      borderBottom: isLast ? 'none' : '1px solid #f0f2f5', verticalAlign: 'middle',
                      textAlign: 'right',
                    }}>
                      {job.totalpris_sek != null ? (
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtSEK(job.totalpris_sek)}</div>
                          <div style={{ fontSize: 11, color: FAINT }}>exkl. moms</div>
                        </div>
                      ) : '—'}
                    </td>

                    <td style={{
                      fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: MUTED,
                      borderBottom: isLast ? 'none' : '1px solid #f0f2f5', verticalAlign: 'middle',
                    }}>
                      {fmtDate(job.created_at)}
                    </td>

                    <td style={{
                      fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT,
                      borderBottom: isLast ? 'none' : '1px solid #f0f2f5', verticalAlign: 'middle',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <StatusBadge status={job.status} />
                        {fakturaNr && <span style={{ fontFamily: INTER, fontSize: 11, color: FAINT }}>{fakturaNr}</span>}
                      </div>
                    </td>

                    <td style={{
                      fontFamily: INTER, fontSize: 13, padding: '12px 16px', color: TEXT,
                      borderBottom: isLast ? 'none' : '1px solid #f0f2f5', verticalAlign: 'middle',
                    }}>
                      {!isFakturerad ? (
                        <button
                          onClick={() => setModal(job)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontFamily: INTER, fontSize: 13, fontWeight: 600,
                            padding: '7px 14px', borderRadius: 8,
                            border: 'none', background: BLUE, color: WHITE,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = BLUE_DK}
                          onMouseLeave={(e) => e.currentTarget.style.background = BLUE}
                        >
                          <FileText size={13} />
                          Generera Faktura
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {hasInvoice && (
                            <button
                              onClick={() => handleReDownload(job)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontFamily: INTER, fontSize: 13, fontWeight: 600,
                                padding: '6px 12px', borderRadius: 8,
                                border: '1.5px solid #e9ecef', background: WHITE,
                                color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              <Download size={13} />
                              Ladda ned PDF
                            </button>
                          )}
                          <button
                            onClick={() => handleSendEmail(job)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              fontFamily: INTER, fontSize: 13, fontWeight: 600,
                              padding: '6px 12px', borderRadius: 8,
                              border: '1.5px solid #e9ecef', background: WHITE,
                              color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            <Mail size={13} />
                            Skicka via e-post
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontFamily: INTER, fontSize: 12, color: FAINT, marginTop: 12 }}>
        * E-postknappen öppnar din e-postklient med ett förberett meddelande. Bifoga den nedladdade PDF-filen manuellt.
      </div>

      {modal && (
        <InvoiceModal
          job={modal}
          customers={customers}
          onClose={() => setModal(null)}
          onSuccess={(invoice) => {
            setModal(null);
            setToast({ message: `Faktura ${invoice.faktura_nr} genererad / Invoice ${invoice.faktura_nr} generated`, variant: 'success' });
          }}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </div>
  );
}
