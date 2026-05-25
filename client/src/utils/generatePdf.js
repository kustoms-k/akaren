import { jsPDF } from 'jspdf';

// ── Palette ────────────────────────────────────────────────────────────────────
const INDIGO  = [99, 102, 241];
const BLACK   = [26, 26, 26];
const DARK    = [60, 60, 60];
const MID     = [110, 110, 110];
const LIGHT   = [160, 160, 160];
const PALE    = [215, 215, 210];
const WHITE   = [255, 255, 255];
const OFFWHITE= [250, 250, 248];

// ── Layout ─────────────────────────────────────────────────────────────────────
const PW = 210;
const PH = 297;
const M  = 18;
const CW = PW - M * 2;   // 174 mm

// ── Helpers ────────────────────────────────────────────────────────────────────
const setf = (doc, fam, sty, sz) => { doc.setFont(fam, sty); doc.setFontSize(sz); };
const col  = (doc, a)            => doc.setTextColor(...a);
const fill = (doc, a)            => doc.setFillColor(...a);
const strk = (doc, a)            => doc.setDrawColor(...a);

function hline(doc, y, color = PALE, lw = 0.25) {
  strk(doc, color);
  doc.setLineWidth(lw);
  doc.line(M, y, PW - M, y);
}

function indigoDivider(doc, y) {
  strk(doc, INDIGO);
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

function firstWord(name) {
  return sanitise(String(name ?? '').trim().split(/\s+/)[0] || 'Kund');
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

  fill(doc, [245, 245, 248]);
  strk(doc, PALE);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, y, CW, h, 2, 2, 'FD');

  strk(doc, INDIGO);
  doc.setLineDashPattern([1.8, 1.4], 0);
  doc.setLineWidth(0.45);
  doc.line(pinL + 4, midY, pinR - 4, midY);
  doc.setLineDashPattern([], 0);

  const midX = (pinL + pinR) / 2;
  if (distKm && !isNaN(distKm)) {
    fill(doc, WHITE);
    strk(doc, PALE);
    doc.setLineWidth(0.2);
    doc.roundedRect(midX - 10, midY - 4, 20, 7, 1, 1, 'FD');
    setf(doc, 'helvetica', 'bold', 6);
    col(doc, INDIGO);
    doc.text(`${distKm} km`, midX, midY + 0.5, { align: 'center' });
  }

  for (const [px, label, side] of [
    [pinL, pickup   || 'Upphamtning', 'left'],
    [pinR, delivery || 'Leverans',    'right'],
  ]) {
    fill(doc, INDIGO);
    strk(doc, INDIGO);
    doc.setLineWidth(0.2);
    doc.circle(px, midY, 3.2, 'F');
    fill(doc, WHITE);
    doc.circle(px, midY, 1.3, 'F');

    setf(doc, 'helvetica', 'bold', 5);
    col(doc, LIGHT);
    doc.text(side === 'left' ? 'FRAN' : 'TILL', px, y + 5, { align: 'center' });

    setf(doc, 'helvetica', 'normal', 5.5);
    col(doc, DARK);
    const wrapped = doc.splitTextToSize(label, 34);
    doc.text(wrapped[0] ?? '', px, midY + 6.5, { align: 'center' });
    if (wrapped[1]) doc.text(wrapped[1], px, midY + 10.5, { align: 'center' });
  }
}

