import { jsPDF } from 'jspdf';

// ── Palette ────────────────────────────────────────────────────────────────────
const SLATE  = [45,  51,  64];   // #2d3340 — single accent
const BLACK  = [18,  22,  28];
const BODY   = [45,  55,  68];
const MID    = [95, 108, 124];
const MUTED  = [148, 158, 172];
const RULE   = [212, 216, 222];
const TINT   = [247, 248, 249];
const WHITE  = [255, 255, 255];

const PW = 210;
const PH = 297;
const M  = 20;
const CW = PW - M * 2;   // 170 mm

// ── Helpers ────────────────────────────────────────────────────────────────────
const setf = (doc, fam, sty, sz) => { doc.setFont(fam, sty); doc.setFontSize(sz); };
const col  = (doc, a) => doc.setTextColor(...a);
const fill = (doc, a) => doc.setFillColor(...a);
const strk = (doc, a) => doc.setDrawColor(...a);

function hline(doc, y, c = RULE, lw = 0.22) {
  strk(doc, c); doc.setLineWidth(lw); doc.line(M, y, PW - M, y);
}

function accentLine(doc, y) {
  strk(doc, SLATE); doc.setLineWidth(0.65); doc.line(M, y, PW - M, y);
}

const fmtSEK = (n) =>
  new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(n ?? 0) + ' kr';

