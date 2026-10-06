import { formatDate, formatDateTime, formatKr, formatTon } from './labels.js';
import { BRAND, INK, MUTED, PAGE, pdfSafe, table } from './pdfKit.js';

// Förlustkontroll as a PDF (A4 landscape) to leave with the åkeri: what was weighed, what was invoiced, and
// what fell between. Built client-side with jsPDF's standard Helvetica.

const GREEN = [21, 128, 61];
const RED = [194, 65, 12];
const ton = (kg) => (kg == null ? '' : formatTon(kg).replace(' t', ''));
const kr = (ore) => (ore == null ? '' : pdfSafe(formatKr(ore)).replace(/\s?kr$/, ''));
const weekLabel = (key) => `v. ${Number(key.split('-W')[1])} ${key.slice(0, 4)}`;

function build(JsPDF, r) {
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: pdfSafe(`Förlustkontroll ${r.prospect_name ?? ''}`.trim()), creator: 'Lasskoll' });
  const t = r.totals;
  const right = PAGE.w - PAGE.margin;

  let y = PAGE.margin + 4;
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...BRAND).text('Förlustkontroll', PAGE.margin, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED).text(pdfSafe(`Skapad ${formatDateTime(r.generated_at)}`), right, y, { align: 'right' });
  y += 7;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK)
    .text(pdfSafe(`${r.prospect_name ? `${r.prospect_name} · ` : ''}${r.facility_name}`), PAGE.margin, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
    .text(pdfSafe(`Våglistan ${formatDate(r.period.from)} - ${formatDate(r.period.to)} jämförd vågsedel för vågsedel med fakturaspecifikationen.`), PAGE.margin, y);

  // The headline: what was never invoiced and what it was worth.
  y += 11;
  const value = t.total_value_ore;
  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...(value > 0 ? RED : GREEN))
    .text(pdfSafe(value > 0 ? `${formatKr(value, { round: true })} ofakturerat` : 'Allt är fakturerat'), PAGE.margin, y);
  y += 7;
  const parts = [
    `${t.weighed} vägningar (${ton(t.weighed_kg)} t)`,
    `${t.matched} hittade på fakturorna`,
    t.missing ? `${t.missing} lass (${ton(t.missing_kg)} t) saknas på fakturorna` : 'inga lass saknas',
    t.diff_kg ? `${ton(t.diff_kg)} t fakturerat för lite` : null,
  ].filter(Boolean);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK).text(pdfSafe(parts.join(' · ')), PAGE.margin, y);
  y += 5;
  if (r.price) {
    const unit = r.price.unit === 'ton' ? 'per ton' : 'per lass';
    const source = r.price.source === 'fakturor' ? 'enligt fakturorna' : 'angivet pris';
    doc.setFontSize(9).setTextColor(...MUTED).text(pdfSafe(`Värderat med ${formatKr(r.price.ore)} ${unit} (${source}), exkl. moms.`), PAGE.margin, y);
    y += 4;
  }

  if (r.missing.length) {
    y += 6;
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text('Vägda men inte fakturerade', PAGE.margin, y);
    y += 2;
    y = table(doc, y, [
      { label: 'Datum', width: 30, get: (m) => formatDate(m.datum) },
      { label: 'Tid', width: 16, get: (m) => m.tid ?? '' },
      { label: 'Vågsedel', width: 34, get: (m) => m.vagsedel_nr ?? '-' },
      { label: 'Regnr', width: 24, get: (m) => m.regnr ?? '-' },
      { label: 'Material', width: 70, get: (m) => m.material ?? '-' },
      { label: 'Märkning', width: 40, get: (m) => m.referens ?? '' },
      { label: 'Netto (t)', width: 26, align: 'right', get: (m) => ton(m.netto_kg) },
      { label: 'Värde (kr)', width: 29, align: 'right', get: (m) => kr(m.value_ore) },
    ], r.missing);
  }

  if (r.differences.length) {
    y += 8;
    if (y > PAGE.h - PAGE.margin - 24) { doc.addPage(); y = PAGE.margin + 4; }
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text('Fakturerat med lägre vikt än vågen', PAGE.margin, y);
    y += 2;
    y = table(doc, y, [
      { label: 'Datum', width: 30, get: (d) => formatDate(d.datum) },
      { label: 'Vågsedel', width: 34, get: (d) => d.vagsedel_nr ?? '-' },
      { label: 'Regnr', width: 24, get: (d) => d.regnr ?? '-' },
      { label: 'Fakturarad', width: 86, get: (d) => d.invoice_text ?? '' },
      { label: 'Vägt (t)', width: 24, align: 'right', get: (d) => ton(d.weighed_kg) },
      { label: 'Fakturerat (t)', width: 28, align: 'right', get: (d) => ton(d.invoiced_kg) },
      { label: 'Skillnad (t)', width: 24, align: 'right', get: (d) => ton(d.diff_kg) },
      { label: 'Värde (kr)', width: 19, align: 'right', get: (d) => kr(d.value_ore) },
    ], r.differences);
  }

  y += 8;
  if (y > PAGE.h - PAGE.margin - 24) { doc.addPage(); y = PAGE.margin + 4; }
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text('Per vecka', PAGE.margin, y);
  y += 2;
  table(doc, y, [
    { label: 'Vecka', width: 40, get: (w) => weekLabel(w.week) },
    { label: 'Vägningar', width: 30, align: 'right', get: (w) => String(w.weighed) },
    { label: 'Vägt (t)', width: 34, align: 'right', get: (w) => ton(w.weighed_kg) },
    { label: 'Fakturarader', width: 34, align: 'right', get: (w) => String(w.invoiced) },
    { label: 'Fakturerat (t)', width: 34, align: 'right', get: (w) => (w.invoiced_kg ? ton(w.invoiced_kg) : '') },
    { label: 'Saknas', width: 26, align: 'right', get: (w) => String(w.missing) },
  ], r.weeks);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED)
      .text(pdfSafe('Gjord med Lasskoll. Värdet är en uppskattning; kontrollera mot vågsedlarna innan ni fakturerar i efterhand.'), PAGE.margin, PAGE.h - 7)
      .text(`${i} / ${pages}`, right, PAGE.h - 7, { align: 'right' });
  }
  return doc;
}

/** Build and save the report. jsPDF loads lazily (it's large). */
export async function downloadLossPdf(result, filename) {
  const { jsPDF: JsPDF } = await import('jspdf');
  build(JsPDF, result).save(filename);
}
