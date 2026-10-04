import { useEffect, useState } from 'react';
import { Eye, Send } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { Field, TextField } from '../components/Field.jsx';
import { ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useForm } from '../lib/useForm.js';
import { useToast } from '../lib/toast.js';
import { MAIL_STATUS, confirmationToast, formatDateTime } from '../lib/labels.js';

/** The rendered email, isolated from the app: no scripts, no styles leaking either way. */
function EmailFrame({ html, title }) {
  return (
    <iframe
      title={title}
      sandbox=""
      srcDoc={html}
      style={{ width: '100%', height: 460, border: '1px solid var(--border)', borderRadius: 10, background: '#f4f5f7' }}
    />
  );
}

function ComposeDialog({ open, job, info, onClose, onSent }) {
  const toast = useToast();
  const form = useForm({ to: '', cc: '', message: '', office_copy: true });
  const { reset, values } = form;
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  useEffect(() => {
    if (open) reset({ to: info.default_to ?? '', cc: '', message: '', office_copy: true });
  }, [open, info.default_to, reset]);

  // Re-render the preview as the personal message changes.
  useEffect(() => {
    if (!open) return undefined;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api(`/api/jobs/${job.id}/order-confirmation/preview`, { method: 'POST', body: { message: values.message || null }, signal: ctrl.signal })
        .then((p) => { setPreview(p); setPreviewError(null); })
        .catch((err) => { if (err.name !== 'AbortError') setPreviewError(err); });
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [open, job.id, values.message]);

  async function send(e) {
    e?.preventDefault();
    try {
      const sent = await form.submit((v) => api(`/api/jobs/${job.id}/order-confirmation`, {
        method: 'POST',
        body: { to: v.to, cc: v.cc || null, message: v.message || null, office_copy: v.office_copy },
      }));
      toast(...confirmationToast(sent));
      onSent();
    } catch { /* shown in the form */ }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="Skicka orderbekräftelse"
      description="Kunden får uppdragets uppgifter och ombeds höra av sig om något inte stämmer. Svar går till er e-post."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Avbryt</Button>
          <Button onClick={send} loading={form.busy} disabled={!values.to.trim()}>
            <Send size={14} /> {info.mail_enabled ? 'Skicka' : 'Spara (simulerat)'}
          </Button>
        </>
      )}
    >
      <form onSubmit={send} style={{ display: 'grid', gap: 14 }}>
        {!info.mail_enabled && (
          <div className="notice notice-blue">
            E-post är inte inställt på servern (SMTP_HOST och MAIL_FROM i server/.env). Mejlet sparas och visas här, men skickas inte.
          </div>
        )}
        <div className="form-grid">
          <TextField label="Till *" type="email" autoComplete="off" {...form.field('to')} />
          <TextField label="Kopia" type="email" autoComplete="off" hint="Valfritt, t.ex. platschefen" {...form.field('cc')} />
          <Field label="Personligt meddelande" className="span-2" hint="Valfritt. Visas överst i mejlet." error={form.errors.message}>
            {(id) => (
              <textarea id={id} className="input" rows={2} maxLength={1000} value={values.message}
                placeholder="T.ex. Vi kommer med två bilar, första på plats 06.45."
                onChange={(e) => form.field('message').onChange(e.target.value)} />
            )}
          </Field>
          {info.office_email && (
            <label className="checkbox span-2" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={values.office_copy} onChange={(e) => form.field('office_copy').onChange(e.target.checked)} />
              <span>Dold kopia till kontoret ({info.office_email})</span>
            </label>
          )}
        </div>
        {form.formError && <div className="notice notice-red">{form.formError}</div>}
        <div>
          <div className="t-label" style={{ marginBottom: 6 }}>Förhandsgranskning</div>
          <ErrorNotice error={previewError} />
          {preview ? (
            <>
              <div style={{ fontSize: 13, marginBottom: 8 }}><span className="t-muted">Ämne:</span> {preview.subject}</div>
              <EmailFrame html={preview.html} title="Förhandsgranskning av orderbekräftelsen" />
            </>
          ) : !previewError && <TableSkeleton rows={4} />}
        </div>
      </form>
    </Dialog>
  );
}

function ViewDialog({ jobId, confirmationId, onClose }) {
  const { data, error } = useApi(confirmationId ? `/api/jobs/${jobId}/order-confirmation/${confirmationId}` : null);
  const status = data && MAIL_STATUS[data.status];
  return (
    <Dialog open={confirmationId != null} onClose={onClose} wide title="Orderbekräftelse"
      footer={<Button variant="secondary" onClick={onClose}>Stäng</Button>}>
      <ErrorNotice error={error} />
      {!data ? !error && <TableSkeleton rows={4} /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <div><span className="t-muted">Till:</span> {data.to_email}{data.cc_email && <> · <span className="t-muted">Kopia:</span> {data.cc_email}</>}{data.bcc_email && <> · <span className="t-muted">Dold kopia:</span> {data.bcc_email}</>}</div>
            <div><span className="t-muted">Ämne:</span> {data.subject}</div>
            <div><span className={`badge ${status.badge}`}>{status.label}</span> <span className="t-muted">{formatDateTime(data.created_at)}</span></div>
            {data.error_message && <div className="notice notice-red">{data.error_message}</div>}
          </div>
          <EmailFrame html={data.body_html} title="Skickad orderbekräftelse" />
        </div>
      )}
    </Dialog>
  );
}

/** Job page: what was confirmed to the customer, when, and a way to send (again). */
export function OrderConfirmationPanel({ job }) {
  const { data, error, reload } = useApi(`/api/jobs/${job.id}/order-confirmation`);
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState(null);
  const latest = data?.history[0];
  const latestStatus = latest && MAIL_STATUS[latest.status];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="t-heading">Orderbekräftelse</h2>
        {latestStatus ? <span className={`badge ${latestStatus.badge}`}>{latestStatus.label}</span>
          : data && <span className="badge badge-muted">Inte skickad</span>}
      </div>
      <ErrorNotice error={error} onRetry={reload} />
      <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
        {!data ? !error && <TableSkeleton rows={2} /> : (
          <>
            {data.history.length === 0 ? (
              <p className="t-muted" style={{ fontSize: 13 }}>
                Kunden har inte fått någon orderbekräftelse för det här uppdraget.
              </p>
            ) : (
              <div style={{ display: 'grid' }}>
                {data.history.map((h, i) => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.to_email}{h.cc_email && <span className="t-muted"> + {h.cc_email}</span>}
                      </div>
                      <div className="t-muted" style={{ fontSize: 12 }}>
                        {MAIL_STATUS[h.status].label} {formatDateTime(h.created_at)}{h.sent_by_name ? ` av ${h.sent_by_name}` : ''}
                      </div>
                      {h.error_message && <div className="field-error">{h.error_message}</div>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setViewing(h.id)}><Eye size={13} /> Visa</Button>
                  </div>
                ))}
              </div>
            )}
            {data.can_send ? (
              <div>
                <Button size="sm" variant={data.history.length ? 'secondary' : 'primary'} onClick={() => setComposing(true)}>
                  <Send size={13} /> {data.history.length ? 'Skicka igen' : 'Skicka orderbekräftelse'}
                </Button>
              </div>
            ) : (
              <p className="t-muted" style={{ fontSize: 13 }}>Uppdraget är avbrutet.</p>
            )}
          </>
        )}
      </div>
      {data && (
        <ComposeDialog open={composing} job={job} info={data} onClose={() => setComposing(false)}
          onSent={() => { setComposing(false); reload(); }} />
      )}
      <ViewDialog jobId={job.id} confirmationId={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
