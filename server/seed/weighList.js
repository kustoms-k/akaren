import { addDays, isoWeekRange, stockholmDate } from '../lib/dates.js';
import { parseWeighList } from '../lib/weighList.js';

// Demo weighing lists (våglistor) as the receiving facilities would send them, built from the seeded lass so the
// reconciliation has something to find:
//   Ekbacka (imported by the seed): every lass of the week, except that the scale weighed one load 240 kg heavier
//     than logged, two loads were tipped but never logged, a hired truck tipped on our account, and the container
//     load is missing from the list.
//   Skogsås (a file to try the import with): tab separated like rows copied from Excel, weights in tonnes, ticket
//     numbers without the "SK-" prefix, and one load that was never logged.

const EKBACKA = { name: 'Ekbacka massmottagning', orgnr: '559404-1236' };

const lassTo = (db, companyId, facility, from, to) => db.prepare(`
  SELECT lass_id, datum, tid, vagsedel_nr, vehicle_regnr, netto_kg, material, project_id
  FROM lass_current WHERE company_id = ? AND till_namn = ? AND datum BETWEEN ? AND ?
  ORDER BY datum, tid, lass_id`).all(companyId, facility, from, to);

const digitsOf = (nr) => Number(String(nr ?? '').replace(/\D/g, '')) || 0;

/**
 * A ticket number for a weighing nobody logged: the facility's next free number after the tickets weighed before it
 * that day, so it falls in sequence and never collides with a ticket from another day.
 */
function freeTicket(db, companyId, facility, datum, tid) {
  const tickets = db.prepare('SELECT datum, tid, vagsedel_nr FROM lass_current WHERE company_id = ? AND till_namn = ?').all(companyId, facility);
  const used = new Set(tickets.map((t) => digitsOf(t.vagsedel_nr)));
  const before = tickets.filter((t) => t.datum < datum || (t.datum === datum && String(t.tid) < tid)).map((t) => digitsOf(t.vagsedel_nr));
  let n = Math.max(0, ...before) + 1;
  while (used.has(n)) n++;
  return n;
}

