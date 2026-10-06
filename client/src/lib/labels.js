// Swedish UI labels for DB enum values, plus small display formatters.

export const VEHICLE_TYPES = {
  tippbil: 'Tippbil',
  kranbil: 'Kranbil',
  lastvaxlare: 'Lastväxlare',
  trailer: 'Trailer',
  ovrigt: 'Övrigt',
};

export const ZONE_CLASSES = {
  0: 'Ingen miljözon',
  1: 'Miljözon klass 1',
  2: 'Miljözon klass 2',
  3: 'Miljözon klass 3',
};

// For vehicles: the strictest zone class the vehicle meets.
export const VEHICLE_ZONE_CLASSES = {
  0: 'Uppfyller ingen',
  1: 'Klass 1',
  2: 'Klass 2',
  3: 'Klass 3',
};

export const VAT_MODES = {
  normal: 'Moms 25 %',
  omvand_bygg: 'Omvänd byggmoms',
};

export const UPPDRAGSTYPER = {
  schakt: 'Schakt / bortforsling',
  grus_leverans: 'Grusleverans',
  kran: 'Kran',
  container: 'Container',
  maskintransport: 'Maskintransport',
  ovrigt: 'Övrigt',
};

export const MANGD_ENHETER = { ton: 'ton', m3: 'm³', lass: 'lass' };

export const JOB_STATUS = {
  bekraftad: { label: 'Bekräftad', badge: 'badge-blue' },
  pagar: { label: 'Pågår', badge: 'badge-green' },
  klar: { label: 'Klar', badge: 'badge-muted' },
  avbruten: { label: 'Avbruten', badge: 'badge-red' },
};

// How sure the AI was about a field. 'hog' is not badged; it needs no attention.
export const CONFIDENCE = {
  medel: { label: 'Tolkat', badge: 'badge-blue', hint: 'AI:n har tolkat texten, t.ex. ett relativt datum.' },
  lag: { label: 'Osäkert', badge: 'badge-amber', hint: 'Kontrollera mot texten och ändra eller bekräfta.' },
  saknas: { label: 'Saknas', badge: 'badge-muted', hint: 'Står inte i beställningen.' },
};

const longDate = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** '2026-10-06' → 'tis 6 okt' */
export function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return longDate.format(new Date(Date.UTC(y, m - 1, day)));
}

export function formatQuantity(n, unit) {
  if (n == null) return '';
  return `${new Intl.NumberFormat('sv-SE').format(n)} ${MANGD_ENHETER[unit] ?? ''}`.trim();
}

export const REVIEW_STATUS = {
  ok: { label: 'OK', badge: 'badge-green' },
  behover_granskas: { label: 'Granskas', badge: 'badge-amber' },
  granskad: { label: 'Granskad', badge: 'badge-blue' },
};

// Per-field confidence on a lass: the AI's reading, or who typed the value.
export const LASS_CONFIDENCE = {
  medel: { label: 'Tolkat', badge: 'badge-blue', hint: 'AI:n har tolkat värdet på vågsedeln.' },
  lag: { label: 'Osäkert', badge: 'badge-amber', hint: 'AI:n kunde inte läsa värdet säkert. Kontrollera mot fotot.' },
  saknas: { label: 'Saknas', badge: 'badge-muted', hint: 'Värdet saknas.' },
  forare: { label: 'Föraren', badge: 'badge-muted', hint: 'Skrivet eller ändrat av föraren.' },
  kontor: { label: 'Kontoret', badge: 'badge-muted', hint: 'Skrivet eller kontrollerat av kontoret.' },
};

// Hazardous waste: reporting to Naturvårdsverket's avfallsregister within two working days.
export const HAZARD_STATE = {
  forsenad: { label: 'Försenad', badge: 'badge-red' },
  idag: { label: 'Sista dag idag', badge: 'badge-amber' },
  kommande: { label: 'Ska rapporteras', badge: 'badge-amber' },
  rapporterad: { label: 'Rapporterad', badge: 'badge-green' },
};

// Lass fields as the office sees them.
export const LASS_FIELD_LABELS = {
  vagsedel_nr: 'Vågsedelnummer', datum: 'Datum', tid: 'Tid', material: 'Material', netto_kg: 'Nettovikt',
  avfallskod: 'Avfallskod', farligt_avfall: 'Farligt avfall', fran_text: 'Från', till_namn: 'Till (mottagare)',
  till_orgnr: 'Mottagarens org.nr', till_adress: 'Mottagarens adress', note: 'Anteckning',
};

