import { jsPDF } from 'jspdf';

// ── Palette ───────────────────────────────────────────────────────────────────
const BLUE     = [67, 97, 238];
const BLACK    = [26, 26, 26];
const DARK     = [60, 60, 60];
const MID      = [110, 110, 110];
const LIGHT    = [160, 160, 160];
const PALE     = [215, 215, 210];
const WHITE    = [255, 255, 255];
const OFFWHITE = [250, 250, 248];

// ── Layout ────────────────────────────────────────────────────────────────────
const PW = 210;
const PH = 297;
const M  = 18;
const CW = PW - M * 2;  // 174 mm

// ── Helpers ───────────────────────────────────────────────────────────────────
const setf  = (doc, fam, sty, sz) => { doc.setFont(fam, sty); doc.setFontSize(sz); };
const col   = (doc, a)            => doc.setTextColor(...a);
const fill  = (doc, a)            => doc.setFillColor(...a);
const strk  = (doc, a)            => doc.setDrawColor(...a);

function hline(doc, y, color = PALE, lw = 0.25) {
  strk(doc, color);
  doc.setLineWidth(lw);
  doc.line(M, y, PW - M, y);
}

function blueDivider(doc, y) {
  strk(doc, BLUE);
  doc.setLineWidth(0.55);
  doc.line(M, y, PW - M, y);
}

const fmtSEK = (n) =>
  new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(n ?? 0) + ' kr';

const fmtDate = (d) =>
  new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);

function sanitise(s) {
  return String(s ?? '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 30) || 'Kund';
}

function cityOf(addr) {
  if (!addr) return 'Kund';
  const parts = String(addr).split(',');
  const raw   = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
  return sanitise(raw).split('-').slice(0, 2).join('-') || 'Kund';
}

// ── Route map ─────────────────────────────────────────────────────────────────
function drawRouteMap(doc, y, pickup, delivery, distKm) {
  const h    = 28;
  const midY = y + h / 2;
  const pinL = M + 22;
  const pinR = PW - M - 22;

  fill(doc, [245, 245, 242]);
  strk(doc, PALE);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, y, CW, h, 2, 2, 'FD');

  // Dashed route line
  strk(doc, BLUE);
  doc.setLineDashPattern([1.8, 1.4], 0);
  doc.setLineWidth(0.45);
  doc.line(pinL + 4, midY, pinR - 4, midY);
  doc.setLineDashPattern([], 0);

  // Distance label at midpoint
  const midX = (pinL + pinR) / 2;
  if (distKm && !isNaN(distKm)) {
    fill(doc, WHITE);
    strk(doc, PALE);
    doc.setLineWidth(0.2);
    doc.roundedRect(midX - 10, midY - 4, 20, 7, 1, 1, 'FD');
    setf(doc, 'helvetica', 'bold', 6);
    col(doc, BLUE);
    doc.text(`${distKm} km`, midX, midY + 0.5, { align: 'center' });
  }

  // Pins
  for (const [px, label, side] of [
    [pinL, pickup   || 'Upphämtning', 'left'],
    [pinR, delivery || 'Leverans',    'right'],
  ]) {
    fill(doc, BLUE);
    strk(doc, BLUE);
    doc.setLineWidth(0.2);
    doc.circle(px, midY, 3.2, 'F');
    fill(doc, WHITE);
    doc.circle(px, midY, 1.3, 'F');

    // Direction label
    setf(doc, 'helvetica', 'bold', 5);
    col(doc, LIGHT);
    doc.text(side === 'left' ? 'FRAN' : 'TILL', px, y + 5, { align: 'center' });

    // Address label below pin
    setf(doc, 'helvetica', 'normal', 5.5);
    col(doc, DARK);
    const wrapped = doc.splitTextToSize(label, 34);
    doc.text(wrapped[0] ?? '', px, midY + 6.5, { align: 'center' });
    if (wrapped[1]) doc.text(wrapped[1], px, midY + 10.5, { align: 'center' });
  }
}