const later = (tid, minutes) => {
  const m = Number(tid.slice(0, 2)) * 60 + Number(tid.slice(3, 5)) + minutes;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const kgCell = (kg) => new Intl.NumberFormat('sv-SE').format(kg).replace(/ /g, ' ');
const tonCell = (kg) => (kg / 1000).toFixed(2).replace('.', ',');

/** The Ekbacka list for an ISO week as CSV text, in the facility's own export format. */
export function ekbackaListText(db, { companyId, week }) {
  const { from, to } = isoWeekRange(week);
  const all = lassTo(db, companyId, EKBACKA.name, from, to);
  const rorstrand = all.filter((l) => l.vehicle_regnr === 'TKA412');
  const onList = all.filter((l) => l.material !== 'Blandat byggavfall');       // the container load isn't on the list
  const rows = onList.map((l) => ({ ...l }));

  // The scale says 240 kg more than the driver logged for one load mid-week.
  const heavier = rows.find((r, i) => r.vehicle_regnr === 'TKA412' && i >= 8);
  if (heavier) heavier.netto_kg += 240;

  // Two loads tipped at the end of a day but never logged, on two different days.
  const ticket = (datum, tid) => `EKB${freeTicket(db, companyId, EKBACKA.name, datum, tid)}`;
  const days = [...new Set(rorstrand.map((l) => l.datum))];
  for (const [i, datum] of [days[1], days[3]].filter(Boolean).entries()) {
    const tid = later(rorstrand.filter((l) => l.datum === datum).at(-1).tid, 72);
    rows.push({ datum, tid, vagsedel_nr: ticket(datum, tid), vehicle_regnr: 'TKA412', netto_kg: [17860, 18240][i], material: 'Schaktmassor' });
  }
  // A hired truck (underåkare) tipping on our customer account.
  if (days[2]) {
    rows.push({ datum: days[2], tid: '10:05', vagsedel_nr: ticket(days[2], '10:05'), vehicle_regnr: 'UEB551', netto_kg: 16980, material: 'Schaktmassor' });
  }
  rows.sort((a, b) => a.datum.localeCompare(b.datum) || a.tid.localeCompare(b.tid));

  const head = [
    'Ekbacka massmottagning AB;;;;;;',
    'Ekbackavägen 3, 194 91 Upplands Väsby;;;;;;',
    `Vägningsrapport ${from} – ${to};;;;;;`,
    'Kund: Teståkeriet AB (kundnr 10442);;;;;;',
    ';;;;;;',
    'Datum;Tid;Vågsedelnr;Regnr;Artikel;Märkning;Netto (kg)',
  ];
  const ref = (r) => (r.vehicle_regnr === 'UEB551' ? 'NMA-2611' : r.material === 'Förorenade massor' ? 'NMA-2604' : 'NMA-2611');
  const body = rows.map((r) => [r.datum, r.tid, r.vagsedel_nr, r.vehicle_regnr.replace(/^(\D{3})/, '$1 '), r.material, ref(r), kgCell(r.netto_kg)].join(';'));
  const total = rows.reduce((s, r) => s + r.netto_kg, 0);
  return [...head, ...body, `Summa;;;;;;${kgCell(total)}`].join('\r\n');
}

/** The Skogsås list for an ISO week, as rows copied from Excel. */
export function skogsasListText(db, { companyId, week }) {
  const { from, to } = isoWeekRange(week);
  const all = lassTo(db, companyId, 'Skogsås återvinning', from, to);
  const rows = all.map((l) => ({ ...l }));
  const days = [...new Set(all.map((l) => l.datum))];
  if (days[1]) {
    const tid = later(all.filter((l) => l.datum === days[1]).at(-1).tid, 68);
    const nr = freeTicket(db, companyId, 'Skogsås återvinning', days[1], tid);
    rows.push({ datum: days[1], tid, vagsedel_nr: `SK-${nr}`, vehicle_regnr: 'TKA418', netto_kg: 16740, material: 'Schaktmassor' });
  }
  rows.sort((a, b) => a.datum.localeCompare(b.datum) || a.tid.localeCompare(b.tid));
  const lines = ['Datum/tid\tKvitto\tBil\tFraktion\tNettovikt ton'];
  for (const r of rows) lines.push([`${r.datum} ${r.tid}`, r.vagsedel_nr.replace(/\D/g, ''), r.vehicle_regnr, 'Jord och schaktmassor', tonCell(r.netto_kg)].join('\t'));
  return `${lines.join('\n')}\n`;
}

/** Import the Ekbacka list for `week` as the office would. Returns { listId, rows }. */
export function seedWeighList(db, { companyId, userId, week, now = new Date() }) {
  const text = ekbackaListText(db, { companyId, week });
  const parsed = parseWeighList(text);
  const createdAt = now.toISOString();
  return db.transaction(() => {
    const listId = Number(db.prepare(`
      INSERT INTO weigh_lists (company_id, facility_name, facility_orgnr, period_from, period_to, source_name, mapping_json,
        skipped_json, created_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`).run(
      companyId, EKBACKA.name, EKBACKA.orgnr, parsed.period.from, parsed.period.to,
      `vagningsrapport-ekbacka-${week.toLowerCase()}.csv`, JSON.stringify(parsed.mapping), userId, createdAt,
    ).lastInsertRowid);
    const insert = db.prepare(`
      INSERT INTO weigh_list_rows (weigh_list_id, company_id, line_no, datum, tid, vagsedel_nr, regnr, netto_kg, material, referens)
      VALUES (@weigh_list_id, @company_id, @line, @datum, @tid, @vagsedel_nr, @regnr, @netto_kg, @material, @referens)`);
    for (const r of parsed.rows) insert.run({ ...r, weigh_list_id: listId, company_id: companyId });
    return { listId, rows: parsed.rows.length, today: stockholmDate(now) };
  })();
}

/**
 * A demo invoice specification for the same week as ekbackaListText, as an åkeri's invoice export would look:
 * the invoice date on every row, the ticket number inside the description, tonnes and the row amount.
 * It bills the logged Rörstrand loads at the logged weight, except one load whose slip "never reached the office".
 * Against the Ekbacka list, Förlustkontroll then finds that load, the never-logged ones and the 240 kg difference.
 */
export function invoiceSpecText(db, { companyId, week }) {
  const { from, to } = isoWeekRange(week);
  const loads = lassTo(db, companyId, EKBACKA.name, from, to).filter((l) => l.vehicle_regnr !== 'LVX330');
  const forgotten = loads[Math.min(5, loads.length - 1)]?.lass_id;
  const invoiceDate = addDays(to, 1);
  const PRICE_ORE = 13200;   // Norrbacka's contract price per tonne in the demo price lists
  const dm = (d) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
  const kr = (ore) => (ore / 100).toFixed(2).replace('.', ',');
  const lines = ['Fakturanr;Fakturadatum;Kund;Benämning;Antal;Enhet;À-pris;Belopp'];
  for (const l of loads) {
    if (l.lass_id === forgotten) continue;
    const amount = Math.round((PRICE_ORE * l.netto_kg) / 1000);
    lines.push(['10418', invoiceDate, 'Norrbacka Mark & Anläggning AB', `${l.vagsedel_nr} ${dm(l.datum)} ${l.material}`,
      (l.netto_kg / 1000).toFixed(2).replace('.', ','), 'ton', kr(PRICE_ORE), kr(amount)].join(';'));
  }
  return `${lines.join('\r\n')}\r\n`;
}

