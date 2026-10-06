import { formatPhoneSv } from './normalize.js';
import { buildOrderConfirmation, longDateSv } from './orderConfirmation.js';

// Pre-written replies from the order inbox. Pure functions: the route fills in the context and the
// office edits the text before anything is sent. Nothing here is ever sent automatically.

export const REPLY_TEMPLATES = ['bekrafta', 'nytt_datum', 'mer_info', 'tacka_nej', 'bekrafta_andring', 'bekrafta_avbokning', 'fritt'];

/** Which templates make sense for an email of each category, most likely first. */
export const TEMPLATES_FOR = {
  bestallning: ['bekrafta', 'nytt_datum', 'mer_info', 'tacka_nej', 'fritt'],
  svar: ['bekrafta', 'nytt_datum', 'mer_info', 'fritt'],
  andring: ['bekrafta_andring', 'nytt_datum', 'fritt'],
  avbokning: ['bekrafta_avbokning', 'fritt'],
  fraga: ['mer_info', 'tacka_nej', 'fritt'],
  ovrigt: ['fritt'],
};

export const DECLINE_REASONS = {
  fullbokat: 'de dagarna, eftersom vi redan är fullbokade',
  fordon: 'eftersom vi inte har rätt fordon för det',
  omrade: 'eftersom det ligger utanför området vi kör i',
  annat: null,
};

export const INFO_QUESTIONS = {
  adress: 'Vilken adress gäller? Gata, nummer och ort, gärna med infart eller grindkod.',
  datum: 'Vilken dag vill ni ha bilen, och finns det någon flexibilitet?',
  tid: 'Vilken tid ska första bilen vara på plats?',
  mangd: 'Ungefär hur mycket blir det, i ton eller antal lass?',
  fran: 'Varifrån ska materialet hämtas?',
  till: 'Vart ska massorna köras? Har ni en mottagningsanläggning, eller vill ni att vi föreslår en?',
  material: 'Vilket material gäller, t.ex. fraktion eller typ av massor?',
  klassning: 'Är massorna provtagna? Skicka gärna provsvar eller klassning så att vi väljer rätt mottagning.',
  kontakt: 'Vem ska föraren kontakta på plats, och på vilket nummer?',
};

const weak = (f) => !f || f.value == null || f.confidence === 'lag' || f.confidence === 'saknas';

/**
 * Which order details matter for a kind of job. A crane or a container has no tonnage and no tip;
 * a machine transport has a pickup and a drop-off but no quantity. Unknown type: ask about everything.
 */
export function relevantDetails(uppdragstyp) {
  return {
    mangd: ['schakt', 'grus_leverans', 'ovrigt', null, undefined].includes(uppdragstyp),
    material: !['kran', 'maskintransport'].includes(uppdragstyp),
    fran: ['grus_leverans', 'maskintransport', 'ovrigt', null, undefined].includes(uppdragstyp),
    till: ['schakt', 'maskintransport', 'ovrigt', null, undefined].includes(uppdragstyp),
    klassning: ['schakt', null, undefined].includes(uppdragstyp),
  };
}
const RISKY_MASSES = /asfalt|förorena|tjär|okänd|blandade? massor/i;

/** The questions that fit an order, with the ones the AI couldn't answer preselected. */
export function suggestQuestions(fields = {}) {
  const typ = fields.uppdragstyp?.value ?? null;
  const rel = relevantDetails(typ);
  const pick = {
    adress: weak(fields.adress),
    datum: weak(fields.datum),
    tid: weak(fields.tid),
    mangd: weak(fields.uppskattad_mangd) && weak(fields.antal_lass),
    fran: weak(fields.fran),
    till: weak(fields.till),
    material: weak(fields.material),
    klassning: RISKY_MASSES.test(`${fields.material?.value ?? ''} ${fields.instruktioner?.value ?? ''}`),
    kontakt: weak(fields.telefon),
  };
  const relevant = Object.keys(INFO_QUESTIONS).filter((k) => rel[k] ?? true);
  return relevant.map((key) => ({ key, text: INFO_QUESTIONS[key], selected: Boolean(pick[key]) && (typ != null || key !== 'klassning') }));
}

/** 'Beställning' → 'SV: Beställning'; an existing SV:/RE:/Re: prefix is kept as is. */
export function replySubject(subject) {
  const s = String(subject ?? '').trim();
  if (/^(sv|re|svar|aw)\s*:/i.test(s)) return s;
  return `SV: ${s || '(inget ämne)'}`;
}

const firstName = (name) => {
  const n = String(name ?? '').trim();
  if (!n || n.includes('@')) return null;
  return n.split(/\s+/)[0];
};

function signature(company, userName) {
  const phone = formatPhoneSv(company.phone);
  return [
    'Med vänliga hälsningar',
    userName && userName !== 'Kontoret' ? `${userName}, ${company.name}` : company.name,
    [phone && `Telefon ${phone}`, company.email].filter(Boolean).join(' · '),
  ].filter(Boolean).join('\n');
}

/** '2026-10-08' → 'torsdag 8 oktober' (the year is obvious in a reply). */
export const dayText = (d) => longDateSv(d).replace(/ \d{4}$/, '');
const dateTime = (datum, tid) => `${dayText(datum)}${tid ? ` kl ${tid.replace(':', '.')}` : ''}`;

