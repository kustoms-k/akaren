import { jsPDF } from 'jspdf';

// ── Layout (pt, A4 portrait) ──────────────────────────────────────────────────
const PW       = 595;
const PH       = 842;
const ML       = 50;
const MR       = 545;   // PW - ML
const UW       = 495;   // MR - ML
const GAP_SM   = 8;
const GAP_MD   = 16;
const GAP_LG   = 28;
const ROW_H    = 22;
const FOOTER_Y = PH - 90;  // 752 — always anchored here

// ── Colours ───────────────────────────────────────────────────────────────────
const C_TEXT = [26,  29,  36];
const C_GREY = [107, 114, 128];
const C_RULE = [209, 213, 219];
const C_DARK = [45,  51,  64];

// ── Helpers ───────────────────────────────────────────────────────────────────

// NFC normalisation — precomposes å/ä/ö so jsPDF Latin-1 fonts render them
function safe(s) {
  return String(s ?? '').normalize('NFC');
}

function fmtNum(n, dec = 0) {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(Number(n) || 0);
}

function formatSEK(n) {
  return fmtNum(Math.round(Number(n) || 0)) + ' kr';
}

function f(doc, style, size) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
}

function tc(doc, color) {
  doc.setTextColor(...color);
}

function hline(doc, y, color = C_RULE, lw = 0.5) {
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  doc.line(ML, y, MR, y);
}

function tL(doc, text, x, y) {
  doc.text(safe(String(text ?? '')), x, y);
}

