import { formatPhoneSv } from './normalize.js';

// Order confirmation email (orderbekräftelse) to the customer: subject, plain text and HTML from one job.
// Pure functions; sending lives in services/mail.js and routes/jobs.js.

/** What the customer reads as the kind of job. More descriptive than the short UI labels. */
const TYPE_DESCRIPTIONS = {
  schakt: 'Schakt – bortforsling av massor',
  grus_leverans: 'Leverans av grus och bergmaterial',
  kran: 'Kranbil – lyft',
  container: 'Container (lastväxlare)',
  maskintransport: 'Maskintransport',
  ovrigt: 'Transportuppdrag',
};

const UNITS = { ton: 'ton', m3: 'm³', lass: 'lass' };
const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

// Material or instructions that suggest contaminated masses or hazardous waste.
const HAZARD = /förorena|farligt avfall|\bFA\b|\bMKM\b|\bKM\b|tjär|kreosot|asbest/i;

/** Sender-side failure codes (services/mail.js) as Swedish messages for the office. */
export const MAIL_ERRORS = {
  auth: 'E-postservern godkände inte inloggningen. Kontrollera SMTP_USER och SMTP_PASSWORD i server/.env.',
  connection: 'Kunde inte nå e-postservern. Kontrollera SMTP_HOST och SMTP_PORT, eller försök igen om en stund.',
  rejected: 'E-postservern tog inte emot mejlet. Kontrollera mottagarens adress.',
  other: 'Mejlet kunde inte skickas. Försök igen.',
};

