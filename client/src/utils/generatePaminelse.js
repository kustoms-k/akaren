import { jsPDF } from 'jspdf';

const SLATE  = [45, 51, 64];
const BLACK  = [18, 22, 28];
const BODY   = [45, 55, 68];
const MID    = [95, 108, 124];
const MUTED  = [148, 158, 172];
const RULE   = [212, 216, 222];
const TINT   = [247, 248, 249];
const RED_BG = [254, 242, 242];
const RED_BD = [220, 38, 38];
const WHITE  = [255, 255, 255];

const PW = 210, PH = 297, M = 20, CW = PW - M * 2;

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

function safe(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function slugify(s) {
  return String(s || 'kund')
    .replace(/[^a-zA-Z0-9åäöÅÄÖ\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'kund';
}

const REMINDER_FEE = 60;

export function generatePaminelse(invoice, company, reminderCount = 1) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const today     = new Date();
  const payBy     = new Date(today);
  payBy.setDate(payBy.getDate() + 14);

  const coName     = company?.name     ?? 'Transportforetag';
  const coEmail    = company?.email    ?? '';
  const coPhone    = company?.phone    ?? '';
  const coAddress  = company?.address  ?? '';
  const coOrgNr    = company?.org_nr   ?? '';
  const coBankgiro = company?.bankgiro ?? '';
  const coMomsNr   = coOrgNr ? 'SE' + coOrgNr.replace(/[^0-9]/g, '') + '01' : '';

  const origTotal = Number(invoice.total) || 0;
  const newTotal  = origTotal + REMINDER_FEE;

  let y = M;

  // ── 1. LETTERHEAD ─────────────────────────────────────────────────────────

  fill(doc, SLATE); strk(doc, SLATE); doc.setLineWidth(0);
  doc.roundedRect(M, y, 13, 13, 1.5, 1.5, 'F');
  setf(doc, 'helvetica', 'bold', 9.5); col(doc, WHITE);
  doc.text(safe(coName).charAt(0).toUpperCase(), M + 6.5, y + 9.2, { align: 'center' });

  setf(doc, 'times', 'bold', 20); col(doc, BLACK);
  doc.text(safe(coName).toUpperCase(), M + 17, y + 9.5);

  const RX = PW - M;
  [coAddress, coPhone, coEmail].filter(Boolean).forEach((line, i) => {
    setf(doc, 'helvetica', 'normal', 6); col(doc, MID);
    doc.text(safe(line), RX, y + 3 + i * 4.8, { align: 'right' });
  });

  y += 17;

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

  // ── 2. TITLE ──────────────────────────────────────────────────────────────

  // Red badge
  fill(doc, RED_BG); strk(doc, RED_BD); doc.setLineWidth(0.4);
  doc.roundedRect(M, y, 62, 7, 1.5, 1.5, 'FD');
  setf(doc, 'helvetica', 'bold', 6.5); col(doc, RED_BD);
  doc.text(`BETALNINGSPAMINNELSE NR ${reminderCount}`, M + 31, y + 4.8, { align: 'center' });

  y += 12;

  setf(doc, 'times', 'bold', 22); col(doc, BLACK);
  doc.text('Betalningspaminnelse', M, y);

  // Info box right
  const nbW = 60, nbH = 22, nbX = PW - M - nbW;
  fill(doc, TINT); strk(doc, RULE); doc.setLineWidth(0.25);
  doc.roundedRect(nbX, y - 8, nbW, nbH, 2, 2, 'FD');
  fill(doc, SLATE); doc.setLineWidth(0);
  doc.roundedRect(nbX, y - 8, nbW, 3, 2, 2, 'F');
  doc.rect(nbX, y - 5, nbW, 0.5, 'F');

  let bY = y - 3;
  for (const [lbl, val] of [
    ['Paminnelse nr', String(reminderCount)],
    ['Datum',        fmtDateSv(today)],
    ['Betalas senast', fmtDateSv(payBy)],
  ]) {
    setf(doc, 'helvetica', 'bold', 4.5); col(doc, MUTED);
    doc.text(lbl, nbX + 4, bY);
    setf(doc, 'helvetica', 'bold', 6.5); col(doc, BLACK);
    doc.text(String(val), nbX + nbW - 4, bY, { align: 'right' });
    bY += 5.5;
  }

  y += 16;
  hline(doc, y);
  y += 8;

  // ── 3. RECIPIENT ──────────────────────────────────────────────────────────

  setf(doc, 'helvetica', 'bold', 5); col(doc, MUTED);
  doc.text('TILL', M, y);
  y += 5;

  if (invoice.customer_name) {
    setf(doc, 'times', 'bold', 10); col(doc, BLACK);
    doc.text(safe(String(invoice.customer_name)), M, y); y += 5.5;
  }
  if (invoice.customer_address) {
    setf(doc, 'helvetica', 'normal', 7); col(doc, BODY);
    doc.text(safe(String(invoice.customer_address)), M, y); y += 4.5;
  }
  if (invoice.customer_email) {
    setf(doc, 'helvetica', 'normal', 7); col(doc, BODY);
    doc.text(safe(String(invoice.customer_email)), M, y); y += 4.5;
  }
  if (!invoice.customer_name) {
    setf(doc, 'helvetica', 'italic', 7); col(doc, MUTED);
    doc.text('Kund ej angiven', M, y); y += 5;
  }

  y += 4;
  hline(doc, y);
  y += 8;

  // ── 4. NOTICE TEXT ────────────────────────────────────────────────────────

  setf(doc, 'times', 'italic', 9); col(doc, BODY);
  const noticeLines = doc.splitTextToSize(
    `Trots var vanliga paminnelse har vi ej kunnat notera att nedan angiven faktura ar betald. Vi ber er att snarast reglera beloppet, senast ${fmtDateSv(payBy)}.`,
    CW,
  );
  doc.text(noticeLines, M, y);
  y += noticeLines.length * 5.2 + 6;

  // ── 5. INVOICE TABLE ──────────────────────────────────────────────────────

  const C = { desc: M, date: M + 68, due: M + 112, belopp: PW - M };

  setf(doc, 'helvetica', 'bold', 5.5); col(doc, MUTED);
  doc.text('FAKTURA NR',         C.desc,   y);
  doc.text('FAKTURADATUM',       C.date,   y);
  doc.text('URSPR. FORFALLODATUM', C.due,  y, { align: 'right' });
  doc.text('BELOPP',             C.belopp, y, { align: 'right' });
  y += 2.5;
  strk(doc, SLATE); doc.setLineWidth(0.55); doc.line(M, y, PW - M, y);
  y += 7;

  // Original invoice row
  setf(doc, 'helvetica', 'normal', 9); col(doc, BLACK);
  doc.text(String(invoice.faktura_nr ?? '—'), C.desc, y);
  setf(doc, 'helvetica', 'normal', 8); col(doc, BODY);
  doc.text(String(invoice.created_at?.slice(0, 10) ?? '—'), C.date, y);
  doc.text(String(invoice.due_date ?? '—'), C.due, y, { align: 'right' });
  col(doc, BLACK);
  doc.text(fmtSEK(origTotal), C.belopp, y, { align: 'right' });
  y += 8;

  hline(doc, y, RULE, 0.18);
  y += 5;

  // Reminder fee row
  fill(doc, TINT); strk(doc, TINT); doc.setLineWidth(0);
  doc.rect(M - 1, y - 3.5, CW + 2, 8, 'F');
  setf(doc, 'helvetica', 'normal', 8); col(doc, BODY);
  doc.text('Paminnelseavgift (lag 1981:739)', C.desc, y);
  col(doc, BLACK);
  doc.text(fmtSEK(REMINDER_FEE), C.belopp, y, { align: 'right' });
  y += 8;

  strk(doc, SLATE); doc.setLineWidth(0.5); doc.line(M, y, PW - M, y);
  y += 7;

  // ATT BETALA
  const tbW = 88, tbX = PW - M - tbW;
  fill(doc, SLATE); strk(doc, SLATE); doc.setLineWidth(0);
  doc.roundedRect(tbX, y, tbW, 16, 2, 2, 'F');
  setf(doc, 'helvetica', 'bold', 5.5); col(doc, WHITE);
  doc.text('ATT BETALA', tbX + 5, y + 5.5);
  setf(doc, 'times', 'bold', 17); col(doc, WHITE);
  doc.text(fmtSEK(newTotal), PW - M - 4, y + 13, { align: 'right' });
  y += 22;

  // ── 6. PAYMENT INFO ───────────────────────────────────────────────────────

  y += 4;
  fill(doc, TINT); strk(doc, RULE); doc.setLineWidth(0.2);
  doc.roundedRect(M, y, CW, 28, 2, 2, 'FD');
  setf(doc, 'helvetica', 'bold', 5); col(doc, MUTED);
  doc.text('BETALNINGSINFORMATION', M + 4, y + 6);
  let pY = y + 12;
  for (const [lbl, val] of [
    ['Betalas senast', fmtDateSv(payBy)],
    coBankgiro ? ['Bankgiro', coBankgiro] : null,
    ['OCR / faktura nr', String(invoice.faktura_nr ?? '—')],
  ].filter(Boolean)) {
    setf(doc, 'helvetica', 'normal', 6.5); col(doc, MID);
    doc.text(lbl, M + 4, pY);
    setf(doc, 'helvetica', 'bold', 7); col(doc, BLACK);
    doc.text(String(val), PW - M - 4, pY, { align: 'right' });
    pY += 5.5;
  }
  y += 34;

  // ── 7. LATE INTEREST NOTE ─────────────────────────────────────────────────

  setf(doc, 'helvetica', 'italic', 7); col(doc, MUTED);
  doc.text(
    'Vid utebliven betalning forbehaller vi oss ratten att debitera drojsmalsranta enligt rantelagen samt overlamna arendet till inkasso.',
    M, y,
  );
  y += 8;

  // ── 8. FOOTER ─────────────────────────────────────────────────────────────

  const FY = PH - 20;
  accentLine(doc, FY);

  setf(doc, 'helvetica', 'normal', 5.5); col(doc, MUTED);
  const footLine = [
    safe(coName),
    coOrgNr  ? `Org.nr ${coOrgNr}` : null,
    coMomsNr ? `Momsreg.nr ${coMomsNr}` : null,
  ].filter(Boolean).join('  ·  ');
  doc.text(footLine, M, FY + 5.5);
  doc.text(`${safe(coPhone)}  ·  ${safe(coEmail)}`, M, FY + 10.5);
  doc.text('Sida 1 av 1', PW - M, FY + 5.5, { align: 'right' });

  // ── SAVE / RETURN ─────────────────────────────────────────────────────────

  const filename = `Paminnelse-${reminderCount}-${String(invoice.faktura_nr ?? 'XX').replace(/[^a-zA-Z0-9]/g, '-')}-${slugify(invoice.customer_name)}.pdf`;
  const base64   = doc.output('datauristring');
  return { base64, filename };
}
