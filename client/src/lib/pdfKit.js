// Shared jsPDF helpers (A4, Helvetica). Helvetica covers Latin-1 (å, ä, ö, é); other characters are mapped
// to their closest Latin-1 form by pdfSafe.

const REPLACE = {
  '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...',
  ' ': ' ', ' ': ' ', '−': '-',
};
export function pdfSafe(s) {
  return [...String(s ?? '')].map((ch) => {
    if (ch.charCodeAt(0) <= 0xff) return ch;
    if (REPLACE[ch]) return REPLACE[ch];
    const base = ch.normalize('NFD')[0];
    return base.charCodeAt(0) <= 0xff ? base : '?';
  }).join('');
}

export const PAGE = { w: 297, h: 210, margin: 14 };
export const INK = [22, 33, 28];
/** Lasskoll pine, for document titles. */
export const BRAND = [31, 77, 58];
export const MUTED = [91, 102, 95];
export const RULE = [221, 224, 229];

/** Cut text to fit `width` mm on one line. */
export function fit(doc, text, width) {
  const s = pdfSafe(text);
  if (doc.getTextWidth(s) <= width) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.getTextWidth(`${s.slice(0, mid)}...`) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo)}...`;
}

/**
 * Draw a table from `y`. columns: [{ label, width, align?, get(row) }]. Returns the y after the table.
 * Starts a new page (with the header row repeated) when a row would not fit.
 */
export function table(doc, y, columns, rows) {
  const rowH = 6;
  const header = () => {
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...MUTED);
    let x = PAGE.margin;
    for (const c of columns) {
      doc.text(pdfSafe(c.label.toUpperCase()), c.align === 'right' ? x + c.width - 1 : x + 1, y + 4, { align: c.align === 'right' ? 'right' : 'left' });
      x += c.width;
    }
    y += rowH;
    doc.setDrawColor(...RULE).line(PAGE.margin, y, PAGE.w - PAGE.margin, y);
  };
  header();
  doc.setFont('helvetica', 'normal').setFontSize(8.5);
  for (const r of rows) {
    if (y + rowH > PAGE.h - PAGE.margin - 6) {
      doc.addPage();
      y = PAGE.margin;
      header();
      doc.setFont('helvetica', 'normal').setFontSize(8.5);
    }
    let x = PAGE.margin;
    doc.setTextColor(...INK);
    for (const c of columns) {
      const text = fit(doc, c.get(r) ?? '', c.width - 2);
      doc.text(text, c.align === 'right' ? x + c.width - 1 : x + 1, y + 4.2, { align: c.align === 'right' ? 'right' : 'left' });
      x += c.width;
    }
    y += rowH;
    doc.setDrawColor(236, 236, 239).line(PAGE.margin, y, PAGE.w - PAGE.margin, y);
  }
  return y;
}