// ── Truck strip ───────────────────────────────────────────────────────────────
function drawTruckStrip(doc, y, vehicle, fordanStr) {
  const h = 30;
  fill(doc, OFFWHITE);
  strk(doc, PALE);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, y, CW, h, 2, 2, 'FD');

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

    const rpW = 28, rpH = 9, rpX = PW - M - rpW - 4, rpY = y + 5;
    fill(doc, WHITE);
    strk(doc, INDIGO);
    doc.setLineWidth(0.6);
    doc.rect(rpX, rpY, rpW, rpH, 'FD');
    setf(doc, 'helvetica', 'bold', 8);
    col(doc, BLACK);
    doc.text(vehicle.reg, rpX + rpW / 2, rpY + 6, { align: 'center' });

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
  } else if (fordanStr) {
    // No fleet record but we have the recommendation string
    const parts = String(fordanStr).split('·').map((s) => s.trim());
    setf(doc, 'times', 'bold', 10);
    col(doc, BLACK);
    doc.text(parts.slice(0, 2).join(' · '), infoX, y + 12);
    if (parts[2]) {
      setf(doc, 'helvetica', 'normal', 7);
      col(doc, DARK);
      doc.text(parts[2], infoX, y + 18.5);
    }
    setf(doc, 'helvetica', 'italic', 6.5);
    col(doc, LIGHT);
    doc.text('Reg.nr bekraftas vid bokning', infoX, y + 24.5);
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

  const vehicleId  = data.fordon_rekommenderat;
  const vehicle    = fleet.find((v) => v.id === vehicleId) ?? null;
  const kundnamn   = data.kund_namn
    ? firstWord(data.kund_namn)
    : cityOf(data.leverans || data.upphämtning || '');

  // ── Derived pricing ───────────────────────────────────────────────────────
  const bränsle    = Number(data.bränsle_kostnad)  || 0;
  const arbKost    = Number(data.arbetstid_kostnad) || 0;
  const arbTim     = Number(data.arbetstid_timmar)  || 0;
  const loadKost   = Number(data.loading_kostnad)   || 0;
  const total_excl = Number(data.totalpris_sek)     || 0;
  const avstand    = Number(data.avstand_km)        || 0;
  const moms_25    = Math.round(total_excl * 0.25);
  const total_inkl = total_excl + moms_25;
  const transBase  = Math.max(0, total_excl - bränsle - arbKost - loadKost);
  const perKm      = avstand > 0 ? transBase / avstand : 0;
  const perTim     = arbTim  > 0 ? arbKost   / arbTim  : 0;

  // ── Company fields from caller (tenant-safe) ─────────────────────────────
  const co         = meta.company ?? {};
  const coName     = co.name      ?? 'Transportföretag';
  const coEmail    = co.email     ?? '';
  const coPhone    = co.phone     ?? '';
  const coAddress  = co.address   ?? '';
  const coOrgNr    = co.org_nr    ?? '';
  const coBankgiro = co.bankgiro  ?? '';
  const coMoms     = coOrgNr ? 'SE' + coOrgNr.replace(/[^0-9]/g, '') + '01' : '';

  let y = M;

  // ── LETTERHEAD ────────────────────────────────────────────────────────────

  // Logo mark — first letter of company name
  fill(doc, INDIGO);
  strk(doc, INDIGO);
  doc.setLineWidth(0);
  doc.roundedRect(M, y, 14, 14, 2, 2, 'F');
  setf(doc, 'helvetica', 'bold', 11);
  col(doc, WHITE);
  doc.text(coName.charAt(0).toUpperCase(), M + 7, y + 9.8, { align: 'center' });

  // Company name
  setf(doc, 'times', 'bold', 16);
  col(doc, BLACK);
  doc.text(coName.toUpperCase(), M + 18, y + 10);

  // Contact block — right-aligned
  const RX = PW - M;
  for (const [i, line] of [coEmail, coPhone, coAddress].filter(Boolean).entries()) {
    setf(doc, 'helvetica', 'normal', 6.5);
    col(doc, DARK);
    doc.text(line, RX, y + 4 + i * 5, { align: 'right' });
  }

  y += 20;

  // Org / VAT line
  const orgLine = [
    coOrgNr ? `Org.nr ${coOrgNr}` : null,
    coMoms  ? `Momsreg.nr ${coMoms}` : null,
    'Godkand for F-skatt',
  ].filter(Boolean).join('  ·  ');
  setf(doc, 'helvetica', 'normal', 5.5);
  col(doc, LIGHT);
  doc.text(orgLine, M, y);
  y += 5;
  indigoDivider(doc, y);
  y += 9;

  // ── CUSTOMER + QUOTE META ─────────────────────────────────────────────────

  const metaTop = y;

  // Left: customer block
  setf(doc, 'helvetica', 'bold', 5.5);
  col(doc, LIGHT);
  doc.text('KUND / MOTTAGARE', M, y);
  y += 5;

  if (data.kund_namn) {
    setf(doc, 'helvetica', 'bold', 9);
    col(doc, BLACK);
    doc.text(String(data.kund_namn), M, y);
    y += 5;
  }
  if (data.kund_email) {
    setf(doc, 'helvetica', 'normal', 7);
    col(doc, DARK);
    doc.text(String(data.kund_email), M, y);
    y += 4.5;
  }
  if (data.kund_telefon) {
    setf(doc, 'helvetica', 'normal', 7);
    col(doc, DARK);
    doc.text(String(data.kund_telefon), M, y);
    y += 4.5;
  }
  if (!data.kund_namn && !data.kund_email && !data.kund_telefon) {
    setf(doc, 'helvetica', 'italic', 7);
    col(doc, LIGHT);
    doc.text('Kontaktuppgifter ej angivna', M, y);
    y += 5;
  }

  // Right: quote reference box
  const qBoxX = M + CW * 0.58;
  const qBoxW = CW * 0.42;

  fill(doc, [247, 247, 252]);
  strk(doc, [215, 215, 235]);
  doc.setLineWidth(0.3);
  doc.roundedRect(qBoxX, metaTop - 2, qBoxW, 44, 2, 2, 'FD');

  // Indigo accent bar at top of box
  fill(doc, INDIGO);
  doc.roundedRect(qBoxX, metaTop - 2, qBoxW, 3, 2, 2, 'F');
  doc.rect(qBoxX, metaTop + 0.5, qBoxW, 1, 'F');

  let qY = metaTop + 8;
  const qRows = [
    ['OFFERT NR',   quoteNumber ?? 'UTKAST', true,  INDIGO],
    ['DATUM',       fmtDate(today),           false, BLACK],
    ['GILTIG TILL', fmtDate(validUntil),      false, BLACK],
  ];
  for (const [label, val, big, valColor] of qRows) {
    setf(doc, 'helvetica', 'bold', 5);
    col(doc, LIGHT);
    doc.text(label, qBoxX + qBoxW / 2, qY, { align: 'center' });
    qY += 3;
    setf(doc, 'helvetica', big ? 'bold' : 'normal', big ? 11 : 7.5);
    col(doc, valColor);
    doc.text(String(val), qBoxX + qBoxW / 2, qY, { align: 'center' });
    qY += big ? 8 : 6;
  }

  y = Math.max(y, metaTop + 46) + 2;
  hline(doc, y, PALE, 0.3);
  y += 7;

  // ── TRANSPORT DETAILS ─────────────────────────────────────────────────────

  setf(doc, 'helvetica', 'bold', 5.5);
  col(doc, LIGHT);
  doc.text('TRANSPORTINFORMATION', M, y);
  y += 5;

  const lasttypVal = [data.lasttyp, data.vikt].filter(Boolean).join('  ·  ') || '—';
  const detailRows = [
    ['Lasttyp',      lasttypVal],
    ['Upphamtning',  data.upphämtning || '—'],
    ['Leverans',     data.leverans    || '—'],
    ['Datum',        data.datum       || '—'],
    ['Fordon',       data.fordon_rekommenderat || '—'],
    ['Avstand',      avstand ? `${avstand} km` : '—'],
  ];

  for (const [lbl, val] of detailRows) {
    setf(doc, 'helvetica', 'normal', 6);
    col(doc, LIGHT);
    doc.text(lbl, M, y);

    setf(doc, 'helvetica', 'bold', 7.5);
    col(doc, BLACK);
    const line0 = doc.splitTextToSize(String(val), CW * 0.56)[0] ?? String(val);
    doc.text(line0, M + 30, y);
    y += 5;
  }

  y += 3;
  hline(doc, y, PALE, 0.3);
  y += 7;

  // ── LINE ITEMS TABLE ──────────────────────────────────────────────────────

  const items = [
    {
      desc:   `Transport — ${data.lasttyp || ''}${vehicleId ? ` (${String(vehicleId).split('·')[0].trim()})` : ''}`,
      antal:  avstand > 0 ? `${avstand} km` : '1 st',
      apris:  avstand > 0 ? `${fmtSEK(perKm)}/km` : '—',
      belopp: transBase,
    },
    bränsle > 0 && {
      desc:   'Bransletillagg',
      antal:  avstand > 0 ? `${avstand} km` : '1 st',
      apris:  avstand > 0 ? `${fmtSEK(bränsle / avstand)}/km` : fmtSEK(bränsle),
      belopp: bränsle,
    },
    arbKost > 0 && {
      desc:   'Arbetstid',
      antal:  arbTim > 0 ? `${arbTim} tim` : '1 st',
      apris:  perTim > 0 ? `${fmtSEK(perTim)}/tim` : '—',
      belopp: arbKost,
    },
    loadKost > 0 && {
      desc:   'Lastning / Lossning',
      antal:  '1 st',
      apris:  fmtSEK(loadKost),
      belopp: loadKost,
    },
  ].filter(Boolean);

  const C = { desc: M, antal: M + 98, apris: M + 136, belopp: PW - M };

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

  // Line rows
  items.forEach((row, i) => {
    const lines = doc.splitTextToSize(row.desc, 88);
    const rowH  = Math.max(lines.length * 5.2, 7.5);

    if (i % 2 === 1) {
      fill(doc, [247, 247, 252]);
      doc.rect(M - 1, y - 4.5, CW + 2, rowH + 3, 'F');
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
    hline(doc, y, [232, 232, 230], 0.18);
    y += 3;
  });

  y += 4;
  hline(doc, y, BLACK, 0.5);
  y += 7;

  // ── TOTALS BLOCK ──────────────────────────────────────────────────────────

  const totX  = C.apris;
  const totVX = C.belopp;

  // Summa excl moms
  setf(doc, 'helvetica', 'normal', 7.5);
  col(doc, DARK);
  doc.text('Summa exkl. moms', totX, y, { align: 'right' });
  col(doc, BLACK);
  doc.text(fmtSEK(total_excl), totVX, y, { align: 'right' });
  y += 6;

  // Moms 25%
  setf(doc, 'helvetica', 'normal', 7.5);
  col(doc, DARK);
  doc.text('Moms 25 %', totX, y, { align: 'right' });
  col(doc, BLACK);
  doc.text(fmtSEK(moms_25), totVX, y, { align: 'right' });
  y += 5;

  indigoDivider(doc, y);
  y += 8;

  // Totalt inkl moms — large
  setf(doc, 'helvetica', 'bold', 7.5);
  col(doc, DARK);
  doc.text('TOTALT INKL. MOMS', totX, y, { align: 'right' });
  setf(doc, 'helvetica', 'bold', 18);
  col(doc, INDIGO);
  doc.text(fmtSEK(total_inkl), totVX, y + 1, { align: 'right' });
  y += 14;

  // ── NOTES ─────────────────────────────────────────────────────────────────

  if (data.noteringar && String(data.noteringar).trim()) {
    setf(doc, 'helvetica', 'italic', 7);
    col(doc, MID);
    const noteLines = doc.splitTextToSize(String(data.noteringar), CW);
    doc.text(noteLines.slice(0, 3), M, y);
    y += noteLines.slice(0, 3).length * 4.5 + 5;
  }

  // ── NOTICES ───────────────────────────────────────────────────────────────

  if (data.lez_varning) {
    fill(doc, [255, 251, 244]);
    strk(doc, [245, 158, 11]);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, 11, 1.5, 1.5, 'FD');
    setf(doc, 'helvetica', 'bold', 7);
    col(doc, [155, 75, 10]);
    doc.text(
      'LEZ — Destination inom Stockholms Miljözon. Kontrollera fordonets utslappsklass.',
      M + 4, y + 7,
    );
    y += 15;
  }

  const needsPermit = data['tillstånd_krävs'] ?? data.tillstand_kravs ?? false;
  if (needsPermit) {
    fill(doc, [240, 242, 255]);
    strk(doc, INDIGO);
    doc.setLineWidth(0.35);
    doc.roundedRect(M, y, CW, 11, 1.5, 1.5, 'FD');
    setf(doc, 'helvetica', 'normal', 7);
    col(doc, [43, 64, 160]);
    doc.text(
      'OBS: Dispenstillstand kan kravas for detta uppdrag (vikt / bredd / langd).',
      M + 4, y + 7,
    );
    y += 15;
  }

  // ── ROUTE MAP ─────────────────────────────────────────────────────────────

  setf(doc, 'helvetica', 'bold', 5.5);
  col(doc, INDIGO);
  doc.text('RUTT / ROUTE', M, y);
  y += 4;
  drawRouteMap(doc, y, data.upphämtning, data.leverans, data.avstand_km);
  y += 33;

  // ── TRUCK STRIP ───────────────────────────────────────────────────────────

  setf(doc, 'helvetica', 'bold', 5.5);
  col(doc, INDIGO);
  doc.text('TILLDELAT FORDON / ASSIGNED VEHICLE', M, y);
  y += 4;
  drawTruckStrip(doc, y, vehicle, data.fordon_rekommenderat);

  // ── FOOTER ────────────────────────────────────────────────────────────────

  const FY = PH - 22;
  indigoDivider(doc, FY);

  setf(doc, 'helvetica', 'normal', 6);
  col(doc, MID);
  doc.text(
    ['Betalningsvillkor: 30 dagar netto', 'Drojsmalspanta: referensranta + 8%', coBankgiro ? `Bankgiro: ${coBankgiro}` : null].filter(Boolean).join('  ·  '),
    M, FY + 5.5,
  );
  doc.text(
    [coName, coOrgNr ? `Org.nr ${coOrgNr}` : null, coMoms ? `Momsreg.nr ${coMoms}` : null, 'Godkand for F-skatt'].filter(Boolean).join('  ·  '),
    M, FY + 10.5,
  );

  setf(doc, 'helvetica', 'normal', 5);
  col(doc, LIGHT);
  const userName   = meta.userName    ?? 'Okand';
  const modelShort = (meta.modelUsed  ?? 'claude-sonnet-4').replace(/-\d{8}$/, '');
  const genDate    = meta.generatedAt ?? new Date().toISOString().slice(0, 10);
  doc.text(
    `Offert genererad med AI-stod (${modelShort}, ${genDate}). Verifierad och godkand av ${userName}. / AI-assisted quote, verified by ${userName}.`,
    M, FY + 15.5,
  );

  setf(doc, 'helvetica', 'normal', 5.5);
  col(doc, LIGHT);
  doc.text('Sida 1 av 1', PW - M, FY + 10.5, { align: 'right' });

  // ── SAVE ──────────────────────────────────────────────────────────────────

  const numPart = String(quoteNumber ?? 'UTKAST').replace(/[^a-zA-Z0-9]/g, '-');
  doc.save(`Offert-${numPart}-${kundnamn}.pdf`);
}