// ── Truck strip ───────────────────────────────────────────────────────────────
function drawTruckStrip(doc, y, vehicle) {
  const h = 30;
  fill(doc, OFFWHITE);
  strk(doc, PALE);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, y, CW, h, 2, 2, 'FD');

  // Photo placeholder
  const phW = 38, phH = h - 8, phX = M + 4, phY = y + 4;
  fill(doc, [226, 226, 222]);
  strk(doc, PALE);
  doc.roundedRect(phX, phY, phW, phH, 1.5, 1.5, 'FD');
  setf(doc, 'helvetica', 'normal', 5);
  col(doc, LIGHT);
  doc.text('FOTO', phX + phW / 2, phY + phH / 2 + 1.5, { align: 'center' });

  const infoX = phX + phW + 8;

  if (vehicle) {
    setf(doc, 'times', 'bold', 10);
    col(doc, BLACK);
    doc.text(vehicle.namn, infoX, y + 10);

    const cap = vehicle.maxLast_kg >= 1000
      ? (vehicle.maxLast_kg / 1000) + ' ton'
      : vehicle.maxLast_kg + ' kg';

    setf(doc, 'helvetica', 'normal', 7);
    col(doc, DARK);
    doc.text(`${vehicle.typ}  ·  ${cap}  ·  Euro ${vehicle.euro_klass}`, infoX, y + 16.5);

    setf(doc, 'helvetica', 'normal', 6);
    col(doc, MID);
    const desc = doc.splitTextToSize(vehicle.beskrivning ?? '', CW - phW - 18 - 58);
    doc.text(desc[0] ?? '', infoX, y + 22.5);

    // Reg plate
    const rpW = 28, rpH = 9, rpX = PW - M - rpW - 4, rpY = y + 5;
    fill(doc, WHITE);
    strk(doc, BLUE);
    doc.setLineWidth(0.6);
    doc.rect(rpX, rpY, rpW, rpH, 'FD');
    setf(doc, 'helvetica', 'bold', 8);
    col(doc, BLACK);
    doc.text(vehicle.reg, rpX + rpW / 2, rpY + 6, { align: 'center' });

    // LEZ badge
    if (vehicle.lez_godkänd) {
      const lzW = 24, lzH = 9, lzX = rpX - lzW - 4;
      fill(doc, [218, 248, 218]);
      strk(doc, [80, 180, 80]);
      doc.setLineWidth(0.3);
      doc.roundedRect(lzX, rpY, lzW, lzH, 1.2, 1.2, 'FD');
      setf(doc, 'helvetica', 'bold', 6);
      col(doc, [25, 115, 25]);
      doc.text('LEZ OK', lzX + lzW / 2, rpY + 6, { align: 'center' });
    }
  } else {
    setf(doc, 'helvetica', 'italic', 8);
    col(doc, LIGHT);
    doc.text('Fordon ej tilldelat / No vehicle assigned', infoX, y + 17);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export function generatePdf(data, quoteNumber, fleet = [], meta = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const today      = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 14);

  const vehicleId = data.fordon_rekommenderat;
  const vehicle   = fleet.find((v) => v.id === vehicleId) ?? null;
  const custCity  = cityOf(data.leverans || data.upphämtning || '');

  let y = M;

  // ── LETTERHEAD ────────────────────────────────────────────────────────────────

  // Logo mark
  fill(doc, BLUE);
  strk(doc, BLUE);
  doc.setLineWidth(0);
  doc.roundedRect(M, y, 14, 14, 2, 2, 'F');
  setf(doc, 'helvetica', 'bold', 10);
  col(doc, WHITE);
  doc.text('A', M + 7, y + 9.8, { align: 'center' });

  // Company name — large serif
  setf(doc, 'times', 'bold', 22);
  col(doc, BLACK);
  doc.text('KEMOFFS AKERI', M + 19, y + 9.5);

  setf(doc, 'helvetica', 'normal', 7);
  col(doc, MID);
  doc.text('och Entreprenad AB', M + 19, y + 14.5);

  // Contact block — right
  const RX = PW - M;
  const contacts = [
    'info@kemoffs.se',
    '08-123 456 78',
    'Industrivagen 12, 117 43 Stockholm',
  ];
  for (const [i, line] of contacts.entries()) {
    setf(doc, 'helvetica', 'normal', 6.5);
    col(doc, DARK);
    doc.text(line, RX, y + 4.5 + i * 4.8, { align: 'right' });
  }

  y += 21;

  // Org/VAT line
  setf(doc, 'helvetica', 'normal', 5.5);
  col(doc, LIGHT);
  doc.text(
    'Org.nr 556789-0123  ·  Momsreg.nr SE556789012301  ·  Godkand for F-skatt',
    M, y,
  );

  y += 6;
  blueDivider(doc, y);
  y += 9;

  // ── QUOTE META ────────────────────────────────────────────────────────────────

  const metaTop = y;

  // Left: transport details
  setf(doc, 'helvetica', 'bold', 5.5);
  col(doc, LIGHT);
  doc.text('TRANSPORTINFORMATION', M, y);
  y += 5;

  const detailRows = [
    ['Lasttyp',     data.lasttyp    || '—'],
    ['Upphamtning', data.upphämtning || '—'],
    ['Leverans',    data.leverans   || '—'],
    ['Datum',       data.datum      || '—'],
  ];

  for (const [lbl, val] of detailRows) {
    setf(doc, 'helvetica', 'normal', 6);
    col(doc, LIGHT);
    doc.text(lbl, M, y);
    setf(doc, 'helvetica', 'bold', 7.5);
    col(doc, BLACK);
    const line0 = doc.splitTextToSize(val, 62)[0] ?? val;
    doc.text(line0, M + 28, y);
    y += 5.5;
  }

  // Right: quote reference box
  const qBoxX = M + CW * 0.58;
  const qBoxW = CW * 0.42;
  fill(doc, [247, 247, 245]);
  strk(doc, PALE);
  doc.setLineWidth(0.25);
  doc.roundedRect(qBoxX, metaTop - 2, qBoxW, 40, 2, 2, 'FD');

  let qY = metaTop + 6;
  const qRows = [
    ['OFFERT NR',   quoteNumber ?? 'UTKAST', true,  BLUE],
    ['DATUM',       fmtDate(today),           false, BLACK],
    ['GILTIG TILL', fmtDate(validUntil),      false, BLACK],
  ];
  for (const [label, val, bold, valColor] of qRows) {
    setf(doc, 'helvetica', 'normal', 5.5);
    col(doc, LIGHT);
    doc.text(label, qBoxX + qBoxW / 2, qY, { align: 'center' });
    qY += 3.5;
    setf(doc, 'helvetica', bold ? 'bold' : 'normal', bold ? 10 : 7.5);
    col(doc, valColor);
    doc.text(String(val), qBoxX + qBoxW / 2, qY, { align: 'center' });
    qY += bold ? 7.5 : 5.5;
  }

  y = Math.max(y, metaTop + 42) + 3;
  hline(doc, y, PALE, 0.3);
  y += 7;

  // ── LINE ITEMS ────────────────────────────────────────────────────────────────

  const bränsle = Number(data.bränsle_kostnad)  || 0;
  const arbKost = Number(data.arbetstid_kostnad) || 0;
  const arbTim  = Number(data.arbetstid_timmar)  || 0;
  const total   = Number(data.totalpris_sek)     || 0;
  const avstand = Number(data.avstand_km)        || 0;
  const tKost   = Math.max(0, total - bränsle - arbKost);
  const perKm   = avstand > 0 ? tKost / avstand : 0;
  const perTim  = arbTim  > 0 ? arbKost / arbTim : 0;

  const items = [
    {
      desc:   `Transport — ${data.lasttyp || ''}${vehicleId ? ` (${vehicleId})` : ''}`,
      antal:  avstand > 0 ? `${avstand} km` : '1 st',
      apris:  avstand > 0 ? `${fmtSEK(perKm)}/km` : '—',
      belopp: tKost,
    },
    bränsle > 0 && {
      desc: 'Bransletillagg',
      antal: '1 st',
      apris: fmtSEK(bränsle),
      belopp: bränsle,
    },
    arbKost > 0 && {
      desc:   'Arbetstid',
      antal:  arbTim > 0 ? `${arbTim} tim` : '1 st',
      apris:  perTim > 0 ? `${fmtSEK(perTim)}/tim` : '—',
      belopp: arbKost,
    },
  ].filter(Boolean);

  const C = { desc: M, antal: M + 98, apris: M + 138, belopp: PW - M };

  // Column headers
  setf(doc, 'helvetica', 'bold', 6);
  col(doc, LIGHT);
  doc.text('BESKRIVNING', C.desc,   y);
  doc.text('ANTAL',       C.antal,  y, { align: 'right' });
  doc.text('A-PRIS',      C.apris,  y, { align: 'right' });
  doc.text('BELOPP',      C.belopp, y, { align: 'right' });
  y += 2.5;
  hline(doc, y, BLACK, 0.55);
  y += 6;

  // Rows
  items.forEach((row, i) => {
    const lines = doc.splitTextToSize(row.desc, 88);
    const rowH  = Math.max(lines.length * 5.2, 7.5);

    if (i % 2 === 1) {
      fill(doc, [247, 247, 245]);
      doc.rect(M - 1, y - 4, CW + 2, rowH + 2.5, 'F');
    }

    setf(doc, 'helvetica', 'normal', 8.5);
    col(doc, BLACK);
    doc.text(lines, C.desc, y);

    setf(doc, 'helvetica', 'normal', 8);
    col(doc, DARK);
    doc.text(row.antal,           C.antal,  y, { align: 'right' });
    doc.text(row.apris,           C.apris,  y, { align: 'right' });
    col(doc, BLACK);
    doc.text(fmtSEK(row.belopp), C.belopp, y, { align: 'right' });

    y += rowH;
    hline(doc, y, [232, 232, 228], 0.18);
    y += 2.5;
  });

  // Total row
  y += 4;
  hline(doc, y, BLACK, 0.6);
  y += 8;

  setf(doc, 'helvetica', 'bold', 7.5);
  col(doc, DARK);
  doc.text('TOTALT EXKL. MOMS / TOTAL EXCL. VAT', C.desc, y);

  setf(doc, 'helvetica', 'bold', 18);
  col(doc, BLUE);
  doc.text(fmtSEK(total), C.belopp, y + 1, { align: 'right' });

  y += 15;

  // Notes
  if (data.noteringar && String(data.noteringar).trim()) {
    setf(doc, 'helvetica', 'italic', 7);
    col(doc, MID);
    const noteLines = doc.splitTextToSize(String(data.noteringar), CW);
    doc.text(noteLines.slice(0, 2), M, y);
    y += noteLines.slice(0, 2).length * 4.5 + 5;
  }

  // Notices
  if (data.lez_varning) {
    fill(doc, [255, 251, 244]);
    strk(doc, [245, 158, 11]);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, 10, 1.2, 1.2, 'FD');
    setf(doc, 'helvetica', 'bold', 7);
    col(doc, [155, 75, 10]);
    doc.text(
      'LEZ - Destination inom Stockholms Miljözon. Kontrollera fordonets utsläppsklass.',
      M + 4, y + 6.5,
    );
    y += 14;
  }
  const needsPermit = data['tillstånd_krävs'] ?? data.tillstand_kravs ?? false;
  if (needsPermit) {
    fill(doc, [240, 242, 255]);
    strk(doc, BLUE);
    doc.setLineWidth(0.35);
    doc.roundedRect(M, y, CW, 10, 1.2, 1.2, 'FD');
    setf(doc, 'helvetica', 'normal', 7);
    col(doc, [43, 64, 160]);
    doc.text('OBS: Dispensansökan kan krävas för detta uppdrag.', M + 4, y + 6.5);
    y += 14;
  }

  // ── ROUTE MAP ─────────────────────────────────────────────────────────────────

  setf(doc, 'helvetica', 'bold', 5.5);
  col(doc, BLUE);
  doc.text('RUTT / ROUTE', M, y);
  y += 4;
  drawRouteMap(doc, y, data.upphämtning, data.leverans, data.avstand_km);
  y += 32;

  // ── TRUCK STRIP ───────────────────────────────────────────────────────────────

  setf(doc, 'helvetica', 'bold', 5.5);
  col(doc, BLUE);
  doc.text('TILLDELAT FORDON / ASSIGNED VEHICLE', M, y);
  y += 4;
  drawTruckStrip(doc, y, vehicle);

  // ── FOOTER ────────────────────────────────────────────────────────────────────

  const FY = PH - 20;
  blueDivider(doc, FY);

  setf(doc, 'helvetica', 'normal', 5.5);
  col(doc, LIGHT);
  doc.text(
    'Betalningsvillkor: 30 dagar netto  ·  Drojsmalspanta: referensranta + 8%  ·  Bankgiro: 123-4567',
    M, FY + 5,
  );
  doc.text(
    'Kemoffs Akeri och Entreprenad AB  ·  Org.nr 556789-0123  ·  Godkand for F-skatt',
    M, FY + 9.5,
  );

  setf(doc, 'times', 'italic', 7);
  col(doc, MID);
  doc.text(
    'Tack for ditt fortroende.  /  Thank you for your business.',
    PW - M, FY + 5.5, { align: 'right' },
  );

  // AI attestation line — liability shield
  const userName    = meta.userName    ?? 'Okand';
  const modelShort  = (meta.modelUsed  ?? 'claude-sonnet-4').replace(/-\d{8}$/, '');
  const genDate     = meta.generatedAt ?? new Date().toISOString().slice(0, 10);
  setf(doc, 'helvetica', 'normal', 5);
  col(doc, [150, 150, 145]);
  doc.text(
    `Offert genererad med AI-stod, version ${modelShort} ${genDate}. Verifierad av ${userName}. / Quote generated with AI assistance, verified by ${userName}.`,
    M, FY + 11,
  );

  // ── SAVE ──────────────────────────────────────────────────────────────────────

  const numPart = String(quoteNumber ?? 'UTKAST').replace(/[^a-zA-Z0-9]/g, '-');
  doc.save(`Offer-${numPart}-${custCity}.pdf`);
}