/** Display value of a lass field. */
export function formatLassValue(key, value) {
  if (value == null || value === '') return '–';
  if (key === 'netto_kg') return formatTon(value);
  if (key === 'farligt_avfall') return value ? 'Ja' : 'Nej';
  if (key === 'datum') return formatDate(value);
  return String(value);
}

/** '18,42' or '18.42' (ton) → 18420 kg; '' → null; anything else → NaN. */
export function tonToKg(ton) {
  const s = String(ton ?? '').replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : NaN;
}

/** 18420 → '18,42' for an input field. */
export const kgToTonInput = (kg) => (kg == null ? '' : String(kg / 1000).replace('.', ','));

export const SMS_STATUS = {
  ej_skickat: { label: 'Ej skickat', badge: 'badge-muted' },
  skickat: { label: 'SMS skickat', badge: 'badge-green' },
  simulerat: { label: 'SMS simulerat', badge: 'badge-blue' },
  misslyckat: { label: 'SMS misslyckades', badge: 'badge-red' },
};

export const MAIL_STATUS = {
  skickat: { label: 'Skickad', badge: 'badge-green' },
  simulerat: { label: 'Simulerad', badge: 'badge-blue' },
  misslyckat: { label: 'Misslyckades', badge: 'badge-red' },
};

/** [text, kind] for a toast after sending an order confirmation. */
export function confirmationToast(sent) {
  if (sent.status === 'skickat') return [`Orderbekräftelsen är skickad till ${sent.to_email}.`];
  if (sent.status === 'simulerat') return ['Orderbekräftelsen är sparad men inte skickad (SMTP är inte inställt).'];
  return [`Orderbekräftelsen kunde inte skickas. ${sent.error_message ?? ''}`.trim(), 'error'];
}

const tonFmt = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 18420 (kg) -> '18,42 t' */
export function formatTon(kg) {
  return kg == null ? '' : `${tonFmt.format(kg / 1000)} t`;
}

export const FORTNOX_STATUS = {
  disconnected: 'Inte ansluten',
  connected: 'Ansluten',
  reconnect_required: 'Behöver anslutas igen',
};

export function formatPhone(e164) {
  if (!e164) return '';
  const m = /^\+46(7\d)(\d{3})(\d{2})(\d{2})$/.exec(e164);
  if (m) return `0${m[1]}-${m[2]} ${m[3]} ${m[4]}`;
  const sthlm = /^\+468(\d{3})(\d{3})(\d{2})$/.exec(e164); // Stockholm landline, 08-xxx xxx xx
  return sthlm ? `08-${sthlm[1]} ${sthlm[2]} ${sthlm[3]}` : e164;
}

/** Comparable form of a phone number: digits only, Swedish leading 0 as 46. */
export function phoneKey(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.startsWith('00') ? d.slice(2) : d.startsWith('0') ? `46${d.slice(1)}` : d;
}

export function formatPostnr(p) {
  return p && /^\d{5}$/.test(p) ? `${p.slice(0, 3)} ${p.slice(3)}` : p ?? '';
}

