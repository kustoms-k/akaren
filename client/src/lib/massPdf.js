import { formatAddress, formatDate, formatDateTime, formatTon } from './labels.js';
import { BRAND, INK, MUTED, PAGE, pdfSafe, table } from './pdfKit.js';

// Massredovisning as a PDF (A4 landscape), built client-side with jsPDF's standard Helvetica.

const REVIEW = { ok: 'OK', behover_granskas: 'Ska granskas', granskad: 'Granskad' };

const ton = (kg) => (kg == null ? '' : formatTon(kg).replace(' t', ''));

function build(JsPDF, report) {
  const { project, company, from, to, rows, summary, totals, generated_at: generatedAt } = report;
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: pdfSafe(`Massredovisning ${project.name}`), creator: 'Lasskoll' });

  let y = PAGE.margin + 4;
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...BRAND).text('Massredovisning', PAGE.margin, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
    .text(pdfSafe(`${company.name}${company.org_nr ? ` · org.nr ${company.org_nr}` : ''}`), PAGE.w - PAGE.margin, y, { align: 'right' });
  y += 7;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK).text(pdfSafe(project.name), PAGE.margin, y);
  y += 6;

  const period = from || to ? `${from ? formatDate(from) : 'Projektets början'} - ${to ? formatDate(to) : 'idag'}` : 'Hela projektet';
  const facts = [
    ['Kund', `${project.customer_name}${project.customer_org_nr ? ` (${project.customer_org_nr})` : ''}`],
    ['Er referens', project.customer_ref],
    ['Arbetsplats', formatAddress(project)],
    ['Period', `${period}${from && to ? ` (${from} - ${to})` : ''}`],
    ['Skapad', formatDateTime(generatedAt)],
  ].filter(([, v]) => v);
  doc.setFontSize(9);
  for (const [label, value] of facts) {
    doc.setTextColor(...MUTED).text(pdfSafe(label), PAGE.margin, y);
    doc.setTextColor(...INK).text(pdfSafe(value), PAGE.margin + 26, y);
    y += 4.8;
  }

  y += 2;
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK)
    .text(pdfSafe(`${totals.count} lass · ${ton(totals.netto_kg)} ton netto`), PAGE.margin, y);
  const notes = [
    totals.farligt_avfall && `${totals.farligt_avfall} med farligt avfall`,
    totals.unreviewed && `${totals.unreviewed} ej granskade`,
    totals.missing_weight && `${totals.missing_weight} utan vikt`,
  ].filter(Boolean);
  if (notes.length) doc.setFont('helvetica', 'normal').setTextColor(...MUTED).text(pdfSafe(notes.join(' · ')), PAGE.margin + 80, y);
  y += 5;

  y = table(doc, y, [
    { label: 'Material', width: 70, get: (g) => g.material ?? '-' },
    { label: 'Avfallskod', width: 24, get: (g) => g.avfallskod },
    { label: 'Farligt', width: 16, get: (g) => (g.farligt_avfall ? 'Ja' : '') },
    { label: 'Till', width: 115, get: (g) => g.till_namn ?? '-' },
    { label: 'Lass', width: 18, align: 'right', get: (g) => String(g.count) },
    { label: 'Netto (t)', width: 26, align: 'right', get: (g) => ton(g.netto_kg) },
  ], summary);

  y += 8;
  if (y > PAGE.h - PAGE.margin - 20) { doc.addPage(); y = PAGE.margin; }
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text('Lass', PAGE.margin, y);
  y += 2;
  table(doc, y, [
    { label: 'Datum', width: 19, get: (r) => r.datum },
    { label: 'Tid', width: 10, get: (r) => r.tid },
    { label: 'Vågsedel', width: 22, get: (r) => r.vagsedel_nr },
    { label: 'Regnr', width: 15, get: (r) => r.vehicle_regnr },
    { label: 'Material', width: 34, get: (r) => r.material },
    { label: 'Avfallskod', width: 20, get: (r) => r.avfallskod },
    { label: 'FA', width: 8, get: (r) => (r.farligt_avfall ? 'Ja' : '') },
    { label: 'Netto (t)', width: 16, align: 'right', get: (r) => ton(r.netto_kg) },
    { label: 'Från', width: 38, get: (r) => r.fran_text },
    { label: 'Till', width: 55, get: (r) => [r.till_namn, r.till_orgnr].filter(Boolean).join(', ') },
    { label: 'Status', width: 32, get: (r) => (r.farligt_avfall && r.hazard_reported_on ? `${REVIEW[r.review_status]} · rapp.` : REVIEW[r.review_status]) },
  ], rows);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text(pdfSafe(`Massredovisning · ${project.name}`), PAGE.margin, PAGE.h - 7);
    doc.text(`Sida ${i} av ${pages}`, PAGE.w - PAGE.margin, PAGE.h - 7, { align: 'right' });
  }
  return doc;
}

/** Render and save the PDF. jsPDF is loaded on demand so it isn't part of the main bundle. */
export async function downloadMassPdf(report, filename) {
  const { jsPDF: JsPDF } = await import('jspdf');
  build(JsPDF, report).save(filename);
}