function parts(date) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** '2026-10-06' → 'tisdag 6 oktober 2026'. */
export function longDateSv(date) {
  const { y, m, d, wd } = parts(date);
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** '2026-10-06' → 'tis 6 okt'. */
export function shortDateSv(date) {
  const { m, d, wd } = parts(date);
  return `${WEEKDAYS[wd].slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

function dateRange(from, to) {
  if (!to || to === from) return longDateSv(from);
  const a = parts(from);
  const b = parts(to);
  if (a.y === b.y && a.m === b.m) return `${WEEKDAYS[a.wd]} ${a.d} – ${WEEKDAYS[b.wd]} ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${longDateSv(from)} – ${longDateSv(to)}`;
}

const num = (n) => new Intl.NumberFormat('sv-SE').format(n);
const postnr = (p) => (p && /^\d{5}$/.test(p) ? `${p.slice(0, 3)} ${p.slice(3)}` : p ?? '');
const address = (street, pnr, ort) => [street, [postnr(pnr), ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const cut = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
const firstName = (name) => (name ? name.trim().split(/\s+/)[0] : null);

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const escLines = (s) => esc(s).replace(/\r?\n/g, '<br>');
// Org numbers, phone numbers and postcodes must not break across lines in narrow table cells.
const keepTogether = (html) => html.replace(/\b\d{6}-\d{4}\b|\b0\d{1,3}-\d{2,3}(?: \d{2,3}){1,3}\b|\b\d{3} \d{2}\b/g, (m) => `<span style="white-space:nowrap;">${m}</span>`);

/**
 * Build the email for one job.
 * job: a jobs row joined with customer_name, customer_org_nr, project_name, project_address,
 *      project_postnr, project_ort, customer_ref.
 * company: companies row (name, org_nr, address, postnr, ort, phone, email, order_terms).
 * message: optional personal note from the office.
 * Returns { subject, text, html }.
 */
export function buildOrderConfirmation({ job, company, message = null }) {
  const when = dateRange(job.datum_fran, job.datum_till);
  const companyPhone = formatPhoneSv(company.phone);
  const site = address(job.project_address, job.project_postnr, job.project_ort);
  const contact = [job.kontaktperson, formatPhoneSv(job.telefon)].filter(Boolean).join(', ');
  const hazard = HAZARD.test(`${job.material ?? ''} ${job.instruktioner ?? ''}`);
  const note = message?.trim() || null;
  const terms = company.order_terms?.trim() || null;

  const subject = [
    `Orderbekräftelse: ${cut(job.project_name, 60)}`,
    `${shortDateSv(job.datum_fran)}${job.tid ? ` kl ${job.tid}` : ''}`,
    job.customer_ref ? `er ref ${job.customer_ref}` : null,
  ].filter(Boolean).join(', ');

  // [label, value]; rows without a value are left out.
  const rows = [
    ['Uppdragsnummer', String(job.id)],
    ['Er referens', job.customer_ref],
    ['Uppdrag', TYPE_DESCRIPTIONS[job.uppdragstyp] ?? TYPE_DESCRIPTIONS.ovrigt],
    ['Datum', when],
    ['Starttid', job.tid ? `kl ${job.tid}` : null],
    ['Material', job.material],
    ['Uppskattad mängd', job.uppskattad_mangd != null ? `ca ${num(job.uppskattad_mangd)} ${UNITS[job.mangd_enhet] ?? ''}`.trim() : null],
    ['Antal lass', job.antal_lass != null ? num(job.antal_lass) : null],
    ['Från', job.fran_text],
    ['Till', job.till_text],
    ['Arbetsplats', [job.project_name, site].filter(Boolean).join(', ')],
    ['Kontakt på plats', contact || null],
    ['Instruktioner', job.instruktioner],
    ['Beställare', [job.customer_name, job.customer_org_nr && `org.nr ${job.customer_org_nr}`].filter(Boolean).join(', ')],
  ].filter(([, v]) => v != null && v !== '');

  const greeting = `Hej${firstName(job.kontaktperson) ? ` ${firstName(job.kontaktperson)}` : ''}!`;
  const intro = 'Tack för beställningen. Här är vår bekräftelse av uppdraget så som vi har uppfattat det.';
  const check = `Läs igenom uppgifterna. Stämmer något inte, svara på det här mejlet${companyPhone ? ` eller ring oss på ${companyPhone}` : ''} så snart som möjligt, helst före ${shortDateSv(job.datum_fran)}.`;
  const hazardText = 'Om massorna är klassade som farligt avfall behöver vi avfallskod, uppskattad mängd och mottagande anläggning före första lasset. Som transportör ska vi anteckna transporten innan den börjar och rapportera den till Naturvårdsverkets avfallsregister.';
  const signature = [
    company.name,
    address(company.address, company.postnr, company.ort),
    [companyPhone && `Telefon ${companyPhone}`, company.email].filter(Boolean).join(' · '),
    company.org_nr && `Org.nr ${company.org_nr}`,
  ].filter(Boolean);

  // ── Plain text ──
  const labelWidth = Math.max(...rows.map(([l]) => l.length)) + 2;
  const text = [
    greeting,
    '',
    intro,
    ...(note ? ['', note] : []),
    '',
    `ORDERBEKRÄFTELSE – UPPDRAG ${job.id}`,
    ...rows.map(([l, v]) => `${`${l}:`.padEnd(labelWidth)}${String(v).replace(/\r?\n/g, `\n${' '.repeat(labelWidth)}`)}`),
    '',
    check,
    ...(hazard ? ['', 'FÖRORENADE MASSOR', hazardText] : []),
    ...(terms ? ['', 'VILLKOR', terms] : []),
    '',
    'Med vänliga hälsningar',
    ...signature,
  ].join('\n');

  // ── HTML: table layout and inline styles for Outlook and Gmail; no images. ──
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const muted = '#6b7280';
  const ink = '#1a1d24';
  const block = (inner, pad = '0 32px 20px') => `<tr><td style="padding:${pad};${font}font-size:15px;line-height:1.55;color:${ink};">${inner}</td></tr>`;
  const section = (title, body) => block(
    `<div style="font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:${muted};margin:0 0 6px;">${esc(title)}</div>`
    + `<div style="font-size:14px;color:${ink};">${body}</div>`,
  );
  const detailRows = rows.map(([l, v], i) => `<tr>
<td valign="top" style="${font}padding:9px 12px 9px 0;width:36%;font-size:14px;color:${muted};${i ? 'border-top:1px solid #ececef;' : ''}">${esc(l)}</td>
<td valign="top" style="${font}padding:9px 0;font-size:14px;color:${ink};${i ? 'border-top:1px solid #ececef;' : ''}">${keepTogether(escLines(v))}</td>
</tr>`).join('');

  const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(`${TYPE_DESCRIPTIONS[job.uppdragstyp] ?? ''} ${when}${job.tid ? ` kl ${job.tid}` : ''}. Kontrollera uppgifterna.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #ececef;border-radius:12px;">
${block(`<div style="font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:${muted};">Orderbekräftelse · Uppdrag ${esc(job.id)}</div>
<h1 style="margin:6px 0 0;font-size:21px;line-height:1.3;font-weight:650;color:${ink};">${esc(job.project_name)}</h1>
<div style="margin-top:4px;font-size:15px;color:${muted};">${esc(when)}${job.tid ? ` · kl ${esc(job.tid)}` : ''}</div>`, '28px 32px 20px')}
${block(`<p style="margin:0 0 10px;">${esc(greeting)}</p><p style="margin:0;">${esc(intro)}</p>`)}
${note ? block(`<div style="border-left:3px solid #2d3340;padding:2px 0 2px 14px;color:${ink};">${escLines(note)}</div>`) : ''}
${block(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRows}</table>`)}
${block(`<div style="background:#f4f5f7;border-radius:8px;padding:12px 14px;font-size:14px;">${keepTogether(esc(check))}</div>`)}
${hazard ? section('Förorenade massor', esc(hazardText)) : ''}
${terms ? section('Villkor', escLines(terms)) : ''}
${block(`<p style="margin:0 0 6px;">Med vänliga hälsningar</p><p style="margin:0;font-size:14px;color:${muted};"><strong style="color:${ink};">${esc(signature[0])}</strong>${signature.slice(1).map((l) => `<br>${keepTogether(esc(l))}`).join('')}</p>`, '4px 32px 28px')}
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
