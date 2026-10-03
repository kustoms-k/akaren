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

export const FORTNOX_STATUS = {
  disconnected: 'Inte ansluten',
  connected: 'Ansluten',
  reconnect_required: 'Behöver anslutas igen',
};

export function formatPhone(e164) {
  if (!e164) return '';
  const m = /^\+46(7\d)(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `0${m[1]}-${m[2]} ${m[3]} ${m[4]}` : e164;
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
