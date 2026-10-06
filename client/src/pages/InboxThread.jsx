import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, ArrowRight, Briefcase, Check, CircleCheck, Eye, FileText, Filter, Inbox as InboxIcon, RotateCcw,
  Send, Sparkles, TriangleAlert, X,
} from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { Link } from '../components/Link.jsx';
import { ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { navigate, useLocation } from '../lib/router.js';
import { useToast } from '../lib/toast.js';
import {
  CATEGORY_SOURCE, DECLINE_REASON, INBOX_CATEGORY, INBOX_STATUS, MAIL_STATUS, MANGD_ENHETER, REPLY_TEMPLATE, UPPDRAGSTYPER,
  formatBytes, formatDate, formatMailTime, formatPhone,
} from '../lib/labels.js';

const FIELD_NAMES = { datum: 'datum', tid: 'starttid', adress: 'adress', material: 'material', fran: 'hämtplats', till: 'mottagning', telefon: 'telefon' };
const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#c2410c', '#db2777', '#4f46e5', '#0d9488'];
const CONF_RANK = { saknas: 0, lag: 1, medel: 2, hog: 3 };

function avatarColor(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name, email) {
  const src = (name || email.split('@')[0]).replace(/[^\p{L}\s.]/gu, ' ').trim();
  const parts = src.split(/[\s.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Own text and quoted history ("Den … skrev …:" and "> " lines) of an email body. */
function splitQuote(body) {
  const lines = String(body ?? '').split('\n');
  const i = lines.findIndex((l, n) => l.startsWith('>') || (/^Den .+ skrev .+:$/.test(l) && lines[n + 1]?.startsWith('>')));
  if (i < 0) return { own: body.trim(), quote: null };
  return { own: lines.slice(0, i).join('\n').trim(), quote: lines.slice(i).join('\n') };
}

const lowest = (...fs) => fs.filter(Boolean).reduce((a, f) => (CONF_RANK[f.confidence] < CONF_RANK[a] ? f.confidence : a), 'hog');

// ── The AI's reading ───────────────────────────────────────────────────────

function Fact({ label, conf, children, chip }) {
  if (children == null || children === '') return null;
  return (
    <div>
      <div className="fact-label">
        {conf && <span className={`conf-dot ${conf}`} title={conf === 'hog' ? 'Står tydligt i mejlet' : conf === 'medel' ? 'Tolkat, t.ex. ett relativt datum' : 'Osäkert, kontrollera'} />}
        {label}
      </div>
      <div className="fact-value">{children}</div>
      {chip}
    </div>
  );
}

function Facts({ f, match }) {
  const v = (k) => f[k]?.value ?? null;
  const when = v('datum') && `${formatDate(v('datum'))}${v('datum_till') && v('datum_till') !== v('datum') ? ` – ${formatDate(v('datum_till'))}` : ''}${v('tid') ? ` kl ${v('tid')}` : ''}`;
  const qty = [
    v('antal_lass') != null && `${v('antal_lass')} lass`,
    v('uppskattad_mangd') != null && `ca ${new Intl.NumberFormat('sv-SE').format(v('uppskattad_mangd'))} ${MANGD_ENHETER[v('mangd_enhet')] ?? ''}`.trim(),
  ].filter(Boolean).join(' · ');
  const site = [v('adress'), v('ort')].filter(Boolean).join(', ');
  const contact = [v('kontaktperson'), formatPhone(v('telefon')) || v('telefon')].filter(Boolean).join(', ');
  return (
    <div className="facts">
      <Fact label="Kund" conf={match ? 'hog' : lowest(f.kund)}
        chip={match
          ? <span className="match-chip" title={match.reasons.join(', ')}><CircleCheck size={12} /> Befintlig kund</span>
          : <span className="match-chip new">Ny kund</span>}>
        {match?.customer.name ?? v('kund') ?? '–'}
      </Fact>
      <Fact label="Projekt / plats" conf={match?.project ? 'hog' : lowest(f.projekt, f.adress)}
        chip={match?.project && <span className="match-chip"><CircleCheck size={12} /> Befintligt projekt</span>}>
        {match?.project?.name ?? v('projekt') ?? site}
        {!match?.project && v('projekt') && site && <div className="t-muted" style={{ fontSize: 12.5 }}>{site}</div>}
      </Fact>
      <Fact label="Uppdrag" conf={lowest(f.uppdragstyp)}>{UPPDRAGSTYPER[v('uppdragstyp')]}</Fact>
      <Fact label="När" conf={lowest(f.datum, f.tid)}>{when}</Fact>
      <Fact label="Material" conf={lowest(f.material)}>{v('material')}</Fact>
      <Fact label="Mängd" conf={lowest(f.antal_lass?.value != null ? f.antal_lass : null, f.uppskattad_mangd?.value != null ? f.uppskattad_mangd : null)}>{qty}</Fact>
      <Fact label="Från" conf={lowest(f.fran)}>{v('fran')}</Fact>
      <Fact label="Till" conf={lowest(f.till)}>{v('till')}</Fact>
      <Fact label="Kontakt" conf={lowest(f.kontaktperson, f.telefon)}>{contact}</Fact>
    </div>
  );
}

function AiCard({ t, busy, onIntake, onCategory }) {
  const { triage, extraction, match, job, intake } = t;
  const cat = INBOX_CATEGORY[triage.category];

  if (triage.category === 'ovrigt') {
    return (
      <section className="ai-card sorted">
        <div className="ai-card-head">
          <span className="ai-card-title"><Filter size={13} /> Sorterades bort</span>
          <span className="t-muted" style={{ fontSize: 12 }}>{CATEGORY_SOURCE[triage.source]}</span>
        </div>
        <div className="ai-summary">{triage.summary}</div>
        <p className="t-muted" style={{ fontSize: 13 }}>
          {triage.filter_reason}. Mejlet syns inte bland order och behöver inte hanteras.
        </p>
        <div className="ai-actions">
          <Button size="sm" variant="secondary" onClick={() => onCategory('bestallning')} loading={busy === 'category'}>
            <InboxIcon size={13} /> Det här är en order
          </Button>
        </div>
      </section>
    );
  }

  const isChange = triage.category === 'andring' || triage.category === 'avbokning';
  const canCreate = !job && t.source_id != null;
  return (
    <motion.section className="ai-card" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="ai-card-head">
        <span className="ai-card-title"><Sparkles size={13} /> Åkaren läste mejlet</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge ${cat.badge}`}>{cat.label}</span>
          <span className="t-muted" style={{ fontSize: 12 }}>{CATEGORY_SOURCE[triage.source]}</span>
        </span>
      </div>
      <div className="ai-summary">{triage.summary}</div>

      {triage.flags.includes('farligt_avfall') && (
        <div className="notice notice-red">
          <TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><strong>Farligt avfall.</strong> Transporten ska antecknas innan den börjar och rapporteras till Naturvårdsverkets avfallsregister senast två arbetsdagar efter. Kontrollera avfallskod och mottagningsbesked innan första lasset.</span>
        </div>
      )}

      {triage.change.length > 0 && (
        <div className="changes">
          {triage.change.map((c) => (
            <div key={c.label} className="change-row">
              <span className="change-label">{c.label}</span>
              {c.from && <><span className="change-from">{c.from}</span><ArrowRight size={13} className="t-muted" /></>}
              <strong>{c.to}</strong>
            </div>
          ))}
        </div>
      )}

      {extraction && !isChange && <Facts f={extraction.fields} match={match} />}
      {isChange && match && (
        <div className="t-muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CircleCheck size={13} style={{ color: 'var(--success)', flexShrink: 0 }} /> {match.customer.name}{match.project ? ` · ${match.project.name}` : ''}
        </div>
      )}
      {extraction && !isChange && extraction.missing.length > 0 && (
        <div style={{ fontSize: 13, color: '#92400e' }}>
          Saknas i mejlet: {extraction.missing.map((k) => FIELD_NAMES[k]).join(', ')}.
        </div>
      )}
      {extraction && !isChange && extraction.warnings.length > 0 && (
        <div className="notice notice-amber">{extraction.warnings.join(' ')}</div>
      )}

      <div className="ai-actions">
        {job ? (
          <>
            <Link to={`/uppdrag/${job.id}`} style={{ textDecoration: 'none' }}>
              <Button size="sm" variant={isChange ? 'primary' : 'secondary'}><Briefcase size={13} /> {isChange ? 'Öppna uppdraget' : `Uppdrag ${job.id}`}</Button>
            </Link>
            <span className="t-muted" style={{ fontSize: 12.5 }}>
              {isChange
                ? 'Åkaren ändrar aldrig ett uppdrag själv. Gör ändringen i uppdraget och bekräfta sedan till kunden nedan.'
                : `${job.project_name}, ${formatDate(job.datum_fran)}${job.tid ? ` kl ${job.tid}` : ''}. Skapat från mejlet.`}
            </span>
          </>
        ) : canCreate ? (
          <>
            <Button size="sm" variant={triage.category === 'fraga' ? 'secondary' : 'primary'} onClick={onIntake} loading={busy === 'intake'}>
              {intake?.status === 'utkast' ? 'Fortsätt granska' : triage.category === 'fraga' ? 'Gör om till uppdrag' : 'Granska och skapa uppdrag'} <ArrowRight size={13} />
            </Button>
            <span className="t-muted" style={{ fontSize: 12.5 }}>
              {triage.category === 'fraga'
                ? 'Det här är en förfrågan. Svara först, och gör om den till ett uppdrag när kunden bestämt sig.'
                : isChange ? 'Ändringen gäller en beställning som inte är ett uppdrag än. Ta med den när du granskar.'
                  : 'Du kontrollerar alla uppgifter innan något blir ett uppdrag.'}
            </span>
          </>
        ) : null}
      </div>
    </motion.section>
  );
}

// ── Messages ────────────────────────────────────────────────────────────────

function Attachment({ a, onOpen }) {
  return (
    <button type="button" className="attach" onClick={() => onOpen(a)}>
      <span className="attach-icon"><FileText size={15} /></span>
      <span>{a.filename}<small>{formatBytes(a.size_bytes)}{a.has_text ? ' · AI:n läste bilagan' : ''}</small></span>
    </button>
  );
}

function Message({ m, companyName, onAttachment, onConfirmation }) {
  const [showQuote, setShowQuote] = useState(false);
  const out = m.kind === 'out';
  const { own, quote } = splitQuote(m.body_text);
  const name = out ? companyName : m.from_name ?? m.from_email;
  const status = out && m.status !== 'skickat' ? MAIL_STATUS[m.status] : null;
  return (
    <article className={`mail${out ? ' out' : ''}`}>
      <div className="mail-head">
        <span className="avatar" style={{ background: out ? 'var(--accent)' : avatarColor(m.from_email) }}>
          {out ? initials(companyName, '') : initials(m.from_name, m.from_email)}
        </span>
        <div className="mail-who">
          <div className="mail-name">
            {name}
            {out && <span className="badge badge-muted">{REPLY_TEMPLATE[m.template]}</span>}
            {status && <span className={`badge ${status.badge}`} title={m.status === 'simulerat' ? 'SMTP är inte inställt. Svaret sparades men skickades inte.' : undefined}>{status.label}</span>}
          </div>
          <div className="mail-addr">
            {out ? `${m.from_email} till ${m.to_email}${m.sent_by_name ? ` · ${m.sent_by_name}` : ''}` : `${m.from_email}${m.to_email ? ` till ${m.to_email}` : ''}`}
          </div>
        </div>
        <span className="mail-when">{formatMailTime(m.at, { withTime: true })}</span>
      </div>
      {out && m.template === 'bekrafta' ? (
        <div className="mail-body">
          Orderbekräftelsen skickades som svar i tråden.{' '}
          <button type="button" className="quote-toggle" style={{ margin: 0 }} onClick={() => onConfirmation(m)}>
            <Eye size={11} style={{ verticalAlign: -1 }} /> Visa orderbekräftelsen
          </button>
        </div>
      ) : (
        <div className="mail-body">{own}</div>
      )}
      {m.error_message && <div className="field-error" style={{ marginLeft: 44, marginTop: 6 }}>{m.error_message}</div>}
      {quote && m.template !== 'bekrafta' && (
        <>
          <button type="button" className="quote-toggle" onClick={() => setShowQuote((s) => !s)} aria-expanded={showQuote} title="Visa citerad text">···</button>
          {showQuote && <div className="mail-quote">{quote}</div>}
        </>
      )}
      {m.attachments?.length > 0 && (
        <div className="attachments">{m.attachments.map((a) => <Attachment key={a.id} a={a} onOpen={onAttachment} />)}</div>
      )}
    </article>
  );
}

function Thread({ messages, companyName, onAttachment, onConfirmation }) {
  const key = (m) => `${m.kind}${m.id}`;
  // The two latest messages are open; earlier ones collapse to a line until clicked, like a mail client.
  const [expanded, setExpanded] = useState(() => new Set());
  const latest = new Set(messages.slice(-2).map(key));
  const isOpen = (m) => latest.has(key(m)) || expanded.has(key(m));
  return (
    <section className="panel" style={{ overflow: 'hidden' }}>
      {messages.map((m) => (isOpen(m) ? (
        <Message key={key(m)} m={m} companyName={companyName} onAttachment={onAttachment} onConfirmation={onConfirmation} />
      ) : (
        <button key={key(m)} type="button" className="mail-collapsed" onClick={() => setExpanded((s) => new Set([...s, key(m)]))}>
          <span className="avatar" style={{ width: 24, height: 24, fontSize: 10, background: m.kind === 'out' ? 'var(--accent)' : avatarColor(m.from_email) }}>
            {m.kind === 'out' ? initials(companyName, '') : initials(m.from_name, m.from_email)}
          </span>
          <strong>{m.kind === 'out' ? companyName : m.from_name ?? m.from_email}</strong>
          <span className="text">{splitQuote(m.body_text).own.replace(/\s+/g, ' ')}</span>
          <span className="mail-when">{formatMailTime(m.at)}</span>
        </button>
      )))}
    </section>
  );
}

// ── Reply ───────────────────────────────────────────────────────────────────

/** Only the parameters a template uses. */
function paramsFor(template, p) {
  if (template === 'nytt_datum') return { datum: p.datum, tid: p.tid || null };
  if (template === 'mer_info') return { questions: p.questions };
  if (template === 'tacka_nej') return { reason: p.reason };
  if (template === 'bekrafta') return { message: p.message || null };
  return {};
}

function Composer({ t, template, onTemplate, onSent }) {
  const toast = useToast();
  const [to, setTo] = useState(t.defaults.to);
  const [cc, setCc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [p, setP] = useState(() => ({
    datum: t.defaults.datum, tid: t.defaults.tid, reason: 'fullbokat', message: '',
    questions: t.questions.filter((q) => q.selected).map((q) => q.key),
  }));
  const params = useMemo(() => paramsFor(template, p), [template, p]);
  const paramsKey = JSON.stringify(params);

  // Fill in the template; re-fill when its options change, unless the text was edited by hand.
  useEffect(() => {
    if (!template) return undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api(`/api/inbox/emails/${t.reply_to}/reply/preview`, { method: 'POST', body: { template, params: JSON.parse(paramsKey) }, signal: ctrl.signal })
        .then((r) => {
          setPreview(r);
          setPreviewError(null);
          setSubject((s) => s || r.subject);
          if (!edited) setText(r.text);
        })
        .catch((err) => { if (err.name !== 'AbortError') setPreviewError(err); });
    }, 180);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [template, paramsKey, t.reply_to, edited]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const sent = await api(`/api/inbox/emails/${t.reply_to}/reply`, {
        method: 'POST',
        body: { template, params, to, cc: cc || null, subject, ...(template === 'bekrafta' ? {} : { text }) },
      });
      if (sent.status === 'misslyckat') toast(`Svaret kunde inte skickas. ${sent.error_message ?? ''}`.trim(), 'error');
      else toast(sent.status === 'skickat' ? `Svaret är skickat till ${sent.to_email}.` : 'Svaret är sparat i tråden (simulerat, SMTP är inte inställt).');
      onSent();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!template) {
    const first = t.templates.find((x) => !x.disabled_reason)?.key;
    return (
      <section className="panel">
        <div className="panel-body composer">
          <div className="section-title" style={{ marginBottom: 0 }}>
            <h2 className="t-heading">Svara</h2>
            <span className="t-muted" style={{ fontSize: 12.5 }}>Välj en mall. Du ser och kan ändra allt innan något skickas.</span>
          </div>
          <div className="template-chips">
            {t.templates.map(({ key, disabled_reason: why }) => (
              <span key={key} title={why ?? undefined}>
                <Button size="sm" variant={key === first ? 'primary' : 'secondary'} disabled={Boolean(why)} onClick={() => onTemplate(key)}>
                  {REPLY_TEMPLATE[key]}
                </Button>
              </span>
            ))}
          </div>
          {t.templates.some((x) => x.disabled_reason) && (
            <p className="t-muted" style={{ fontSize: 12 }}>{t.templates.find((x) => x.disabled_reason).disabled_reason}</p>
          )}
        </div>
      </section>
    );
  }

  const q = (key) => p.questions.includes(key);
  return (
    <motion.section className="panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
      <div className="panel-head">
        <h2 className="t-heading">{REPLY_TEMPLATE[template]}</h2>
        <Button size="sm" variant="ghost" onClick={() => onTemplate(null)} aria-label="Stäng"><X size={13} /> Stäng</Button>
      </div>
      <div className="panel-body composer">
        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="r-to">Till</label>
            <input id="r-to" className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field">
            {showCc ? (
              <>
                <label className="field-label" htmlFor="r-cc">Kopia</label>
                <input id="r-cc" className="input" type="email" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="t.ex. platschefen" autoFocus />
              </>
            ) : (
              <button type="button" className="quote-toggle" style={{ margin: '26px 0 0', height: 28, padding: '0 10px', width: 'fit-content' }} onClick={() => setShowCc(true)}>+ Kopia</button>
            )}
          </div>
          <div className="field span-2">
            <label className="field-label" htmlFor="r-subject">Ämne</label>
            <input id="r-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        </div>

        {template === 'nytt_datum' && (
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="r-date">Datum ni kan erbjuda</label>
              <input id="r-date" className="input" type="date" value={p.datum} onChange={(e) => setP((s) => ({ ...s, datum: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="r-time">Tid</label>
              <input id="r-time" className="input" type="time" value={p.tid ?? ''} onChange={(e) => setP((s) => ({ ...s, tid: e.target.value }))} />
            </div>
          </div>
        )}

        {template === 'mer_info' && (
          <div>
            <div className="field-label" style={{ marginBottom: 6 }}>Frågor till kunden <span className="t-muted" style={{ fontWeight: 400 }}>(förvalda: det som saknades i mejlet)</span></div>
            <div className="q-list">
              {t.questions.map((x) => (
                <label key={x.key} className="q-item" data-on={q(x.key)}>
                  <input type="checkbox" checked={q(x.key)} onChange={(e) => setP((s) => ({
                    ...s, questions: e.target.checked ? [...s.questions, x.key] : s.questions.filter((k) => k !== x.key),
                  }))} />
                  {x.text}
                </label>
              ))}
            </div>
          </div>
        )}

        {template === 'tacka_nej' && (
          <div>
            <div className="field-label" style={{ marginBottom: 6 }}>Anledning</div>
            <div className="segmented">
              {Object.entries(DECLINE_REASON).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={p.reason === k} onClick={() => setP((s) => ({ ...s, reason: k }))}>{label}</button>
              ))}
            </div>
          </div>
        )}

        {template === 'bekrafta' ? (
          <>
            <div className="field">
              <label className="field-label" htmlFor="r-msg">Personligt meddelande (valfritt)</label>
              <textarea id="r-msg" className="input" rows={2} maxLength={1000} value={p.message}
                placeholder="T.ex. Vi kommer med två bilar, första på plats 06.45."
                onChange={(e) => setP((s) => ({ ...s, message: e.target.value }))} />
            </div>
            <div>
              <div className="t-label" style={{ marginBottom: 6 }}>Orderbekräftelsen</div>
              <ErrorNotice error={previewError} />
              {preview?.html
                ? <iframe title="Orderbekräftelsen" sandbox="" srcDoc={preview.html} style={{ width: '100%', height: 420, border: '1px solid var(--border)', borderRadius: 10, background: '#f4f5f7' }} />
                : !previewError && <TableSkeleton rows={4} />}
            </div>
          </>
        ) : (
          <div className="field">
            <div className="field-top">
              <label className="field-label" htmlFor="r-text">Meddelande</label>
              {edited && (
                <button type="button" className="quote-toggle" style={{ margin: 0 }} onClick={() => setEdited(false)}>
                  <RotateCcw size={10} style={{ verticalAlign: -1 }} /> Återställ mallen
                </button>
              )}
            </div>
            <textarea id="r-text" className="input" rows={13} value={text} style={{ fontSize: 14, lineHeight: 1.6 }}
              onChange={(e) => { setText(e.target.value); setEdited(true); }} />
            <ErrorNotice error={previewError} />
            <span className="field-hint">Det ursprungliga mejlet citeras under ditt svar, som i vilket mejlprogram som helst.</span>
          </div>
        )}

        {error && <div className="notice notice-red" role="alert">{error}</div>}
        <div className="composer-foot">
          <span className="t-muted" style={{ fontSize: 12.5 }}>
            Skickas från <strong>{t.account.address}</strong> som svar i samma tråd.
            {!t.mail_enabled && <> <span className="badge badge-blue" title="SMTP är inte inställt i server/.env">Simuleras</span></>}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => onTemplate(null)}>Avbryt</Button>
            <Button onClick={send} loading={busy} disabled={!to.trim() || !subject.trim() || (template !== 'bekrafta' && !text.trim())}>
              <Send size={14} /> Skicka svar
            </Button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ── Dialogs ─────────────────────────────────────────────────────────────────

function AttachmentDialog({ attachment, onClose }) {
  const { data, error } = useApi(attachment ? `/api/inbox/attachments/${attachment.id}` : null);
  return (
    <Dialog open={attachment != null} onClose={onClose} wide title={attachment?.filename ?? ''}
      description={data?.text_content ? 'Texten ur bilagan, som AI:n läste den.' : undefined}
      footer={<Button variant="secondary" onClick={onClose}>Stäng</Button>}>
      <ErrorNotice error={error} />
      {!data ? !error && <TableSkeleton rows={6} /> : data.text_content ? (
        <pre style={{ margin: 0, padding: 16, background: '#fafbfc', border: '1px solid var(--border)', borderRadius: 10, font: '12.5px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {data.text_content}
        </pre>
      ) : (
        <p className="t-muted">Bilagan innehåller ingen text som kan visas här ({formatBytes(data.size_bytes)}).</p>
      )}
    </Dialog>
  );
}

function ConfirmationDialog({ message, onClose }) {
  return (
    <Dialog open={message != null} onClose={onClose} wide title="Orderbekräftelse"
      description={message && `Till ${message.to_email} · ${formatMailTime(message.at, { withTime: true })}`}
      footer={<Button variant="secondary" onClick={onClose}>Stäng</Button>}>
      {message?.body_html && (
        <iframe title="Orderbekräftelse" sandbox="" srcDoc={message.body_html}
          style={{ width: '100%', height: 480, border: '1px solid var(--border)', borderRadius: 10, background: '#f4f5f7' }} />
      )}
    </Dialog>
  );
}

// ── Page part ───────────────────────────────────────────────────────────────

export function InboxThread({ id, tab, onChanged }) {
  const toast = useToast();
  const { query } = useLocation();
  const { data: t, error, loading, reload } = useApi(`/api/inbox/threads/${id}`);
  const [template, setTemplate] = useState(() => query.get('svara'));
  const [busy, setBusy] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const back = tab === 'att_hantera' ? '/inkorg' : `/inkorg?flik=${tab}`;

  // Opened from the order review with ?svara=bekrafta: keep the composer, drop the parameter.
  useEffect(() => {
    if (query.get('svara')) navigate(`/inkorg/${id}${tab === 'att_hantera' ? '' : `?flik=${tab}`}`, { replace: true });
  }, [query, id, tab]);

  const unread = t?.messages.some((m) => m.kind === 'in' && !m.read);
  useEffect(() => {
    if (!unread) return;
    api(`/api/inbox/threads/${id}/read`, { method: 'POST' }).then(onChanged).catch(() => {});
  }, [unread, id, onChanged]);

  if (loading && !t) return <section className="panel"><TableSkeleton rows={8} /></section>;
  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  if (!t) return null;

  async function run(kind, fn) {
    setBusy(kind);
    try { await fn(); } catch (err) { toast(err.message, 'error'); } finally { setBusy(null); }
  }

  const createIntake = () => run('intake', async () => {
    try {
      const { intake_id: intakeId } = await api(`/api/inbox/emails/${t.source_id}/intake`, { method: 'POST' });
      navigate(`/bestallning/${intakeId}`);
    } catch (err) {
      if (err.code === 'already_confirmed' && err.body?.error?.job_id) navigate(`/uppdrag/${err.body.error.job_id}`);
      else throw err;
    }
  });
  const setCategory = (category) => run('category', async () => {
    await api(`/api/inbox/emails/${t.focus_id}/category`, { method: 'POST', body: { category } });
    toast(category === 'ovrigt' ? 'Flyttat till Sorterat bort' : 'Flyttat till order');
    reload();
    onChanged();
  });
  const setDone = (done) => run('status', async () => {
    await api(`/api/inbox/threads/${id}/status`, { method: 'POST', body: { done } });
    toast(done ? 'Markerat som klart' : 'Öppnat igen');
    reload();
    onChanged();
  });

  const status = INBOX_STATUS[t.status];
  const sorted = t.triage.category === 'ovrigt';
  return (
    <>
      <section className="panel">
        <div className="panel-body">
          <Link to={back} className="reader-back t-muted" style={{ alignItems: 'center', gap: 6, marginBottom: 10, textDecoration: 'none', fontSize: 13 }}>
            <ArrowLeft size={14} /> Inkorgen
          </Link>
          <div className="reader-head">
            <div style={{ minWidth: 0 }}>
              <h2>{t.subject}</h2>
              <div className="reader-chips">
                <span className={`badge ${status.badge}`}>{status.label}</span>
                {t.job && (
                  <Link to={`/uppdrag/${t.job.id}`} className="badge badge-muted" style={{ textDecoration: 'none' }}>
                    <Briefcase size={11} /> Uppdrag {t.job.id} · {t.job.project_name}
                  </Link>
                )}
                <span className="t-muted">{t.messages.length} {t.messages.length === 1 ? 'meddelande' : 'meddelanden'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {!sorted && (t.status === 'ny'
                ? <Button size="sm" variant="ghost" onClick={() => setDone(true)} loading={busy === 'status'}><Check size={13} /> Markera som klar</Button>
                : <Button size="sm" variant="ghost" onClick={() => setDone(false)} loading={busy === 'status'}><RotateCcw size={13} /> Öppna igen</Button>)}
              {!sorted && (
                <Button size="sm" variant="ghost" onClick={() => setCategory('ovrigt')} loading={busy === 'category'} title="Flytta till Sorterat bort">
                  <Filter size={13} /> Inte en order
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <AiCard t={t} busy={busy} onIntake={createIntake} onCategory={setCategory} />

      <Thread messages={t.messages} companyName={t.company_name} onAttachment={setAttachment} onConfirmation={setConfirmation} />

      <AnimatePresence mode="wait">
        <Composer key={template ?? 'chips'} t={t} template={template} onTemplate={setTemplate}
          onSent={() => { setTemplate(null); reload(); onChanged(); }} />
      </AnimatePresence>

      <AttachmentDialog attachment={attachment} onClose={() => setAttachment(null)} />
      <ConfirmationDialog message={confirmation} onClose={() => setConfirmation(null)} />
    </>
  );
}
