import { jsPDF } from 'jspdf';

// ── Palette ───────────────────────────────────────────────────────────────────
const BLUE  = [67, 97, 238];
const BLACK = [26, 26, 26];
const DARK  = [60, 60, 60];
const MID   = [110, 110, 110];
const LIGHT = [160, 160, 160];
const PALE  = [215, 215, 210];
const WHITE = [255, 255, 255];

// ── Layout ────────────────────────────────────────────────────────────────────
const PW = 210;
const PH = 297;
const M  = 18;
const CW = PW - M * 2;

// ── Helpers ───────────────────────────────────────────────────────────────────
const setf = (doc, fam, sty, sz) => { doc.setFont(fam, sty); doc.setFontSize(sz); };
const col  = (doc, a) => doc.setTextColor(...a);
const fill = (doc, a) => doc.setFillColor(...a);
const strk = (doc, a) => doc.setDrawColor(...a);

function hline(doc, y, color = PALE, lw = 0.25) {
  strk(doc, color); doc.setLineWidth(lw);
  doc.line(M, y, PW - M, y);
}

function blueDivider(doc, y) {
  strk(doc, BLUE); doc.setLineWidth(0.55);
  doc.line(M, y, PW - M, y);
}

const fmtSEK = (n) =>
  new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(n ?? 0) + ' kr';