/** Change lines as a bulleted list: 'Datum: torsdag 8 oktober → fredag 9 oktober'. */
const changeList = (change) => change.map((c) => `• ${c.label}: ${c.from ? `${c.from} → ` : ''}${c.to}`).join('\n');

/** The quoted original appended under a reply, like any mail client does. */
export function quoteOriginal(email) {
  const when = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(email.received_at));
  const who = email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email;
  const body = String(email.body_text ?? '').split(/\r?\n/).map((l) => `> ${l}`.trimEnd()).join('\n');
  return `Den ${when} skrev ${who}:\n${body}`;
}

/**
 * Build the reply text for a template.
 * ctx: { email, company, userName, job (jobs row joined like routes/jobs.js, or null), fields (extraction), change [] }
 * params: template-specific ({ datum, tid } | { questions } | { reason, note } | { message }).
 * Returns { subject, text } — and for 'bekrafta' also { html, confirmation } built from the order confirmation.
 */
export function buildReply(template, ctx, params = {}) {
  const { email, company, userName = null, job = null, fields = {}, change = [] } = ctx;
  const subject = replySubject(email.subject);
  const hello = `Hej${firstName(email.from_name) ? ` ${firstName(email.from_name)}` : ''}!`;
  const sign = signature(company, userName);
  const note = params.note?.trim() ? `\n\n${params.note.trim()}` : '';
  const phone = formatPhoneSv(company.phone);
  const wanted = fields.datum?.value && fields.datum.confidence !== 'saknas' ? fields.datum.value : null;

  let body;
  switch (template) {
    case 'bekrafta': {
      if (!job) throw new Error('bekrafta needs a job');
      const confirmation = buildOrderConfirmation({ job, company, message: params.message ?? null });
      return { subject, text: confirmation.text, html: confirmation.html, confirmation };
    }
    case 'nytt_datum': {
      if (!params.datum) throw new Error('nytt_datum needs a date');
      const sorry = wanted
        ? `Tyvärr har vi inte möjlighet på ${dayText(wanted)}`
        : 'Tyvärr har vi inte möjlighet den dag ni önskar';
      body = `Tack för beställningen! ${sorry}, men vi kan erbjuda ${dateTime(params.datum, params.tid)}.\n\n`
        + `Passar det? Svara på det här mejlet så bokar vi in det direkt.${note}`;
      break;
    }
    case 'mer_info': {
      const keys = (params.questions ?? []).filter((k) => INFO_QUESTIONS[k]);
      const list = keys.length ? keys.map((k) => `• ${INFO_QUESTIONS[k]}`).join('\n') : '• ';
      body = `Tack för beställningen! För att vi ska kunna boka in rätt bil behöver vi några uppgifter till:\n\n${list}\n\n`
        + `Svara gärna på det här mejlet${phone ? ` eller ring oss på ${phone}` : ''}.${note}`;
      break;
    }
    case 'tacka_nej': {
      const reason = DECLINE_REASONS[params.reason ?? 'fullbokat'];
      body = `Tack för att ni hörde av er. Tyvärr kan vi inte ta uppdraget${reason ? ` ${reason}` : ''}.${note}\n\n`
        + 'Hör gärna av er igen vid nästa tillfälle.';
      break;
    }
    case 'bekrafta_andring': {
      const what = job?.project_name ? ` för ${job.project_name}` : '';
      body = change.length
        ? `Tack, vi har noterat ändringen${what}:\n\n${changeList(change)}\n\nI övrigt gäller allt som tidigare.${note}`
        : `Tack, vi har noterat ändringen${what}. I övrigt gäller allt som tidigare.${note}`;
      break;
    }
    case 'bekrafta_avbokning': {
      const what = job?.project_name ? ` för ${job.project_name}` : '';
      body = change.length
        ? `Tack för beskedet. Vi har noterat avbokningen${what}:\n\n${changeList(change)}${note}`
        : `Tack för beskedet. Vi har noterat avbokningen${what}.${note}`;
      break;
    }
    case 'fritt':
      body = params.note?.trim() ?? '';
      break;
    default:
      throw new Error(`Unknown template ${template}`);
  }
  return { subject, text: `${hello}\n\n${body}\n\n${sign}` };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Plain reply text → simple HTML with inline styles; '>' quoted lines become a grey quote block. */
export function replyHtml(text) {
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1d24;";
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let quote = [];
  const flushQuote = () => {
    if (!quote.length) return;
    out.push(`<blockquote style="margin:12px 0 0;padding:0 0 0 12px;border-left:3px solid #dde0e5;color:#6b7280;">${quote.map((l) => esc(l.replace(/^>\s?/, ''))).join('<br>')}</blockquote>`);
    quote = [];
  };
  for (const line of lines) {
    if (line.startsWith('>')) { quote.push(line); continue; }
    flushQuote();
    out.push(line === '' ? '<br>' : `${esc(line)}<br>`);
  }
  flushQuote();
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;"><div style="${font}">${out.join('')}</div></body></html>`;
}
