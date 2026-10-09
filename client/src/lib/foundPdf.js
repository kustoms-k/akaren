import { FOUND_KIND, formatDate, formatDateTime, formatKr, formatTon } from './labels.js';
import { BRAND, INK, MUTED, PAGE, pdfSafe, table } from './pdfKit.js';

// Hittat av Lasskoll as a PDF (A4 landscape): what was found and what it's worth, with every find listed so the
// customer can check it. Used at the end of a pilot for the guarantee.

const GREEN = [21, 128, 61];
const localDate = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(iso));

const weight = (i) => (i.kind === 'lass' ? formatTon(i.netto_kg) : `${formatTon(i.from_kg).replace(' t', '')} -> ${formatTon(i.to_kg)}`);
const value = (i) => (i.value_ore == null ? 'Inget pris' : i.kind === 'vikt_ned' ? '-' : formatKr(i.value_ore));

function build(JsPDF, { found, company }) {
  const t = found.totals;
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: pdfSafe(`Hittat av Lasskoll ${company?.name ?? ''}`.trim()), creator: 'Lasskoll' });
  const right = PAGE.w - PAGE.margin;

  let y = PAGE.margin + 4;
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...BRAND).text('Hittat av Lasskoll', PAGE.margin, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
    .text(pdfSafe(`Skapad ${formatDateTime(new Date().toISOString())}`), right, y, { align: 'right' });
  y += 7;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK).text(pdfSafe(company?.name ?? ''), PAGE.margin, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED).text(pdfSafe(
    `${t.first_found_at ? `Sedan ${formatDate(localDate(t.first_found_at))}: ` : ''}mottagarnas våglistor jämförda med loggade lass. `
    + 'Lass som vägdes men aldrig loggades, och vikter som rättats mot vågen.',
  ), PAGE.margin, y);

  y += 11;
  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...GREEN)
    .text(pdfSafe(`${formatKr(t.value_ore, { round: true })} som annars inte hade fakturerats`), PAGE.margin, y);
  y += 7;
  const parts = [
    `${t.lass} lass som saknades (${formatKr(t.lass_value_ore, { round: true })})`,
    t.weight_up ? `${t.weight_up} ${t.weight_up === 1 ? 'vikt' : 'vikter'} rättade uppåt (${formatKr(t.weight_up_value_ore, { round: true })})` : null,
    t.weight_down ? `${t.weight_down} ${t.weight_down === 1 ? 'vikt' : 'vikter'} rättade nedåt före fakturan` : null,
  ].filter(Boolean);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK).text(pdfSafe(parts.join(' · ')), PAGE.margin, y);
  y += 8;

  y = table(doc, y, [
    { label: 'Hittat', width: 20, get: (i) => formatDate(i.found_date) },
    { label: 'Vad', width: 34, get: (i) => FOUND_KIND[i.kind] },
    { label: 'Lass', width: 38, get: (i) => `${i.vagsedel_nr ?? `#${i.lass_id}`} · ${formatDate(i.datum)}` },
    { label: 'Kund', width: 50, get: (i) => i.customer_name },
    { label: 'Projekt', width: 38, get: (i) => i.project_name },
    { label: 'Mottagare', width: 40, get: (i) => i.facility_name ?? '' },
    { label: 'Vikt', width: 28, align: 'right', get: weight },
    { label: 'Värde', width: 21, align: 'right', get: value },
  ], found.items);

  y += 7;
  if (y > PAGE.h - PAGE.margin - 18) { doc.addPage(); y = PAGE.margin + 4; }
  const notes = [
    'Värdet är lassets rad på fakturaunderlaget: det fakturerade beloppet när lasset är fakturerat, annars kundens pris gånger vikten (exkl. moms).',
    t.unpriced ? `${t.unpriced} fynd har inget pris (timpris, fast pris eller pris saknas) och räknas inte in i summan.` : null,
  ].filter(Boolean);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
  for (const n of notes) { doc.text(pdfSafe(n), PAGE.margin, y, { maxWidth: 260 }); y += 5; }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text('Lasskoll · Koll på varje lass', PAGE.margin, PAGE.h - 7);
    doc.text(`Sida ${p} av ${pages}`, right, PAGE.h - 7, { align: 'right' });
  }
  return doc;
}

/** Render and save. jsPDF is loaded on demand so it stays out of the main bundle. */
export async function downloadFoundPdf(data, filename) {
  const { jsPDF: JsPDF } = await import('jspdf');
  build(JsPDF, data).save(filename);
}