const fmtDateSv = (s) => {
  if (!s) return '—';
  try {
    const d = new Date(String(s).slice(0, 10) + 'T12:00:00');
    return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch { return String(s).slice(0, 10); }
};

// Strip combining diacritical marks for standard PDF fonts
function pdf(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Filename slug — preserves å ä ö for modern OS support
function slugify(s) {
  return String(s || 'kund')
    .replace(/[^a-zA-Z0-9åäöÅÄÖ\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'kund';
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateFaktura(invoice, company) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const lineItems = Array.isArray(invoice.line_items)
    ? invoice.line_items
    : JSON.parse(invoice.line_items || '[]');

  const orgNr = company.org_nr || '';
  const vatNr = `SE${orgNr.replace(/\D/g, '')}01`;

  let y = M;

  // ── HEADER BAND ───────────────────────────────────────────────────────────────

  // Gold logo mark
  fill(doc, BLUE); strk(doc, BLUE); doc.setLineWidth(0);
  doc.roundedRect(M, y, 14, 14, 2, 2, 'F');
  setf(doc, 'helvetica', 'bold', 10);
  col(doc, WHITE);
  doc.text('A', M + 7, y + 9.8, { align: 'center' });

  // Company name — large serif 22pt
  setf(doc, 'times', 'bold', 22);
  col(doc, BLACK);
  doc.text(pdf(company.name || 'Akaren').toUpperCase(), M + 19, y + 9.5);

  // Org.nr + VAT — 9pt grey directly underneath
  setf(doc, 'helvetica', 'normal', 6.5);
  col(doc, LIGHT);
  doc.text(`Org.nr ${orgNr}  ·  Momsreg.nr ${vatNr}  ·  Godkand for F-skatt`, M + 19, y + 14.5);

  // Contact block — right-aligned
  const RX = PW - M;
  [company.email, company.phone, pdf(company.address || '')].filter(Boolean).forEach((line, i) => {
    setf(doc, 'helvetica', 'normal', 6.5); col(doc, DARK);
    doc.text(line, RX, y + 4.5 + i * 4.8, { align: 'right' });
  });

  y += 22;
  blueDivider(doc, y);
  y += 10;

  // ── TITLE BAR ─────────────────────────────────────────────────────────────────

  setf(doc, 'times', 'bold', 28);
  col(doc, BLACK);
  doc.text('FAKTURA', M, y + 8);

  setf(doc, 'courier', 'bold', 13);
  col(doc, BLUE);
  doc.text(invoice.faktura_nr || '', PW - M, y + 8, { align: 'right' });

  y += 14;
  hline(doc, y, PALE, 0.3);
  y += 8;

  // ── TWO-COLUMN META ───────────────────────────────────────────────────────────

  const metaTop   = y;
  const colSplit  = M + CW * 0.5;
  const rx        = colSplit + 4;

  // Left — customer
  setf(doc, 'helvetica', 'bold', 5.5); col(doc, LIGHT);
  doc.text('KUND / CUSTOMER', M, y);
  y += 5;

  setf(doc, 'times', 'bold', 11); col(doc, BLACK);
  doc.text(pdf(invoice.customer_name || 'Ej angiven'), M, y);
  y += 5.5;

  if (invoice.customer_org_nr) {
    setf(doc, 'helvetica', 'normal', 7); col(doc, MID);
    doc.text(`Org.nr: ${invoice.customer_org_nr}`, M, y);
    y += 4.5;
  }

  if (invoice.customer_address) {
    setf(doc, 'helvetica', 'normal', 7); col(doc, DARK);
    const addrLines = doc.splitTextToSize(pdf(invoice.customer_address), colSplit - M - 6);
    doc.text(addrLines.slice(0, 3), M, y);
    y += addrLines.slice(0, 3).length * 4.5;
  }

  // Right — invoice metadata
  let rY = metaTop;
  setf(doc, 'helvetica', 'bold', 5.5); col(doc, LIGHT);
  doc.text('FAKTURAINFORMATION', rx, rY);
  rY += 5;

  const jobNrFmt = invoice.job_id
    ? `JOB-${new Date().getFullYear()}-${String(invoice.job_id).padStart(3, '0')}`
    : invoice.faktura_nr;

  [
    ['Fakturadatum:',      fmtDateSv(invoice.created_at?.slice(0, 10))],
    ['Forfallodatum:',     fmtDateSv(invoice.due_date)],
    ['Referens:',          jobNrFmt],
    ['Betalningsvillkor:', '30 dagar netto'],
  ].forEach(([lbl, val]) => {
    setf(doc, 'helvetica', 'normal', 6.5); col(doc, MID);
    doc.text(lbl, rx, rY);
    setf(doc, 'helvetica', 'bold', 7); col(doc, BLACK);
    doc.text(String(val), PW - M, rY, { align: 'right' });
    rY += 5;
  });

  y = Math.max(y, rY) + 7;
  hline(doc, y, PALE, 0.3);
  y += 8;

  // ── LINE ITEMS TABLE ──────────────────────────────────────────────────────────

  const C = { desc: M, antal: M + 96, apris: M + 138, belopp: PW - M };

  setf(doc, 'helvetica', 'bold', 6); col(doc, LIGHT);
  doc.text('BESKRIVNING', C.desc, y);
  doc.text('ANTAL',       C.antal,  y, { align: 'right' });
  doc.text('A-PRIS',      C.apris,  y, { align: 'right' });
  doc.text('BELOPP',      C.belopp, y, { align: 'right' });
  y += 2.5;

  strk(doc, BLACK); doc.setLineWidth(0.55);
  doc.line(M, y, PW - M, y);
  y += 6;

  lineItems.forEach((row, i) => {
    const descLines = doc.splitTextToSize(pdf(row.desc || ''), 88);
    const rowH      = Math.max(descLines.length * 5.2, 7.5);

    if (i % 2 === 1) {
      fill(doc, [247, 247, 245]);
      doc.rect(M - 1, y - 4, CW + 2, rowH + 2.5, 'F');
    }

    setf(doc, 'helvetica', 'normal', 8.5); col(doc, BLACK);
    doc.text(descLines, C.desc, y);

    setf(doc, 'helvetica', 'normal', 8); col(doc, DARK);
    const n = Number(row.antal);
    const antalStr = `${n % 1 === 0 ? n : n.toFixed(1)} ${row.unit || 'st'}`;
    doc.text(antalStr,            C.antal,  y, { align: 'right' });
    doc.text(fmtSEK(row.apris),  C.apris,  y, { align: 'right' });
    col(doc, BLACK);
    doc.text(fmtSEK(row.belopp), C.belopp, y, { align: 'right' });

    y += rowH;
    hline(doc, y, [232, 232, 228], 0.18);
    y += 2.5;
  });

  y += 8;

  // ── TOTALS BLOCK ──────────────────────────────────────────────────────────────

  const totX = M + CW * 0.45;

  setf(doc, 'helvetica', 'normal', 8); col(doc, DARK);
  doc.text('Delsumma (exkl. moms)', totX, y);
  setf(doc, 'helvetica', 'bold', 8.5); col(doc, BLACK);
  doc.text(fmtSEK(invoice.subtotal), PW - M, y, { align: 'right' });
  y += 6.5;

  setf(doc, 'helvetica', 'normal', 8); col(doc, DARK);
  doc.text('Moms 25%', totX, y);
  setf(doc, 'helvetica', 'normal', 8.5); col(doc, MID);
  doc.text(fmtSEK(invoice.vat), PW - M, y, { align: 'right' });
  y += 5;

  hline(doc, y, BLUE, 0.5);
  y += 6;

  setf(doc, 'helvetica', 'bold', 8); col(doc, DARK);
  doc.text('ATT BETALA (inkl. moms)', totX, y + 2);
  setf(doc, 'times', 'bold', 18); col(doc, BLUE);
  doc.text(fmtSEK(invoice.total), PW - M, y + 3, { align: 'right' });
  y += 18;

  // ── PAYMENT BLOCK ─────────────────────────────────────────────────────────────

  y += 4;
  setf(doc, 'helvetica', 'bold', 5.5); col(doc, BLUE);
  doc.text('BETALNINGSINFORMATION', M, y);
  y += 5;

  const payBoxW = CW - 46;
  const payBoxH = 32;
  fill(doc, [247, 247, 245]); strk(doc, PALE);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, y, payBoxW, payBoxH, 2, 2, 'FD');

  let pY = y + 6;
  [
    ['Bankgiro:',           company.bankgiro || '—'],
    ['OCR-nummer:',         invoice.faktura_nr],
    ['Betalningsvillkor:',  '30 dagar netto'],
    ['Forfallodatum:',      fmtDateSv(invoice.due_date)],
  ].forEach(([lbl, val]) => {
    setf(doc, 'helvetica', 'normal', 6.5); col(doc, MID);
    doc.text(lbl, M + 4, pY);
    setf(doc, 'helvetica', 'bold', 7); col(doc, BLACK);
    doc.text(String(val), M + 44, pY);
    pY += 5.5;
  });

  // QR code (Swish placeholder)
  const qrX    = M + CW - 42;
  const qrY    = y;
  const qrSize = 36;

  let qrDrawn = false;
  try {
    const qrContent = [
      `Bankgiro: ${company.bankgiro || 'N/A'}`,
      `Belopp: ${invoice.total} SEK`,
      `Referens: ${invoice.faktura_nr}`,
    ].join('\n');
    const { default: QRCode } = await import('qrcode');
    const dataUrl = await QRCode.toDataURL(qrContent, {
      width: 140, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' },
    });
    fill(doc, WHITE); strk(doc, PALE); doc.setLineWidth(0.2);
    doc.roundedRect(qrX, qrY, qrSize, qrSize, 1.5, 1.5, 'FD');
    doc.addImage(dataUrl, 'PNG', qrX + 2, qrY + 2, qrSize - 4, qrSize - 4);
    qrDrawn = true;
  } catch { /* fall through to placeholder */ }

  if (!qrDrawn) {
    fill(doc, [247, 247, 245]); strk(doc, PALE); doc.setLineWidth(0.25);
    doc.roundedRect(qrX, qrY, qrSize, qrSize, 1.5, 1.5, 'FD');
    setf(doc, 'helvetica', 'normal', 6); col(doc, LIGHT);
    doc.text('QR', qrX + qrSize / 2, qrY + qrSize / 2 + 2, { align: 'center' });
  }

  setf(doc, 'helvetica', 'normal', 5.5); col(doc, LIGHT);
  doc.text('Swish-betalning', qrX + qrSize / 2, qrY + qrSize + 4.5, { align: 'center' });

  y += payBoxH + 10;

  // ── FOOTER ────────────────────────────────────────────────────────────────────

  const FY = PH - 24;
  blueDivider(doc, FY);

  setf(doc, 'helvetica', 'normal', 5.5); col(doc, LIGHT);
  doc.text(
    'Vid betalning efter forfallodatum debiteras drojsmalrsanta enligt rantelagen. Paminnelseavgift 60 kr.',
    M, FY + 5,
  );
  doc.text(
    `${pdf(company.name || '')}  ·  Org.nr ${orgNr}  ·  Momsreg.nr ${vatNr}  ·  Godkand for F-skatt`,
    M, FY + 9.5,
  );

  setf(doc, 'times', 'italic', 8); col(doc, DARK);
  doc.text('Tack for er bestallning.', PW - M, FY + 5.5, { align: 'right' });

  // ── SAVE ──────────────────────────────────────────────────────────────────────

  doc.save(`Faktura-${invoice.faktura_nr}-${slugify(invoice.customer_name)}.pdf`);
}