const fmtDateSv = (d) => {
  try {
    return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch { return '—'; }
};

// Strip combining diacritical marks — jsPDF standard fonts are Latin-1 only
function safe(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function slugify(s) {
  return String(s || 'kund')
    .replace(/[^a-zA-Z0-9åäöÅÄÖ\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'kund';
}

function cityOf(addr) {
  if (!addr) return 'kund';
  const parts = String(addr).split(',');
  return slugify((parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim())
    .split('-').slice(0, 2).join('-') || 'kund';
}

// ── Route strip ────────────────────────────────────────────────────────────────
function drawRouteStrip(doc, y, pickup, delivery, distKm) {
  const h = 22, midY = y + h / 2;
  fill(doc, TINT); strk(doc, RULE); doc.setLineWidth(0.2);
  doc.roundedRect(M, y, CW, h, 2, 2, 'FD');

  const pinL = M + 18, pinR = PW - M - 18, midX = (pinL + pinR) / 2;

  strk(doc, SLATE); doc.setLineDashPattern([1.6, 1.2], 0);
  doc.setLineWidth(0.4); doc.line(pinL + 3.5, midY, pinR - 3.5, midY);
  doc.setLineDashPattern([], 0);

  if (distKm && !isNaN(Number(distKm))) {
    fill(doc, WHITE); strk(doc, RULE); doc.setLineWidth(0.2);
    doc.roundedRect(midX - 9, midY - 3.5, 18, 6.5, 1, 1, 'FD');
    setf(doc, 'helvetica', 'bold', 5.5); col(doc, SLATE);
    doc.text(`${distKm} km`, midX, midY + 0.5, { align: 'center' });
  }

  for (const [px, label, tag] of [
    [pinL, pickup   || 'Upphamtning', 'FRAN'],
    [pinR, delivery || 'Leverans',    'TILL'],
  ]) {
    fill(doc, SLATE); strk(doc, SLATE); doc.setLineWidth(0.15);
    doc.circle(px, midY, 2.8, 'F');
    fill(doc, WHITE); doc.circle(px, midY, 1.1, 'F');
    setf(doc, 'helvetica', 'bold', 4.5); col(doc, MUTED);
    doc.text(tag, px, y + 4.5, { align: 'center' });
    setf(doc, 'helvetica', 'normal', 5.5); col(doc, BODY);
    const wrapped = doc.splitTextToSize(safe(label), 30);
    doc.text(wrapped[0] ?? '', px, midY + 6, { align: 'center' });
  }
}

// ── Main export ────────────────────────────────────────────────────────────────
export function generatePdf(data, quoteNumber, fleet = [], meta = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const today      = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 14);

  const vehicleId  = data.fordon_rekommenderat;
  const vehicle    = fleet.find((v) => v.id === vehicleId) ?? null;
  const kundSlug   = data.kund_namn
    ? slugify(String(data.kund_namn).trim().split(/\s+/)[0])
    : cityOf(data.leverans || data.upphämtning || '');

  const bränsle      = Number(data.bränsle_kostnad)     || 0;
  const arbKost      = Number(data.arbetstid_kostnad)    || 0;
  const arbTim       = Number(data.arbetstid_timmar)     || 0;
  const loadKost     = Number(data.loading_kostnad)      || 0;
  const framkKost    = Number(data.framkorning_kostnad)  || 0;
  const total_excl   = Number(data.totalpris_sek)        || 0;
  const avstand      = Number(data.avstand_km)           || 0;
  const moms_25      = Math.round(total_excl * 0.25);
  const total_inkl   = total_excl + moms_25;
  const transBase    = Math.max(0, total_excl - bränsle - arbKost - loadKost - framkKost);
  const perKm        = avstand > 0 ? transBase / avstand : 0;
  const perTim       = arbTim  > 0 ? arbKost   / arbTim  : 0;
  const bränslePerKm = avstand > 0 ? bränsle   / avstand : 0;

  const co          = meta.company  ?? {};
  const coName      = co.name       ?? 'Transportforetag';
  const coEmail     = co.email      ?? '';
  const coPhone     = co.phone      ?? '';
  const coAddress   = co.address    ?? '';
  const coOrgNr     = co.org_nr     ?? '';
  const coBankgiro  = co.bankgiro   ?? '';
  const coMomsNr    = coOrgNr ? 'SE' + coOrgNr.replace(/[^0-9]/g, '') + '01' : '';
  const dispatcher  = meta.userName ?? '';

  let y = M;

  // ════════════════════════════════════════════════════════════════
  // 1. LETTERHEAD
  // ════════════════════════════════════════════════════════════════

  // Logo square
  fill(doc, SLATE); strk(doc, SLATE); doc.setLineWidth(0);
  doc.roundedRect(M, y, 13, 13, 1.5, 1.5, 'F');
  setf(doc, 'helvetica', 'bold', 9.5); col(doc, WHITE);
  doc.text(safe(coName).charAt(0).toUpperCase(), M + 6.5, y + 9.2, { align: 'center' });

  // Company name — large serif
  setf(doc, 'times', 'bold', 20); col(doc, BLACK);
  doc.text(safe(coName).toUpperCase(), M + 17, y + 9.5);

  // Contact block — right-aligned
  const RX = PW - M;
  [coAddress, coPhone, coEmail].filter(Boolean).forEach((line, i) => {
    setf(doc, 'helvetica', 'normal', 6); col(doc, MID);
    doc.text(safe(line), RX, y + 3 + i * 4.8, { align: 'right' });
  });

  y += 17;

  // Org.nr · Momsreg.nr · F-skatt
  const regLine = [
    coOrgNr  ? `Org.nr ${coOrgNr}` : null,
    coMomsNr ? `Momsreg.nr ${coMomsNr}` : null,
    'Godkand for F-skatt',
  ].filter(Boolean).join('  ·  ');
  setf(doc, 'helvetica', 'normal', 5.5); col(doc, MUTED);
  doc.text(regLine, M, y);
  y += 4.5;
  accentLine(doc, y);
  y += 9;

  // ════════════════════════════════════════════════════════════════
  // 2. OFFERT TITLE + NUMBER BOX
  // ════════════════════════════════════════════════════════════════

  setf(doc, 'times', 'bold', 28); col(doc, BLACK);
  doc.text('OFFERT', M, y + 9);

  // Number box — right side
  const nbW = 60, nbH = 18, nbX = PW - M - nbW;
  fill(doc, TINT); strk(doc, RULE); doc.setLineWidth(0.25);
  doc.roundedRect(nbX, y - 1, nbW, nbH, 2, 2, 'FD');
  fill(doc, SLATE); doc.setLineWidth(0);
  doc.roundedRect(nbX, y - 1, nbW, 3, 2, 2, 'F');
  doc.rect(nbX, y + 1.5, nbW, 0.5, 'F');
  setf(doc, 'helvetica', 'bold', 4.5); col(doc, MUTED);
  doc.text('OFFERT NR', nbX + nbW / 2, y + 4.5, { align: 'center' });
  setf(doc, 'helvetica', 'bold', 11); col(doc, SLATE);
  doc.text(String(quoteNumber ?? 'UTKAST'), nbX + nbW / 2, y + 11, { align: 'center' });

  y += 12;
  setf(doc, 'helvetica', 'normal', 6); col(doc, MID);
  doc.text(`Datum: ${fmtDateSv(today)}   Giltig t.o.m.: ${fmtDateSv(validUntil)}`, M, y + 2);
  y += 8;
  hline(doc, y);
  y += 7;

  // ════════════════════════════════════════════════════════════════
  // 3. MOTTAGARE (left) + TRANSPORTUPPDRAG (right)
  // ════════════════════════════════════════════════════════════════

  const secTop = y;
  const RHalf  = M + CW * 0.52;

  // Left column — recipient
  setf(doc, 'helvetica', 'bold', 5); col(doc, MUTED);
  doc.text('MOTTAGARE', M, y);
  y += 5;

  if (data.kund_namn) {
    setf(doc, 'times', 'bold', 10); col(doc, BLACK);
    doc.text(safe(String(data.kund_namn)), M, y); y += 5.5;
  }
  if (data.kund_email) {
    setf(doc, 'helvetica', 'normal', 7); col(doc, BODY);
    doc.text(safe(String(data.kund_email)), M, y); y += 4.5;
  }
  if (data.kund_telefon) {
    setf(doc, 'helvetica', 'normal', 7); col(doc, BODY);
    doc.text(safe(String(data.kund_telefon)), M, y); y += 4.5;
  }
  if (!data.kund_namn && !data.kund_email && !data.kund_telefon) {
    setf(doc, 'helvetica', 'italic', 7); col(doc, MUTED);
    doc.text('Kontaktuppgifter ej angivna', M, y); y += 5;
  }

  // Right column — transport brief
  let rY = secTop;
  setf(doc, 'helvetica', 'bold', 5); col(doc, MUTED);
  doc.text('TRANSPORTUPPDRAG', RHalf, rY);
  rY += 5;

  const lasttypVal = [data.lasttyp, data.vikt].filter(Boolean).join(' · ') || '—';
  const vehicleLabel = vehicle
    ? safe(`${vehicle.namn}${vehicle.reg ? ' · ' + vehicle.reg : ''}`)
    : data.fordon_rekommenderat
      ? safe(String(data.fordon_rekommenderat).split('·')[0].trim())
      : '—';

  const rightColW = PW - M - RHalf - 2;
  for (const [lbl, val] of [
    ['Lasttyp',     lasttypVal],
    ['Upphamtning', data.upphämtning || '—'],
    ['Leverans',    data.leverans    || '—'],
    ['Datum',       data.datum       || '—'],
    ['Avstand',     avstand ? `${avstand} km` : '—'],
    ['Fordon',      vehicleLabel],
  ]) {
    setf(doc, 'helvetica', 'normal', 6); col(doc, MUTED);
    doc.text(lbl, RHalf, rY);
    setf(doc, 'helvetica', 'bold', 7); col(doc, BLACK);
    const v0 = doc.splitTextToSize(safe(String(val)), rightColW)[0] ?? safe(String(val));
    doc.text(v0, PW - M, rY, { align: 'right' });
    rY += 5;
  }

  y = Math.max(y, rY) + 5;
  hline(doc, y);
  y += 8;

  // ════════════════════════════════════════════════════════════════
  // 4. LINE ITEMS TABLE
  // ════════════════════════════════════════════════════════════════

  const C = { desc: M, antal: M + 96, apris: M + 136, belopp: PW - M };

  setf(doc, 'helvetica', 'bold', 5.5); col(doc, MUTED);
  doc.text('BESKRIVNING', C.desc,   y);
  doc.text('ANTAL',       C.antal,  y, { align: 'right' });
  doc.text('APRIS',       C.apris,  y, { align: 'right' });
  doc.text('BELOPP',      C.belopp, y, { align: 'right' });
  y += 2.5;
  strk(doc, SLATE); doc.setLineWidth(0.55); doc.line(M, y, PW - M, y);
  y += 6;

  const items = [
    {
      desc:   data.lasttyp
        ? `Transport — ${safe(String(data.lasttyp))}`
        : 'Transport',
      antal:  avstand > 0 ? `${avstand} km` : '1 st',
      apris:  avstand > 0 && perKm > 0 ? `${fmtSEK(perKm)}/km` : '—',
      belopp: transBase,
    },
    framkKost > 0 && {
      desc:   'Framkorning',
      antal:  '1 st',
      apris:  fmtSEK(framkKost),
      belopp: framkKost,
    },
    bränsle > 0 && {
      desc:   'Drivmedelstillagg',
      antal:  avstand > 0 ? `${avstand} km` : '1 st',
      apris:  bränslePerKm > 0 ? `${fmtSEK(bränslePerKm)}/km` : fmtSEK(bränsle),
      belopp: bränsle,
    },
    arbKost > 0 && {
      desc:   arbTim > 0 ? `Arbetstidskostnad (${arbTim} tim)` : 'Arbetstidskostnad',
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

  items.forEach((row, i) => {
    const lines = doc.splitTextToSize(safe(row.desc), 88);
    const rowH  = Math.max(lines.length * 5.2, 7.5);
    if (i % 2 === 1) {
      fill(doc, TINT); strk(doc, TINT); doc.setLineWidth(0);
      doc.rect(M - 1, y - 4.5, CW + 2, rowH + 3, 'F');
    }
    setf(doc, 'helvetica', 'normal', 8.5); col(doc, BLACK);
    doc.text(lines, C.desc, y);
    setf(doc, 'helvetica', 'normal', 8); col(doc, BODY);
    doc.text(String(row.antal),      C.antal,  y, { align: 'right' });
    doc.text(String(row.apris),      C.apris,  y, { align: 'right' });
    col(doc, BLACK);
    doc.text(fmtSEK(row.belopp),    C.belopp, y, { align: 'right' });
    y += rowH;
    hline(doc, y, RULE, 0.18);
    y += 3;
  });

  y += 5;
  hline(doc, y, SLATE, 0.5);
  y += 7;

  // ════════════════════════════════════════════════════════════════
  // 5. TOTALS
  // ════════════════════════════════════════════════════════════════

  const tLX = C.apris, tRX = C.belopp;

  setf(doc, 'helvetica', 'normal', 7.5); col(doc, MID);
  doc.text('Summa exkl. moms', tLX, y, { align: 'right' });
  setf(doc, 'helvetica', 'bold', 8); col(doc, BLACK);
  doc.text(fmtSEK(total_excl), tRX, y, { align: 'right' });
  y += 6;

  setf(doc, 'helvetica', 'normal', 7.5); col(doc, MID);
  doc.text('Moms 25 %', tLX, y, { align: 'right' });
  setf(doc, 'helvetica', 'normal', 8); col(doc, BODY);
  doc.text(fmtSEK(moms_25), tRX, y, { align: 'right' });
  y += 6;

  // ATT BETALA — dark filled box, unmissable
  const tbW = 88, tbX = PW - M - tbW;
  fill(doc, SLATE); strk(doc, SLATE); doc.setLineWidth(0);
  doc.roundedRect(tbX, y, tbW, 16, 2, 2, 'F');
  setf(doc, 'helvetica', 'bold', 5.5); col(doc, WHITE);
  doc.text('ATT BETALA (inkl. moms)', tbX + 5, y + 5.5);
  setf(doc, 'times', 'bold', 17); col(doc, WHITE);
  doc.text(fmtSEK(total_inkl), PW - M - 4, y + 13, { align: 'right' });
  y += 22;

  // RUT / ROT note if applicable
  if (data.rut_avdrag || data.rot_avdrag) {
    setf(doc, 'helvetica', 'italic', 6.5); col(doc, MID);
    doc.text(
      data.rut_avdrag
        ? 'RUT-avdrag kan galla — kunden ansoker direkt via Skatteverket.'
        : 'ROT-avdrag kan galla — kunden ansoker direkt via Skatteverket.',
      M, y,
    );
    y += 6;
  }

  // Free-text notes
  if (data.noteringar && String(data.noteringar).trim()) {
    const noteLines = doc.splitTextToSize(safe(String(data.noteringar)), CW);
    setf(doc, 'helvetica', 'italic', 7); col(doc, MID);
    doc.text(noteLines.slice(0, 3), M, y);
    y += noteLines.slice(0, 3).length * 4.5 + 4;
  }

  // LEZ warning
  if (data.lez_varning) {
    fill(doc, [255, 251, 244]); strk(doc, [220, 175, 55]); doc.setLineWidth(0.35);
    doc.roundedRect(M, y, CW, 10, 1.5, 1.5, 'FD');
    setf(doc, 'helvetica', 'bold', 6.5); col(doc, [135, 78, 8]);
    doc.text(
      'LEZ — Dest. inom Stockholms Miljozon. Fordonets utslappsklass bekraftas vid bokning.',
      M + 4, y + 6.5,
    );
    y += 14;
  }

  // Permit warning
  const needsPermit = data['tillstånd_krävs'] ?? data.tillstand_kravs ?? false;
  if (needsPermit) {
    fill(doc, TINT); strk(doc, RULE); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, 10, 1.5, 1.5, 'FD');
    setf(doc, 'helvetica', 'normal', 6.5); col(doc, BODY);
    doc.text(
      'OBS: Dispenstillstand kan kravas for detta uppdrag (vikt / bredd / langd).',
      M + 4, y + 6.5,
    );
    y += 14;
  }

  // ════════════════════════════════════════════════════════════════
  // 6. ROUTE STRIP
  // ════════════════════════════════════════════════════════════════

  setf(doc, 'helvetica', 'bold', 5); col(doc, MUTED);
  doc.text('RUTT', M, y);
  y += 4;
  drawRouteStrip(doc, y, data.upphämtning, data.leverans, data.avstand_km);
  y += 26;

  // ════════════════════════════════════════════════════════════════
  // 7. PAYMENT INFO + CONTACT PERSON (side by side)
  // ════════════════════════════════════════════════════════════════

  const boxH  = 32;
  const halfW = (CW - 6) / 2;

  // Left — Betalningsinformation
  fill(doc, TINT); strk(doc, RULE); doc.setLineWidth(0.2);
  doc.roundedRect(M, y, halfW, boxH, 2, 2, 'FD');
  setf(doc, 'helvetica', 'bold', 5); col(doc, MUTED);
  doc.text('BETALNINGSINFORMATION', M + 4, y + 6);
  let pY = y + 12;
  for (const [lbl, val] of [
    ['Betalningsvillkor', '30 dagar netto'],
    coBankgiro ? ['Bankgiro',      coBankgiro]                 : null,
    ['OCR / referens',   String(quoteNumber ?? '—')],
  ].filter(Boolean)) {
    setf(doc, 'helvetica', 'normal', 6); col(doc, MID);
    doc.text(lbl, M + 4, pY);
    setf(doc, 'helvetica', 'bold', 6.5); col(doc, BLACK);
    doc.text(String(val), M + halfW - 4, pY, { align: 'right' });
    pY += 5.5;
  }

  // Right — Er kontaktperson
  const dBoxX = M + halfW + 6;
  fill(doc, TINT); strk(doc, RULE); doc.setLineWidth(0.2);
  doc.roundedRect(dBoxX, y, halfW, boxH, 2, 2, 'FD');
  setf(doc, 'helvetica', 'bold', 5); col(doc, MUTED);
  doc.text('ER KONTAKTPERSON', dBoxX + 4, y + 6);
  let dY = y + 12;
  if (dispatcher) {
    setf(doc, 'times', 'bold', 10); col(doc, BLACK);
    doc.text(safe(dispatcher), dBoxX + 4, dY); dY += 6.5;
  }
  if (coPhone) {
    setf(doc, 'helvetica', 'normal', 7.5); col(doc, BODY);
    doc.text(safe(coPhone), dBoxX + 4, dY); dY += 5;
  }
  if (coEmail) {
    setf(doc, 'helvetica', 'normal', 6.5); col(doc, MID);
    doc.text(safe(coEmail), dBoxX + 4, dY);
  }

  y += boxH + 8;

  // ════════════════════════════════════════════════════════════════
  // 8. FOOTER
  // ════════════════════════════════════════════════════════════════

  const FY = PH - 20;
  accentLine(doc, FY);

  // Warm closing
  setf(doc, 'times', 'italic', 8); col(doc, BODY);
  doc.text(
    'Tack for er forfragan. Vi ser fram emot att fa utfora ert uppdrag.',
    M, FY + 5.5,
  );

  // Legal note
  setf(doc, 'helvetica', 'normal', 5.5); col(doc, MUTED);
  doc.text(
    'Vid betalning efter forfallodatum debiteras drojsmalsranta enligt rantelagen. Paminnelseavgift 60 kr.',
    M, FY + 10.5,
  );

  // Company registration footer
  const footLine = [
    safe(coName),
    coOrgNr  ? `Org.nr ${coOrgNr}` : null,
    coMomsNr ? `Momsreg.nr ${coMomsNr}` : null,
    'Godkand for F-skatt',
  ].filter(Boolean).join('  ·  ');
  doc.text(footLine, M, FY + 15);

  setf(doc, 'helvetica', 'normal', 5.5); col(doc, MUTED);
  doc.text('Sida 1 av 1', PW - M, FY + 10.5, { align: 'right' });

  // ── Save ──────────────────────────────────────────────────────────────────────
  const numPart  = String(quoteNumber ?? 'UTKAST').replace(/[^a-zA-Z0-9]/g, '-');
  const filename = `Offert-${numPart}-${kundSlug}.pdf`;

  if (meta._returnBase64) {
    return { base64: doc.output('datauristring'), filename };
  }
  doc.save(filename);
}

export function quotePdfBase64(data, quoteNumber, fleet = [], meta = {}) {
  return generatePdf(data, quoteNumber, fleet, { ...meta, _returnBase64: true });
}
