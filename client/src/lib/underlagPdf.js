import { formatDate, formatDateTime, formatKr, formatPhone, formatQty } from './labels.js';
import { INK, MUTED, PAGE, pdfSafe, table } from './pdfKit.js';

// Fakturaunderlag for one customer + project and week, as an A4 PDF for customers invoiced outside Fortnox.

const REVERSE = 'Omvänd betalningsskyldighet för byggtjänster enligt 16 kap. 13 § mervärdesskattelagen. Köparen redovisar momsen.';

function rowStatus(r, labels) {
  if (r.invoiced) return r.invoiced.kind === 'fortnox' ? `Fortnox ${r.invoiced.fortnox_document_nr ?? ''}`.trim() : 'Låst';
  return r.blockers.length ? r.blockers.map((b) => labels[b]).join(', ') : 'Klar';
}

function build(JsPDF, { group, company, weekLabel, labels }) {
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: pdfSafe(`Fakturaunderlag ${group.customer.name} ${weekLabel}`), creator: 'Åkaren' });
  const right = PAGE.w - PAGE.margin;

  let y = PAGE.margin + 4;
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK).text('Fakturaunderlag', PAGE.margin, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
    .text(pdfSafe(`${company.name}${company.org_nr ? ` · org.nr ${company.org_nr}` : ''}`), right, y, { align: 'right' });
  y += 7;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK).text(pdfSafe(group.customer.name), PAGE.margin, y);
  y += 6;

  const facts = [
    ['Org.nr', group.customer.org_nr],
    ['Projekt', group.project.name],
    ['Er referens', group.project.customer_ref],
    ['Period', weekLabel],
    ['Moms', group.vat_mode === 'omvand_bygg' ? 'Omvänd byggmoms' : '25 %'],
    ['Skapad', formatDateTime(new Date().toISOString())],
  ].filter(([, v]) => v);
  doc.setFontSize(9);
  for (const [label, value] of facts) {
    doc.setFont('helvetica', 'normal').setTextColor(...MUTED).text(pdfSafe(label), PAGE.margin, y);
    doc.setTextColor(...INK).text(pdfSafe(value), PAGE.margin + 26, y);
    y += 4.8;
  }
  y += 3;

  y = table(doc, y, [
    { label: 'Datum', width: 20, get: (r) => formatDate(r.datum) },
    { label: 'Beskrivning', width: 80, get: (r) => r.description },
    { label: 'Detalj', width: 62, get: (r) => r.detail },
    { label: 'Antal', width: 22, align: 'right', get: (r) => formatQty(r.quantity, r.unit) },
    { label: 'À-pris', width: 26, align: 'right', get: (r) => formatKr(r.price_ore) },
    { label: 'Belopp', width: 28, align: 'right', get: (r) => formatKr(r.amount_ore) },
    { label: 'Status', width: 31, get: (r) => rowStatus(r, labels) },
  ], group.rows);

  // Totals for the rows on this underlag (open and already invoiced).
  const net = group.rows.reduce((s, r) => s + (r.amount_ore ?? 0), 0);
  const reverse = group.vat_mode === 'omvand_bygg';
  const vat = reverse ? 0 : Math.round(net * 0.25);
  y += 6;
  if (y > PAGE.h - PAGE.margin - 30) { doc.addPage(); y = PAGE.margin + 4; }
  const line = (label, value, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 10.5 : 9.5).setTextColor(...INK);
    doc.text(pdfSafe(label), right - 70, y);
    doc.text(pdfSafe(value), right, y, { align: 'right' });
    y += bold ? 6 : 5;
  };
  line('Summa exkl. moms', formatKr(net));
  line(reverse ? 'Moms (omvänd byggmoms)' : 'Moms 25 %', formatKr(vat));
  line('Totalt', formatKr(net + vat), true);
  if (reverse) {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED).text(pdfSafe(REVERSE), PAGE.margin, y + 2, { maxWidth: 200 });
  }

  const pages = doc.getNumberOfPages();
  const contact = [company.name, formatPhone(company.phone), company.email, company.bankgiro && `Bankgiro ${company.bankgiro}`].filter(Boolean).join(' · ');
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text(pdfSafe(contact), PAGE.margin, PAGE.h - 7);
    doc.text(`Sida ${i} av ${pages}`, right, PAGE.h - 7, { align: 'right' });
  }
  return doc;
}

/** Render and save. jsPDF is loaded on demand so it stays out of the main bundle. */
export async function downloadUnderlagPdf(data, filename) {
  const { jsPDF: JsPDF } = await import('jspdf');
  build(JsPDF, data).save(filename);
}