export function formatAddress({ address, postnr, ort }) {
  return [address, [formatPostnr(postnr), ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

const dateFmt = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeZone: 'Europe/Stockholm' });
export function formatTimestamp(iso) {
  return iso ? dateFmt.format(new Date(iso)) : '';
}

const dateTimeFmt = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Stockholm' });
export function formatDateTime(iso) {
  return iso ? dateTimeFmt.format(new Date(iso)) : '';
}

// ── Order inbox ──

export const INBOX_CATEGORY = {
  bestallning: { label: 'Beställning', badge: 'badge-blue' },
  andring: { label: 'Ändring', badge: 'badge-amber' },
  avbokning: { label: 'Avbokning', badge: 'badge-red' },
  fraga: { label: 'Fråga', badge: 'badge-muted' },
  svar: { label: 'Svar', badge: 'badge-green' },
  ovrigt: { label: 'Övrigt', badge: 'badge-muted' },
};

export const INBOX_STATUS = {
  ny: { label: 'Att hantera', badge: 'badge-blue' },
  besvarad: { label: 'Besvarad', badge: 'badge-green' },
  klar: { label: 'Klar', badge: 'badge-muted' },
  sorterad: { label: 'Sorterad bort', badge: 'badge-muted' },
};

export const CATEGORY_SOURCE = {
  ai: 'Sorterat av AI',
  regel: 'Sorterat av regel, utan AI',
  kontoret: 'Sorterat av kontoret',
};

export const REPLY_TEMPLATE = {
  bekrafta: 'Bekräfta order',
  nytt_datum: 'Föreslå annat datum',
  mer_info: 'Be om mer info',
  tacka_nej: 'Tacka nej',
  bekrafta_andring: 'Bekräfta ändringen',
  bekrafta_avbokning: 'Bekräfta avbokningen',
  fritt: 'Eget svar',
};

export const DECLINE_REASON = {
  fullbokat: 'Fullbokat',
  fordon: 'Saknar rätt fordon',
  omrade: 'Utanför vårt område',
  annat: 'Annat',
};

const timeOnly = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
const dayMonth = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' });
const ymd = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Stockholm' });

/** Mail-client style time: '08:31' today, 'i går' / 'i går 17:42', else '5 okt'. */
export function formatMailTime(iso, { withTime = false } = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = ymd.format(new Date());
  const yesterday = ymd.format(new Date(Date.now() - 86_400_000));
  const day = ymd.format(d);
  if (day === today) return timeOnly.format(d);
  if (day === yesterday) return withTime ? `i går ${timeOnly.format(d)}` : 'i går';
  return withTime ? `${dayMonth.format(d)} ${timeOnly.format(d)}` : dayMonth.format(d);
}

/** 'för 2 min sedan', 'för 3 h sedan', or a date. */
export function formatAgo(iso) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'nyss';
  if (min < 60) return `för ${min} min sedan`;
  if (min < 24 * 60) return `för ${Math.round(min / 60)} h sedan`;
  return formatMailTime(iso, { withTime: true });
}

export function formatBytes(n) {
  if (!n) return '';
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// ── Fakturaunderlag ──

export const UNDERLAG_STATUS = {
  klar: { label: 'Klart att fakturera', badge: 'badge-green' },
  delvis: { label: 'Nya rader att fakturera', badge: 'badge-blue' },
  blockerad: { label: 'Blockerat', badge: 'badge-amber' },
  fakturerad: { label: 'Fakturerat', badge: 'badge-muted' },
};

export const PRICE_UNITS = { ton: 'per ton', lass: 'per lass', timme: 'per timme', fast: 'fast pris' };
export const QTY_UNITS = { ton: 't', lass: 'lass', timme: 'h', fast: 'st' };

const krFmt = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const krRound = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
/** 237072 (öre) → '2 370,72 kr'; { round: true } → '2 371 kr'. */
export function formatKr(ore, { round = false } = {}) {
  if (ore == null) return '';
  return (round ? krRound : krFmt).format(ore / 100);
}

/** A quantity for its unit: '17,96 t', '8,5 h', '1 lass'. */
export function formatQty(q, unit) {
  if (q == null) return '';
  const n = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: unit === 'ton' ? 3 : 2 }).format(q);
  return `${n} ${QTY_UNITS[unit] ?? ''}`.trim();
}

// ── Avstämning (facility weighing lists against logged lass) ──

export const WEIGH_ROW_STATUS = {
  saknas: { label: 'Saknas i Lasskoll', badge: 'badge-red' },
  avvikelse: { label: 'Avvikelse', badge: 'badge-amber' },
  matchad: { label: 'Matchad', badge: 'badge-green' },
  ignorerad: { label: 'Ignorerad', badge: 'badge-muted' },
};

export const MATCH_KIND = {
  vagsedel: 'Samma vågsedel',
  fordon_dag: 'Samma bil, dag och vikt',
  skapad: 'Skapat från våglistan',
};

// What differs between the scale and the lass.
export const WEIGH_DIFF_LABELS = { netto_kg: 'Nettovikt', vagsedel_nr: 'Vågsedelnummer', datum: 'Datum', regnr: 'Regnr' };

/** Display value of a weighing-list difference. */
export function formatDiffValue(field, value) {
  if (value == null || value === '') return '–';
  if (field === 'netto_kg') return formatTon(value);
  if (field === 'datum') return formatDate(value);
  return String(value);
}

/** '+240 kg' / '−1 840 kg', for a weight difference (scale minus logged). */
export function formatKgDiff(kg) {
  if (kg == null) return '';
  const n = new Intl.NumberFormat('sv-SE').format(Math.abs(kg));
  return `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${n} kg`;
}

/** '28 sep – 2 okt 2026' for a period. */
export function formatPeriod(from, to) {
  if (!from) return '';
  const year = to?.slice(0, 4) ?? from.slice(0, 4);
  return from === to ? `${formatDate(from)} ${year}` : `${formatDate(from)} – ${formatDate(to)} ${year}`;
}