function tR(doc, text, x, y) {
  doc.text(safe(String(text ?? '')), x, y, { align: 'right' });
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
  return slugify(
    (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim()
  ).split('-').slice(0, 2).join('-') || 'kund';
}

// ── Main export ───────────────────────────────────────────────────────────────
export function generatePdf(data, quoteNumber, fleet = [], meta = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  // ── Data extraction ─────────────────────────────────────────────────────────
  const today      = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 14);
  const fmtDate = (d) => new Intl.DateTimeFormat('sv-SE').format(d);

  const co         = meta.company ?? {};
  const coName     = safe(co.name     ?? 'Transportföretag');
  const coOrgNr    = String(co.org_nr ?? '');
  const coAddress  = safe(co.address  ?? '');
  const coPhone    = safe(co.phone    ?? '');
  const coEmail    = safe(co.email    ?? '');
  const coBankgiro = safe(co.bankgiro ?? '');
  const coMomsNr   = coOrgNr ? 'SE' + coOrgNr.replace(/[^0-9]/g, '') + '01' : '';
  const dispatcher = safe(meta.userName ?? '');

  const avstand   = Number(data.avstand_km)          || 0;
  const branslekr = Number(data.bränsle_kostnad)     || 0;
  const arbKost   = Number(data.arbetstid_kostnad)    || 0;
  const arbTim    = Number(data.arbetstid_timmar)     || 0;
  const loadKost  = Number(data.loading_kostnad)      || 0;
  const framkKost = Number(data.framkorning_kostnad)  || 0;
  const totalExcl = Number(data.totalpris_sek)        || 0;
  const moms      = Math.round(totalExcl * 0.25);
  const totalInkl = totalExcl + moms;
  const transBase = Math.max(0, totalExcl - branslekr - arbKost - loadKost - framkKost);
  const perKm     = avstand > 0 ? transBase / avstand : 0;
  const perTim    = arbTim  > 0 ? arbKost   / arbTim  : 0;

  const kundNamn  = safe(data.kund_namn    ?? '');
  const kundEmail = safe(data.kund_email   ?? '');
  const kundTel   = safe(data.kund_telefon ?? '');

  const vehicleId = data.fordon_rekommenderat;
  const vehicle   = fleet.find((v) => v.id === vehicleId) ?? null;

  const kundSlug = kundNamn
    ? slugify(kundNamn.trim().split(/\s+/)[0])
    : cityOf(safe(data.leverans || data.upphämtning || ''));

  // ── Line items (only include rows with a non-zero amount) ───────────────────
  const items = [
    transBase > 0 && {
      desc:  data.lasttyp ? `Transport – ${safe(String(data.lasttyp))}` : 'Transport',
      antal: avstand > 0 ? `${avstand} km` : '1 st',
      apris: avstand > 0 && perKm > 0 ? `${fmtNum(perKm, 2)} kr/km` : '—',
      belopp: transBase,
    },
    framkKost > 0 && {
      desc: 'Framkörning', antal: '1 st',
      apris: formatSEK(framkKost), belopp: framkKost,
    },
    branslekr > 0 && {
      desc:  'Bränsletillägg',
      antal: avstand > 0 ? `${avstand} km` : '1 st',
      apris: avstand > 0 ? `${fmtNum(branslekr / avstand, 2)} kr/km` : formatSEK(branslekr),
      belopp: branslekr,
    },
    arbKost > 0 && {
      desc:  arbTim > 0 ? `Arbetstid (${arbTim} tim)` : 'Arbetstid',
      antal: arbTim > 0 ? `${arbTim} tim` : '1 st',
      apris: perTim > 0 ? `${fmtNum(perTim, 2)} kr/tim` : '—',
      belopp: arbKost,
    },
    loadKost > 0 && {
      desc: 'Lastning / lossning', antal: '1 st',
      apris: formatSEK(loadKost), belopp: loadKost,
    },
  ].filter(Boolean);

  // ── Y cursor starts at top margin ───────────────────────────────────────────
  let y = 50;

  // ════════════════════════════════════════════════════════════════════════════
  // 1. HEADER BLOCK
  // ════════════════════════════════════════════════════════════════════════════

  // Left: company name (bold 18)
  f(doc, 'bold', 18); tc(doc, C_TEXT);
  tL(doc, coName, ML, y);
  let hLY = y + 24;

  // Left: registration / momsreg (normal 9)
  const regLine = [
    coOrgNr  ? `Org.nr ${coOrgNr}`      : null,
    coMomsNr ? `Momsreg.nr ${coMomsNr}` : null,
    'Godkänd för F-skatt',
  ].filter(Boolean).join('  ·  ');
  f(doc, 'normal', 9); tc(doc, C_GREY);
  tL(doc, regLine, ML, hLY);
  hLY += 13;

  // Right: address, phone, email stacked (normal 9)
  const contactLines = [coAddress, coPhone, coEmail].filter(Boolean);
  let hRY = y;
  for (const line of contactLines) {
    f(doc, 'normal', 9); tc(doc, C_GREY);
    tR(doc, line, MR, hRY);
    hRY += 13;
  }

  y = Math.max(hLY, hRY) + GAP_SM;
  hline(doc, y, C_RULE, 0.5);
  y += GAP_LG;

  // ════════════════════════════════════════════════════════════════════════════
  // 2. TITLE BLOCK
  // ════════════════════════════════════════════════════════════════════════════

  f(doc, 'bold', 22); tc(doc, C_TEXT);
  tL(doc, 'OFFERT', ML, y);

  f(doc, 'normal', 11); tc(doc, C_GREY);
  tR(doc, safe(String(quoteNumber ?? 'UTKAST')), MR, y);

  y += 28 + GAP_MD;  // 22pt font height + medium gap

  // ════════════════════════════════════════════════════════════════════════════
  // 3. META BLOCK — two independent y-cursors, merged at bottom
  // ════════════════════════════════════════════════════════════════════════════

  let lY = y;
  let rY = y;

  // Left: KUND label then customer details
  f(doc, 'bold', 9); tc(doc, C_GREY);
  tL(doc, 'KUND', ML, lY);
  lY += 14;

  if (kundNamn) {
    f(doc, 'bold', 10); tc(doc, C_TEXT);
    tL(doc, kundNamn, ML, lY); lY += 15;
  }
  if (kundEmail) {
    f(doc, 'normal', 9); tc(doc, C_GREY);
    tL(doc, kundEmail, ML, lY); lY += 13;
  }
  if (kundTel) {
    f(doc, 'normal', 9); tc(doc, C_GREY);
    tL(doc, kundTel, ML, lY); lY += 13;
  }
  if (!kundNamn && !kundEmail && !kundTel) {
    f(doc, 'normal', 9); tc(doc, C_GREY);
    tL(doc, 'Kontaktuppgifter ej angivna', ML, lY); lY += 13;
  }

  // Right: Datum, Giltig t.o.m., Referens — label then value
  for (const [label, value] of [
    ['DATUM',         fmtDate(today)],
    ['GILTIG T.O.M.', fmtDate(validUntil)],
    ['REFERENS',      safe(String(quoteNumber ?? '—'))],
  ]) {
    f(doc, 'bold', 9); tc(doc, C_GREY);
    tR(doc, label, MR, rY); rY += 14;
    f(doc, 'normal', 10); tc(doc, C_TEXT);
    tR(doc, value, MR, rY); rY += 15;
  }

  y = Math.max(lY, rY) + GAP_LG;

  // ════════════════════════════════════════════════════════════════════════════
  // 4. LINE ITEMS TABLE
  // ════════════════════════════════════════════════════════════════════════════

  // Column right-edge x values (right-aligned numbers, left-aligned description)
  const CL = { desc: ML, antal: 365, apris: 460, belopp: MR };

  // Header row
  f(doc, 'bold', 9); tc(doc, C_GREY);
  tL(doc, 'BESKRIVNING', CL.desc,   y);
  tR(doc, 'ANTAL',       CL.antal,  y);
  tR(doc, 'À-PRIS',      CL.apris,  y);
  tR(doc, 'BELOPP',      CL.belopp, y);
  y += GAP_SM;
  hline(doc, y, C_DARK, 1);
  y += GAP_MD;

  // Item rows — each exactly ROW_H tall
  for (const row of items) {
    f(doc, 'normal', 10); tc(doc, C_TEXT);
    tL(doc, row.desc, CL.desc, y);

    f(doc, 'normal', 10); tc(doc, C_GREY);
    tR(doc, row.antal, CL.antal, y);
    tR(doc, row.apris, CL.apris, y);

    f(doc, 'normal', 10); tc(doc, C_TEXT);
    tR(doc, formatSEK(row.belopp), CL.belopp, y);

    y += ROW_H;
  }

  // Rule after last item
  hline(doc, y, C_RULE, 0.5);
  y += GAP_MD;

  // ════════════════════════════════════════════════════════════════════════════
  // 5. TOTALS BLOCK — labels right-align at apris column, amounts at MR
  // ════════════════════════════════════════════════════════════════════════════

  f(doc, 'normal', 10); tc(doc, C_GREY);
  tR(doc, 'Delsumma exkl. moms', CL.apris, y);
  f(doc, 'normal', 10); tc(doc, C_TEXT);
  tR(doc, formatSEK(totalExcl), CL.belopp, y);
  y += GAP_MD;

  f(doc, 'normal', 10); tc(doc, C_GREY);
  tR(doc, 'Moms 25 %', CL.apris, y);
  f(doc, 'normal', 10); tc(doc, C_TEXT);
  tR(doc, formatSEK(moms), CL.belopp, y);
  y += GAP_SM + 4;

  hline(doc, y, C_DARK, 1);
  y += GAP_MD;

  f(doc, 'bold', 14); tc(doc, C_TEXT);
  tR(doc, 'ATT BETALA', CL.apris, y);
  tR(doc, formatSEK(totalInkl), CL.belopp, y);
  y += GAP_LG;

  // Optional notices (LEZ, permit, notes)
  const needsPermit = data['tillstånd_krävs'] ?? data.tillstand_kravs ?? false;

  if (data.lez_varning) {
    f(doc, 'normal', 9); tc(doc, C_GREY);
    tL(doc, 'LEZ: Destination inom miljözon. Fordonets utsläppsklass bekräftas vid bokning.', ML, y);
    y += GAP_MD;
  }
  if (needsPermit) {
    f(doc, 'normal', 9); tc(doc, C_GREY);
    tL(doc, 'OBS: Dispenstillstånd kan krävas för detta uppdrag (vikt / bredd / längd).', ML, y);
    y += GAP_MD;
  }
  if (data.noteringar && String(data.noteringar).trim()) {
    const noteLines = doc.splitTextToSize(safe(String(data.noteringar).trim()), UW);
    f(doc, 'normal', 9); tc(doc, C_GREY);
    for (const line of noteLines.slice(0, 4)) {
      tL(doc, line, ML, y);
      y += 12;
    }
    y += GAP_SM;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 6. FOOTER — anchored to FOOTER_Y, never floats with content
  // ════════════════════════════════════════════════════════════════════════════

  hline(doc, FOOTER_Y, C_RULE, 0.5);

  let fy = FOOTER_Y + 13;

  // Line 1: dispatcher + phone (left) | payment terms (right)
  if (dispatcher || coPhone) {
    f(doc, 'bold', 9); tc(doc, C_TEXT);
    tL(doc, [dispatcher, coPhone].filter(Boolean).join('   '), ML, fy);
  }
  const payTerms = [
    'Betalningsvillkor: 30 dagar netto',
    coBankgiro ? `Bankgiro: ${coBankgiro}` : null,
  ].filter(Boolean).join('   ·   ');
  f(doc, 'normal', 8); tc(doc, C_GREY);
  tR(doc, payTerms, MR, fy);
  fy += 13;

  // Line 2: thank-you (left) | OCR (right)
  f(doc, 'normal', 8); tc(doc, C_GREY);
  tL(doc, 'Tack för er beställning.', ML, fy);
  if (quoteNumber) {
    f(doc, 'normal', 8); tc(doc, C_GREY);
    tR(doc, `OCR: ${safe(String(quoteNumber))}`, MR, fy);
  }
  fy += 13;

  // Line 3: company registration (left) | page number (right)
  const footReg = [
    coName,
    coOrgNr  ? `Org.nr ${coOrgNr}` : null,
    coMomsNr ? `Momsreg.nr ${coMomsNr}` : null,
    'Godkänd för F-skatt',
  ].filter(Boolean).join('  ·  ');
  f(doc, 'normal', 7); tc(doc, C_GREY);
  tL(doc, safe(footReg), ML, fy);
  tR(doc, 'Sida 1 av 1', MR, fy);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const numPart  = String(quoteNumber ?? 'UTKAST').replace(/[^a-zA-Z0-9-]/g, '-');
  const filename = `Offert-${numPart}-${kundSlug}.pdf`;

  if (meta._returnBase64) {
    return { base64: doc.output('datauristring'), filename };
  }
  doc.save(filename);
}

export function quotePdfBase64(data, quoteNumber, fleet = [], meta = {}) {
  return generatePdf(data, quoteNumber, fleet, { ...meta, _returnBase64: true });
}
