import { getToken } from './api.js';
import { formatDate, formatDateTime, formatKr, formatPhone, formatQty } from './labels.js';
import { BRAND, INK, MUTED, PAGE, RULE, fit, pdfSafe, table } from './pdfKit.js';

// Fakturaunderlag for one customer + project and week, as an A4 PDF for customers invoiced outside Fortnox.
// After the totals comes the evidence: a photo of the vågsedel behind every lass row, so a disputed load can be
// settled from the PDF itself.

// Slip photos are scaled down before they go into the PDF: 900 px over the 84 mm cell is about 270 dpi, enough to
// read a slip, and keeps a week of loads at a few MB.
const SLIP_EDGE = 900;
const SLIP_QUALITY = 0.72;

async function slipImage(photoId) {
  const res = await fetch(`/api/photos/${encodeURIComponent(photoId)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(String(res.status));
  const bitmap = await createImageBitmap(await res.blob());
  const scale = Math.min(1, SLIP_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return { data: canvas.toDataURL('image/jpeg', SLIP_QUALITY), w, h };
}

/** Every slip photo of the rows, a few at a time. A photo that can't be fetched maps to null. */
async function loadSlips(rows, concurrency = 4) {
  const ids = [...new Set(rows.map((r) => r.photo_id).filter(Boolean))];
  const images = new Map();
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      images.set(id, await slipImage(id).catch(() => null));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return images;
}

/** The appendix: six slips per page, in the order of the rows, each with its ticket, date, truck and weight. */
function slipPages(doc, { group, weekLabel, images }) {
  const rows = group.rows.filter((r) => r.kind === 'lass');
  if (!rows.length) return;
  const cols = 3;
  const perPage = 6;
  const gap = 8;
  const top = PAGE.margin + 13;
  const cellW = (PAGE.w - 2 * PAGE.margin - gap * (cols - 1)) / cols;
  const cellH = (PAGE.h - top - PAGE.margin - 8 - gap) / 2;
  const boxH = cellH - 11;
  rows.forEach((r, i) => {
    if (i % perPage === 0) {
      doc.addPage();
      doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...BRAND).text('Vågsedlar', PAGE.margin, PAGE.margin + 4);
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
        .text(pdfSafe(`${group.customer.name} · ${group.project.name} · ${weekLabel}`), PAGE.w - PAGE.margin, PAGE.margin + 4, { align: 'right' });
    }
    const k = i % perPage;
    const x = PAGE.margin + (k % cols) * (cellW + gap);
    const y = top + Math.floor(k / cols) * (cellH + gap);
    const img = r.photo_id ? images.get(r.photo_id) : null;
    if (img) {
      const s = Math.min(cellW / img.w, boxH / img.h);
      const iw = img.w * s;
      const ih = img.h * s;
      doc.addImage(img.data, 'JPEG', x + (cellW - iw) / 2, y + (boxH - ih) / 2, iw, ih, r.photo_id, 'NONE');
    } else {
      doc.setFillColor(246, 245, 241).setDrawColor(...RULE).roundedRect(x, y, cellW, boxH, 2, 2, 'FD');
      const why = r.photo_id ? 'Bilden kunde inte hämtas.'
        : r.weigh_list ? `Ingen bild. Lasset skapades från våglistan från ${r.weigh_list.facility_name}, rad ${r.weigh_list.line_no}.`
          : 'Ingen bild på vågsedeln.';
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
        .text(pdfSafe(why), x + cellW / 2, y + boxH / 2, { align: 'center', maxWidth: cellW - 16, baseline: 'middle' });
    }
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK)
      .text(fit(doc, `${r.vagsedel_nr ?? 'Utan vågsedel'} · ${formatDate(r.datum)}`, cellW), x, y + boxH + 5);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED).text(fit(doc, r.detail ?? '', cellW), x, y + boxH + 9);
  });
}

const REVERSE = 'Omvänd betalningsskyldighet för byggtjänster enligt 16 kap. 13 § mervärdesskattelagen. Köparen redovisar momsen.';

function rowStatus(r, labels) {
  if (r.invoiced) return r.invoiced.kind === 'fortnox' ? `Fortnox ${r.invoiced.fortnox_document_nr ?? ''}`.trim() : 'Låst';
  return r.blockers.length ? r.blockers.map((b) => labels[b]).join(', ') : 'Klar';
}

function build(JsPDF, { group, company, weekLabel, labels }, images) {
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: pdfSafe(`Fakturaunderlag ${group.customer.name} ${weekLabel}`), creator: 'Lasskoll' });
  const right = PAGE.w - PAGE.margin;

  let y = PAGE.margin + 4;
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...BRAND).text('Fakturaunderlag', PAGE.margin, y);
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

  if (images) slipPages(doc, { group, weekLabel, images });

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

/**
 * Render and save, with the slip photos unless `slips` is false. jsPDF is loaded on demand so it stays out of the
 * main bundle.
 */
export async function downloadUnderlagPdf(data, filename, { slips = true } = {}) {
  const [{ jsPDF: JsPDF }, images] = await Promise.all([import('jspdf'), slips ? loadSlips(data.group.rows) : null]);
  build(JsPDF, data, images).save(filename);
}
