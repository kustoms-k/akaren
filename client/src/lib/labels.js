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
