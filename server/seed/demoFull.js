import { addDays, isoWeek, isoWeekRange, isoWeekday } from '../lib/dates.js';
import { billableRows } from '../lib/fakturaunderlag.js';
import { WEIGH_LIST_FIX_REASON } from '../lib/foundValue.js';
import { submittedConfidence } from '../lib/lassReview.js';
import { createUnderlagLoader } from '../services/underlag.js';
import { randomHelpers } from './demo.js';

// The whole demo company for the demo instances (seedDemo({ full: true })): Lagerviks Åkeri AB with 14 vehicles,
// 13 drivers, 7 customers and 10 projects, and two more weeks of history before the base data's two weeks. The
// history is what a company looks like after a month on Lasskoll: invoiced weeks (Fortnox drafts and locked PDFs),
// reconciled weighing lists with loads found and weights corrected, and reported hazardous waste.
//
// Everything is fictional; the numbers are not. Price levels follow published 2024–2026 price lists:
//   - crane truck (30 tonne-metres) 1 350–1 365 kr/h ex VAT in 2026 (AMK Transport, Skogås; Svelands Transport),
//   - bergkross 0/32 138–151 kr/t at the Stockholm quarries in 2024 (Heidelberg Materials), 108 kr/t at Lövstad in
//     2026 (Svevia); receiving clean schaktmassor 96–265 kr/t (Svevia Lövstad 2026, Heidelberg Tyska Botten 2024).
// The åkeri bills transport; the contractor pays the tip and the quarry, so the per-ton prices here are transport only.
// A four-axle tipper carries 15–19 t, a truck and trailer (bil och släp) 28–34 t. Waste codes are the EWC codes used on
// Swedish vågsedlar: 17 05 04 soil and stones, 17 05 03* contaminated soil, 17 09 04 mixed construction waste,
// 17 01 01 concrete.
//
// The base data (seed/demo.js) is untouched: new trucks tip at new facilities in the base weeks, and the history uses
// ticket numbers below the base ones. Phone numbers stay in PTS's fiction range 070-174 06 05–99; email domains were
// checked to be unregistered when chosen.

const VEHICLES = [
  { key: 'ndp58c', regnr: 'NDP58C', typ: 'tippbil', miljozonsklass: 1, tara: 14120 },
  { key: 'gzr114', regnr: 'GZR114', typ: 'tippbil', miljozonsklass: 1, tara: 14300 },
  { key: 'hkt209', regnr: 'HKT209', typ: 'tippbil', miljozonsklass: 1, tara: 14060 },
  { key: 'ljb73f', regnr: 'LJB73F', typ: 'tippbil', miljozonsklass: 1, tara: 14410 },
  { key: 'rsk556', regnr: 'RSK556', typ: 'tippbil', miljozonsklass: 1, tara: 19820 },     // bil och släp
  { key: 'kpf683', regnr: 'KPF683', typ: 'kranbil', miljozonsklass: 1, tara: 21400 },
  { key: 'lvx341', regnr: 'LVX341', typ: 'lastvaxlare', miljozonsklass: 1, tara: 13300 },
  { key: 'mtr90a', regnr: 'MTR90A', typ: 'trailer', miljozonsklass: 1, tara: 16900 },     // maskintransport
  { key: 'bxe31d', regnr: 'BXE31D', typ: 'tippbil', miljozonsklass: 0, tara: 12100 },     // older Euro V reserve truck
];

const DRIVERS = [
  { key: 'ali', name: 'Ali Rezaei', phone: '+46701740640' },
  { key: 'emma', name: 'Emma Sjöberg', phone: '+46701740641' },
  { key: 'patrik', name: 'Patrik Nyström', phone: '+46701740642' },
  { key: 'dragan', name: 'Dragan Petrović', phone: '+46701740643' },
  { key: 'linus', name: 'Linus Ahlgren', phone: '+46701740644' },
  { key: 'kristoffer', name: 'Kristoffer Holm', phone: '+46701740645' },
  { key: 'nils', name: 'Nils Öberg', phone: '+46701740646' },
  { key: 'marcus', name: 'Marcus Johansson', phone: '+46701740647' },
  { key: 'erik', name: 'Erik Dahl', phone: '+46701740648' },
];

const FACILITIES = {
  kvarnbo:  { namn: 'Kvarnbo massmottagning', orgnr: '559417-3303', adress: 'Kvarnbovägen 12, Upplands-Bro', prefix: 'KVB', start: 230400 },
  hastholm: { namn: 'Hästholmens återvinning', orgnr: null, adress: 'Hästholmsvägen 6, Haninge', prefix: 'HH', start: 51200 },
  bjorkvik: { namn: 'Björkviks bergtäkt', orgnr: '559228-6149', adress: 'Björkviksvägen 30, Södertälje', prefix: 'BV', start: 88800 },
};

const PRICE_LISTS = [
  {
    key: 'brunnsviken', name: 'Brunnsvikens Bygg – timpris 2026',
    items: [
      { uppdragstyp: 'schakt', unit: 'timme', price_ore: 109500 },
      { uppdragstyp: 'kran', unit: 'timme', price_ore: 136500 },
    ],
  },
  {
    key: 'malarstrand', name: 'Mälarstrand – avtal 2026',
    items: [
      { uppdragstyp: 'schakt', unit: 'ton', price_ore: 11800 },
      { uppdragstyp: 'grus_leverans', unit: 'ton', price_ore: 8600 },
      { uppdragstyp: 'maskintransport', unit: 'timme', price_ore: 149500 },
    ],
  },
  {
    key: 'nordvik', name: 'Nordvik – avtal 2026',
    items: [
      { uppdragstyp: 'schakt', unit: 'lass', price_ore: 265000 },
      { uppdragstyp: 'container', unit: 'fast', price_ore: 425000 },
    ],
  },
];

const CUSTOMERS = [
  {
    key: 'brunnsviken', name: 'Brunnsvikens Byggnads AB', org_nr: '559336-1701', address: 'Råsundavägen 98', postnr: '16957',
    ort: 'Solna', email: 'ekonomi@brunnsvikensbygg.se', price_list: 'brunnsviken', vat_mode: 'omvand_bygg', fortnox: '1021',
  },
  {
    key: 'malarstrand', name: 'Mälarstrands Anläggning AB', org_nr: '559471-2050', address: 'Wedavägen 14', postnr: '15242',
    ort: 'Södertälje', email: 'faktura@malarstrandsanlaggning.se', price_list: 'malarstrand', vat_mode: 'omvand_bygg', fortnox: '1024',
  },
  {
    key: 'vendelso', name: 'Vendelsö Exploatering AB', org_nr: '559189-4331', address: 'Vendelsövägen 33', postnr: '13670',
    ort: 'Vendelsö', email: 'inkop@vendelsoexploatering.se', price_list: null, vat_mode: null, fortnox: null,
  },
  {
    key: 'nordvik', name: 'Nordviks Bygg & Fastighet AB', org_nr: '559052-7189', address: 'Hammarby allé 62', postnr: '12063',
    ort: 'Stockholm', email: 'faktura@nordviksbygg.se', price_list: 'nordvik', vat_mode: 'omvand_bygg', fortnox: '1027',
  },
];
// The base customers in Fortnox. Saltsjö Bygg and Vendelsö are invoiced outside it (locked underlag, PDF).
const BASE_FORTNOX = { norrbacka: '1012', ekhagen: '1015' };

const PROJECTS = [
  {
    key: 'hagalund', customer: 'brunnsviken', name: 'Hagalund kv. Tallen – grundläggning', customer_ref: 'BB-2291',
    address: 'Hagalundsgatan 20', postnr: '16964', ort: 'Solna', miljozon: 0, kontaktperson: 'Maria Wennerholm', telefon: '+46701740650',
  },
  {
    key: 'moraberg', customer: 'malarstrand', name: 'Moraberg logistikpark – markarbeten', customer_ref: 'MSA-4410',
    address: 'Morabergsvägen 30', postnr: '15242', ort: 'Södertälje', miljozon: 0, kontaktperson: 'Johan Ekström', telefon: '+46701740651',
  },
  {
    key: 'sodertalje', customer: 'malarstrand', name: 'Södertälje Syd – VA-ledning etapp 2', customer_ref: 'MSA-4417',
    address: 'Södra Wedavägen 2', postnr: '15242', ort: 'Södertälje', miljozon: 0, kontaktperson: 'Henrik Alm', telefon: '+46701740652',
  },
  {
    key: 'vendelso', customer: 'vendelso', name: 'Vendelsö gård etapp 2 – gata och VA', customer_ref: 'VE-12',
    address: 'Vendelsövägen 120', postnr: '13670', ort: 'Vendelsö', miljozon: 0, kontaktperson: 'Sofia Lindqvist', telefon: '+46701740653',
  },
  {
    key: 'kolen', customer: 'nordvik', name: 'Hammarby sjöstad kv. Kölen – schakt', customer_ref: 'NBF-3302',
    address: 'Lumaparksvägen 9', postnr: '12031', ort: 'Stockholm', miljozon: 1, kontaktperson: 'Anders Blom', telefon: '+46701740654',
  },
  {
    key: 'lovet', customer: 'nordvik', name: 'Liljeholmen kv. Lövet – rivning', customer_ref: 'NBF-3315',
    address: 'Liljeholmsvägen 18', postnr: '11761', ort: 'Stockholm', miljozon: 1, kontaktperson: 'Anna Fors', telefon: '+46701740655',
  },
];

const SCHAKT = { material: 'Schaktmassor', avfallskod: '170504' };
const round20 = (kg) => Math.round(kg / 20) * 20;
const weekdaysOf = (week) => { const { from } = isoWeekRange(week); return [0, 1, 2, 3, 4].map((i) => addDays(from, i)); };
const shiftWeekKey = (week, n) => isoWeek(addDays(isoWeekRange(week).from, 7 * n)).key;

/**
 * Seed the rest of the company inside seedDemo's transaction. `ctx` carries seedDemo's statements, helpers and
 * registries, which this extends. Returns a summary.
 */
export function seedFullCompany(ctx) {
  const {
    db, ins, companyId, userId, at, today, days, previousWeek, ids, counts, jobs: baseJobs,
    vehicles, projectsByKey, facilities, counters, assign, addLass, addVersion, HIGH,
  } = ctx;

  // ── Registers ──
  for (const v of VEHICLES) {
    ids.vehicles[v.key] = Number(ins.vehicle.run(companyId, v.regnr, v.typ, v.miljozonsklass).lastInsertRowid);
    vehicles.set(v.key, v);
  }
  for (const d of DRIVERS) ids.drivers[d.key] = Number(ins.driver.run(companyId, d.name, d.phone).lastInsertRowid);
  for (const pl of PRICE_LISTS) {
    const id = Number(ins.priceList.run(companyId, pl.name, 0).lastInsertRowid);
    ids.priceLists[pl.key] = id;
    for (const it of pl.items) ins.priceItem.run(id, it.uppdragstyp ?? null, it.material ?? null, it.unit, it.price_ore);
  }
  const setFortnox = db.prepare('UPDATE customers SET fortnox_customer_nr = ? WHERE id = ?');
  for (const c of CUSTOMERS) {
    ids.customers[c.key] = Number(ins.customer.run({
      company_id: companyId, name: c.name, org_nr: c.org_nr, address: c.address, postnr: c.postnr, ort: c.ort,
      email: c.email, price_list_id: c.price_list ? ids.priceLists[c.price_list] : null, vat_mode: c.vat_mode,
    }).lastInsertRowid);
    if (c.fortnox) setFortnox.run(c.fortnox, ids.customers[c.key]);
  }
  for (const [key, nr] of Object.entries(BASE_FORTNOX)) setFortnox.run(nr, ids.customers[key]);
  for (const p of PROJECTS) {
    const { key, customer, ...rest } = p;
    ids.projects[key] = Number(ins.project.run({ company_id: companyId, customer_id: ids.customers[customer], ...rest }).lastInsertRowid);
    projectsByKey.set(key, p);
  }
  Object.assign(facilities, FACILITIES);

  // ── Weeks ──
  const histWeeks = [shiftWeekKey(previousWeek, -2), shiftWeekKey(previousWeek, -1)];
  const histDays = histWeeks.flatMap(weekdaysOf);
  const histStart = histDays[0];
  const nextMonday = addDays(isoWeekRange(shiftWeekKey(previousWeek, 2)).from, 0);
  const nextFriday = addDays(nextMonday, 4);

  // The base jobs started with the history, not with the base weeks.
  const startEarlier = db.prepare('UPDATE jobs SET datum_fran = ?, created_at = ? WHERE id = ?');
  for (const key of ['rorstrand', 'taby', 'orminge', 'kran']) startEarlier.run(histStart, at(addDays(histStart, -4), '10:40'), baseJobs[key]);

  // ── New jobs ──
  const insJob = (def) => Number(ins.job.run({
    company_id: companyId, created_by_user_id: userId, created_at: at(addDays(def.datum_fran ?? histStart, -3), '13:20'),
    uppskattad_mangd: null, mangd_enhet: null, antal_lass: null, tid: '07:00', instruktioner: null,
    datum_fran: histStart, datum_till: nextFriday, status: 'pagar', ...def,
  }).lastInsertRowid);
  const proj = (key) => projectsByKey.get(key);
  const site = (key) => `${proj(key).address}, ${proj(key).ort}`;
  const cust = (key) => ids.customers[proj(key).customer];
  const jobs = {
    hagalund: insJob({
      customer_id: cust('hagalund'), project_id: ids.projects.hagalund, uppdragstyp: 'schakt', material: 'Schaktmassor',
      fran_text: site('hagalund'), till_text: `${FACILITIES.kvarnbo.namn}, Upplands-Bro`,
      instruktioner: 'Timdebiterat. Lastas av kundens grävare, kvittera timmar i appen varje dag.',
      kontaktperson: proj('hagalund').kontaktperson, telefon: proj('hagalund').telefon,
    }),
    hagalundKran: insJob({
      customer_id: cust('hagalund'), project_id: ids.projects.hagalund, uppdragstyp: 'kran', material: null, fran_text: null,
      till_text: site('hagalund'), instruktioner: 'Lyft av kantstöd och formvirke. Max 30 tm vid grävkanten.',
      kontaktperson: proj('hagalund').kontaktperson, telefon: proj('hagalund').telefon,
    }),
    moraberg: insJob({
      customer_id: cust('moraberg'), project_id: ids.projects.moraberg, uppdragstyp: 'schakt', material: 'Schaktmassor',
      uppskattad_mangd: 6500, mangd_enhet: 'ton', fran_text: site('moraberg'), till_text: `${FACILITIES.bjorkvik.namn}, Södertälje`,
      instruktioner: 'Bil och släp. Morän och lera, vägs på Björkviks bilvåg.', kontaktperson: proj('moraberg').kontaktperson,
      telefon: proj('moraberg').telefon,
    }),
    morabergMaskin: insJob({
      customer_id: cust('moraberg'), project_id: ids.projects.moraberg, uppdragstyp: 'maskintransport', material: null,
      fran_text: 'Wedavägen 14, Södertälje', till_text: site('moraberg'), instruktioner: 'Flytt av 25-tons bandgrävare mellan etapperna.',
      kontaktperson: proj('moraberg').kontaktperson, telefon: proj('moraberg').telefon,
    }),
    sodertalje: insJob({
      customer_id: cust('sodertalje'), project_id: ids.projects.sodertalje, uppdragstyp: 'grus_leverans', material: 'Makadam 16–32',
      uppskattad_mangd: 1800, mangd_enhet: 'ton', fran_text: `${FACILITIES.bjorkvik.namn}, Södertälje`, till_text: site('sodertalje'),
      instruktioner: 'Ledningsbädd. Tippas vid schaktets norra ände.', kontaktperson: proj('sodertalje').kontaktperson,
      telefon: proj('sodertalje').telefon,
    }),
    vendelso: insJob({
      customer_id: cust('vendelso'), project_id: ids.projects.vendelso, uppdragstyp: 'schakt', material: 'Schaktmassor',
      fran_text: site('vendelso'), till_text: `${FACILITIES.hastholm.namn}, Haninge`, kontaktperson: proj('vendelso').kontaktperson,
      telefon: proj('vendelso').telefon,
    }),
    kolen: insJob({
      customer_id: cust('kolen'), project_id: ids.projects.kolen, uppdragstyp: 'schakt', material: 'Schaktmassor',
      uppskattad_mangd: 240, mangd_enhet: 'lass', fran_text: site('kolen'), till_text: `${FACILITIES.kvarnbo.namn}, Upplands-Bro`,
      instruktioner: 'Miljözon klass 1, endast Euro VI. Tvätta hjulen vid utfart.', kontaktperson: proj('kolen').kontaktperson,
      telefon: proj('kolen').telefon,
    }),
  };

  // Containers on the demolition in Liljeholmen: one job per container (fixed price), Monday and Wednesday.
  const containerJob = (datum, material) => insJob({
    customer_id: cust('lovet'), project_id: ids.projects.lovet, uppdragstyp: 'container', material, antal_lass: 1,
    datum_fran: datum, datum_till: datum, status: datum < today ? 'klar' : 'pagar', fran_text: site('lovet'),
    till_text: `${FACILITIES.hastholm.namn}, Haninge`, kontaktperson: proj('lovet').kontaktperson, telefon: proj('lovet').telefon,
  });

  const time = db.prepare(`INSERT INTO time_entries (company_id, assignment_id, datum, timmar, created_by_kind, created_by_driver_id, created_at)
    VALUES (?, ?, ?, ?, 'driver', ?, ?)`);
  const hours = (assignmentId, driver, datum, timmar) => {
    time.run(companyId, assignmentId, datum, timmar, ids.drivers[driver], at(datum, '16:20'));
    counts.timeEntries++;
  };
  const times = (r, n, start = 6 * 60 + 40) => {
    const out = [];
    let m = start + r.int(0, 20);
    for (let i = 0; i < n; i++) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
      m += r.int(55, 80);
    }
    return out;
  };
  const byLass = new Map();        // lass_id → addLass result, for corrections from the weighing lists
  const hazards = [];

  /** One day of the new projects. `history` lass are all reviewed; in the base weeks a couple wait for review. */
  function newProjectsDay(r, datum, { history }) {
    const wd = isoWeekday(datum);
    const recent = !history;
    const isLast = datum === days.at(-1);

    // Hagalund: hourly tipper to Kvarnbo, plus the crane on Mondays, Wednesdays and Fridays.
    {
      const a = assign(jobs.hagalund, 'hkt209', 'patrik', datum);
      times(r, r.int(5, 6)).forEach((tid) => {
        const l = addLass({ jobId: jobs.hagalund, assignmentId: a, customer: 'brunnsviken', project: 'hagalund', vehicle: 'hkt209',
          driver: 'patrik', datum, tid, fran: site('hagalund'), fac: 'kvarnbo', ...SCHAKT, netto: round20(r.between(15200, 18600)), r });
        byLass.set(l.lassId, l);
      });
      // The current week's last day is still missing its hours: the underlag says "Timmar saknas" until it's in.
      if (!(recent && isLast)) hours(a, 'patrik', datum, [8.5, 9, 9, 9.5][r.int(0, 3)]);
      if (wd === 1 || wd === 3 || wd === 5) {
        const k = assign(jobs.hagalundKran, 'kpf683', 'kristoffer', datum);
        hours(k, 'kristoffer', datum, [5.5, 6, 6.5, 7][r.int(0, 3)]);
      }
    }

    // Moraberg: truck and trailer to Björkvik, 28–34 t a load; the machine moved on Mondays and Thursdays.
    {
      const a = assign(jobs.moraberg, 'rsk556', 'linus', datum);
      times(r, r.int(4, 5), 6 * 60 + 30).forEach((tid, i) => {
        const low = recent && datum === days.at(-2) && i === 1;
        const l = addLass({ jobId: jobs.moraberg, assignmentId: a, customer: 'malarstrand', project: 'moraberg', vehicle: 'rsk556',
          driver: 'linus', datum, tid, fran: site('moraberg'), fac: 'bjorkvik', ...SCHAKT, netto: round20(r.between(28400, 33600)),
          confidence: low ? { ...HIGH, netto_kg: 'lag' } : HIGH, review: low ? 'behover_granskas' : 'ok',
          note: low ? 'Vågsedeln blev blöt, svårt att läsa nettot' : null, r });
        byLass.set(l.lassId, l);
      });
      if (wd === 1 || wd === 4) {
        const m = assign(jobs.morabergMaskin, 'mtr90a', 'marcus', datum);
        hours(m, 'marcus', datum, [3.5, 4, 4.5, 5.5][r.int(0, 3)]);
      }
    }

    // Södertälje: makadam from Björkvik to the pipe trench.
    {
      const a = assign(jobs.sodertalje, 'ljb73f', 'dragan', datum);
      times(r, r.int(5, 6)).forEach((tid) => addLass({ jobId: jobs.sodertalje, assignmentId: a, customer: 'malarstrand',
        project: 'sodertalje', vehicle: 'ljb73f', driver: 'dragan', datum, tid, fran: `${FACILITIES.bjorkvik.namn}, Södertälje`,
        fac: 'bjorkvik', material: 'Makadam 16–32', netto: round20(r.between(14000, 16600)), r }));
    }

    // Vendelsö: two tippers on Tuesdays and Thursdays (the Euro V reserve truck is fine outside the miljözon).
    {
      const a = assign(jobs.vendelso, 'ndp58c', 'ali', datum);
      times(r, r.int(5, 7)).forEach((tid) => addLass({ jobId: jobs.vendelso, assignmentId: a, customer: 'vendelso', project: 'vendelso',
        vehicle: 'ndp58c', driver: 'ali', datum, tid, fran: site('vendelso'), fac: 'hastholm', ...SCHAKT,
        netto: round20(r.between(15000, 18400)), r }));
      if (wd === 2 || wd === 4) {
        const b = assign(jobs.vendelso, 'bxe31d', 'erik', datum);
        times(r, r.int(4, 5), 7 * 60 + 15).forEach((tid) => addLass({ jobId: jobs.vendelso, assignmentId: b, customer: 'vendelso',
          project: 'vendelso', vehicle: 'bxe31d', driver: 'erik', datum, tid, fran: site('vendelso'), fac: 'hastholm', ...SCHAKT,
          netto: round20(r.between(12200, 14400)), r }));
      }
    }

    // Kv. Kölen: per-load contract in the inner-city miljözon, to Kvarnbo.
    {
      const a = assign(jobs.kolen, 'gzr114', 'emma', datum);
      times(r, r.int(5, 6)).forEach((tid, i) => {
        const low = recent && datum === days.at(-1) && i === 3;
        const l = addLass({ jobId: jobs.kolen, assignmentId: a, customer: 'nordvik', project: 'kolen', vehicle: 'gzr114', driver: 'emma',
          datum, tid, fran: site('kolen'), fac: 'kvarnbo', ...SCHAKT, netto: round20(r.between(15400, 18600)),
          confidence: low ? { ...HIGH, vagsedel_nr: 'lag' } : HIGH, review: low ? 'behover_granskas' : 'ok',
          note: low ? 'Vågsedelnumret delvis bortnött' : null, r });
        byLass.set(l.lassId, l);
      });
    }

    // Liljeholmen: a container of mixed demolition waste on Mondays, concrete on Wednesdays.
    if (wd === 1 || wd === 3) {
      const [material, avfallskod] = wd === 1 ? ['Blandat bygg- och rivningsavfall', '170904'] : ['Betong', '170101'];
      const jobId = containerJob(datum, material);
      const a = assign(jobId, 'lvx341', 'nils', datum);
      addLass({ jobId, assignmentId: a, customer: 'nordvik', project: 'lovet', vehicle: 'lvx341', driver: 'nils', datum, tid: '09:40',
        fran: site('lovet'), fac: 'hastholm', material, avfallskod, netto: round20(r.between(wd === 1 ? 2600 : 5200, wd === 1 ? 4200 : 7400)), r });
    }
  }

  /** One history day of the base projects (Rörstrand, Täby, Orminge, the crane at Arenastaden). All reviewed. */
  function baseProjectsHistoryDay(r, datum, contaminatedToday) {
    const wd = isoWeekday(datum);
    const ra = assign(baseJobs.rorstrand, 'tka412', 'mikael', datum);
    times(r, r.int(6, 8), 6 * 60 + 45).forEach((tid) => {
      const l = addLass({ jobId: baseJobs.rorstrand, assignmentId: ra, customer: 'norrbacka', project: 'rorstrand', vehicle: 'tka412',
        driver: 'mikael', datum, tid, fran: 'Rörstrandsgatan 40, Stockholm', fac: 'ekbacka', ...SCHAKT,
        netto: round20(r.between(15500, 18800)), r });
      byLass.set(l.lassId, l);
    });
    const ta = assign(baseJobs.taby, 'tka418', 'sara', datum);
    times(r, r.int(5, 7), 6 * 60 + 45).forEach((tid, i) => {
      const hazard = contaminatedToday && i === 2;
      const l = addLass({ jobId: baseJobs.taby, assignmentId: ta, customer: 'norrbacka', project: 'taby', vehicle: 'tka418', driver: 'sara',
        datum, tid, fran: 'Stora Marknadsvägen 15, Täby', fac: hazard ? 'ekbacka' : 'skogsas',
        material: hazard ? 'Förorenade massor' : 'Schaktmassor', avfallskod: hazard ? '170503' : '170504', farligt: hazard,
        netto: round20(r.between(15000, 18500)), note: hazard ? 'PAH-halt över KM enligt provsvar' : null, r });
      if (hazard) hazards.push({ lassId: l.lassId, datum });
    });
    const oa = assign(baseJobs.orminge, 'mxr27c', 'tomasz', datum);
    times(r, r.int(4, 5), 6 * 60 + 45).forEach((tid) => addLass({ jobId: baseJobs.orminge, assignmentId: oa, customer: 'saltsjo',
      project: 'orminge', vehicle: 'mxr27c', driver: 'tomasz', datum, tid, fran: 'Lindhovs bergtäkt, Värmdö', fac: 'lindhov',
      material: 'Bergkross 0–32', netto: round20(r.between(12800, 15200)), r }));
    if (wd >= 2 && wd <= 4) {
      const ka = assign(baseJobs.kran, 'krn905', 'jonas', datum);
      hours(ka, 'jonas', datum, [7.5, 8, 8.5, 9][r.int(0, 3)]);
    }
  }

  // ── History: two weeks before the base weeks ──
  const H = randomHelpers(20260914);
  // History tickets sit below the base ones at the base facilities; the new facilities count on from their start.
  const saved = { ekbacka: counters.ekbacka, skogsas: counters.skogsas, lindhov: counters.lindhov };
  counters.ekbacka = facilities.ekbacka.start - 230;
  counters.skogsas = facilities.skogsas.start - 190;
  counters.lindhov = facilities.lindhov.start - 150;
  for (const datum of histDays) {
    baseProjectsHistoryDay(H, datum, isoWeekday(datum) === 3);
    newProjectsDay(H, datum, { history: true });
  }
  Object.assign(counters, saved);

  // Contaminated loads were reported to Naturvårdsverket's avfallsregister the next working day.
  const report = db.prepare(`INSERT INTO hazard_reports (company_id, lass_id, reported_on, reported_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?)`);
  for (const h of hazards) {
    const on = addDays(h.datum, isoWeekday(h.datum) === 5 ? 3 : 1);
    report.run(companyId, h.lassId, on, userId, at(on, '08:50'));
  }

  // ── History weighing lists: everything matched after the office created the missing load and fixed a weight ──
  const found = reconcileHistory({ db, ins, H, companyId, userId, at, histWeeks, facilities, byLass, addVersion, baseJobs, jobs, ids, counts });

  // ── History invoicing: every project's week went out on the Friday ──
  const invoiced = invoiceHistory({ db, companyId, userId, at, histWeeks });

  // ── The base weeks for the new projects ──
  const B = randomHelpers(20261005);
  for (const datum of days) newProjectsDay(B, datum, { history: false });

  // ── Booked ahead: the new trucks for the rest of this week, and next week's new work, not yet assigned ──
  for (let d = addDays(today, 1); d <= addDays(isoWeekRange(isoWeek(today).key).from, 4); d = addDays(d, 1)) {
    const wd = isoWeekday(d);
    assign(jobs.hagalund, 'hkt209', 'patrik', d);
    assign(jobs.moraberg, 'rsk556', 'linus', d);
    assign(jobs.sodertalje, 'ljb73f', 'dragan', d);
    assign(jobs.vendelso, 'ndp58c', 'ali', d);
    assign(jobs.kolen, 'gzr114', 'emma', d);
    if (wd === 1 || wd === 3 || wd === 5) assign(jobs.hagalundKran, 'kpf683', 'kristoffer', d);
    if (wd === 1 || wd === 4) assign(jobs.morabergMaskin, 'mtr90a', 'marcus', d);
  }

  insJob({
    customer_id: cust('lovet'), project_id: ids.projects.lovet, uppdragstyp: 'schakt', material: 'Schaktmassor', antal_lass: 30,
    datum_fran: nextMonday, datum_till: addDays(nextMonday, 3), status: 'bekraftad', fran_text: site('lovet'),
    till_text: `${FACILITIES.kvarnbo.namn}, Upplands-Bro`, instruktioner: 'Schakt för grundplatta efter rivningen. Miljözon klass 1.',
    kontaktperson: proj('lovet').kontaktperson, telefon: proj('lovet').telefon, created_at: at(addDays(today, -1), '14:05'),
  });
  insJob({
    customer_id: cust('sodertalje'), project_id: ids.projects.sodertalje, uppdragstyp: 'grus_leverans', material: 'Bergkross 0–32',
    uppskattad_mangd: 420, mangd_enhet: 'ton', datum_fran: addDays(nextMonday, 1), datum_till: addDays(nextMonday, 2), status: 'bekraftad',
    fran_text: `${FACILITIES.bjorkvik.namn}, Södertälje`, till_text: site('sodertalje'), instruktioner: 'Bärlager för gång- och cykelväg.',
    kontaktperson: proj('sodertalje').kontaktperson, telefon: proj('sodertalje').telefon, created_at: at(addDays(today, -1), '15:30'),
  });

  return {
    vehicles: VEHICLES.length, drivers: DRIVERS.length, customers: CUSTOMERS.length, projects: PROJECTS.length,
    history_weeks: histWeeks, hazard_reports: hazards.length, found, invoiced,
  };
}

/**
 * Import the facilities' weighing lists for the history weeks as the office did on each Friday afternoon, before
 * invoicing (an invoiced lass is never corrected):
 * every logged load is on the list, one weighing per list was never logged (the office created the lass from the
 * row) and the scale weighed one load heavier than logged (the office corrected it). That's Hittat av Lasskoll's
 * history. Returns { lists, created, corrected }.
 */
function reconcileHistory({ db, ins, H, companyId, userId, at, histWeeks, facilities, byLass, addVersion, baseJobs, jobs, ids, counts }) {
  const lassTo = db.prepare(`
    SELECT lc.lass_id, lc.job_id, lc.assignment_id, lc.datum, lc.tid, lc.vagsedel_nr, lc.vehicle_regnr, lc.netto_kg, lc.material,
           lc.customer_id, lc.project_id, lc.driver_id, lc.fran_text, lc.avfallskod
    FROM lass_current lc WHERE lc.company_id = ? AND lc.till_namn = ? AND lc.datum BETWEEN ? AND ? ORDER BY lc.datum, lc.tid, lc.lass_id`);
  const allTickets = db.prepare('SELECT vagsedel_nr FROM lass_current WHERE company_id = ? AND till_namn = ?').pluck();
  const insList = db.prepare(`
    INSERT INTO weigh_lists (company_id, facility_name, facility_orgnr, period_from, period_to, source_name, mapping_json, skipped_json,
      created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`);
  const insRow = db.prepare(`
    INSERT INTO weigh_list_rows (weigh_list_id, company_id, line_no, datum, tid, vagsedel_nr, regnr, netto_kg, material, referens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insLass = db.prepare('INSERT INTO lass (company_id, job_id, assignment_id, created_at, weigh_list_row_id) VALUES (?, ?, ?, ?, ?)');
  const resolve = db.prepare(`UPDATE weigh_list_rows SET resolution = 'lass_skapad', resolved_lass_id = ?, resolved_by_user_id = ?,
    resolved_at = ? WHERE id = ?`);
  const refOf = db.prepare('SELECT customer_ref FROM projects WHERE id = ?').pluck();
  const mapping = JSON.stringify({ columns: { datum: 0, tid: 1, vagsedel_nr: 2, regnr: 3, material: 4, referens: 5, netto_kg: 6 }, unit: 'kg' });

  const summary = { lists: 0, created: 0, corrected: 0 };
  const plan = [
    { week: histWeeks[0], fac: 'ekbacka', truck: 'TKA412', job: baseJobs.rorstrand },
    { week: histWeeks[1], fac: 'ekbacka', truck: 'TKA412', job: baseJobs.rorstrand },
    { week: histWeeks[1], fac: 'kvarnbo', truck: 'GZR114', job: jobs.kolen },
  ];
  for (const p of plan) {
    const f = facilities[p.fac];
    const { from, to } = isoWeekRange(p.week);
    const friday = addDays(from, 4);
    const logged = lassTo.all(companyId, f.namn, from, friday);
    if (!logged.length) continue;
    const used = new Set(allTickets.all(companyId, f.namn).map((t) => Number(String(t).replace(/\D/g, ''))));
    const rows = logged.map((l) => ({ ...l, list_kg: l.netto_kg, logged: true }));

    // The scale weighed one of the truck's loads mid-week heavier than the driver logged.
    const truckRows = rows.filter((r) => r.vehicle_regnr === p.truck && r.job_id === p.job);
    const heavier = truckRows[Math.floor(truckRows.length / 2)];
    if (heavier) heavier.list_kg += [180, 220, 260][H.int(0, 2)];

    // One weighing at the end of a day that nobody logged.
    const day = addDays(from, H.int(1, 3));
    const sameDay = truckRows.filter((r) => r.datum === day);
    const last = sameDay.at(-1) ?? truckRows.at(-1);
    let missing = null;
    if (last) {
      const digits = Number(String(last.vagsedel_nr).replace(/\D/g, ''));
      let n = digits + 1;
      while (used.has(n)) n++;
      const [hh, mm] = last.tid.split(':').map(Number);
      const m = hh * 60 + mm + 64;
      missing = {
        datum: last.datum, tid: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
        vagsedel_nr: `${f.prefix}${n}`, vehicle_regnr: p.truck, list_kg: round20(H.between(16200, 18400)), material: 'Schaktmassor',
        project_id: last.project_id, logged: false, template: last,
      };
      rows.push(missing);
    }
    rows.sort((a, b) => a.datum.localeCompare(b.datum) || a.tid.localeCompare(b.tid));

    const importedAt = at(friday, '15:05');
    const listId = Number(insList.run(companyId, f.namn, f.orgnr, from, friday,
      `vagningsrapport-${p.fac}-${p.week.toLowerCase()}.csv`, mapping, userId, importedAt).lastInsertRowid);
    summary.lists++;
    const rowIds = new Map();
    rows.forEach((r, i) => {
      const line = 7 + i;
      const id = Number(insRow.run(listId, companyId, line, r.datum, r.tid, r.vagsedel_nr, r.vehicle_regnr, r.list_kg, r.material,
        refOf.get(r.project_id)).lastInsertRowid);
      rowIds.set(r, { id, line });
    });

    // The office created the missing load from the row, on the truck's job that day…
    if (missing) {
      const t = missing.template;
      const { id: rowId, line } = rowIds.get(missing);
      const resolvedAt = at(friday, '15:12');
      const lassId = Number(insLass.run(companyId, t.job_id, t.assignment_id, resolvedAt, rowId).lastInsertRowid);
      const values = {
        vagsedel_nr: missing.vagsedel_nr, datum: missing.datum, tid: missing.tid, material: missing.material, netto_kg: missing.list_kg,
        avfallskod: t.avfallskod, farligt_avfall: false, fran_text: t.fran_text, till_namn: f.namn, till_orgnr: f.orgnr, till_adress: null,
      };
      ins.version.run({
        lass_id: lassId, version: 1, customer_id: t.customer_id, project_id: t.project_id, vehicle_regnr: p.truck, driver_id: t.driver_id,
        ...values, farligt_avfall: 0, photo_id: null,
        field_confidence_json: JSON.stringify(submittedConfidence(values, null, 'kontor')), review_status: 'ok', review_reasons_json: '[]',
        note: `Från våglista: ${f.namn}, rad ${line}`, change_reason: null, created_by_kind: 'office', created_by_user_id: userId,
        created_by_driver_id: null, created_at: resolvedAt,
      });
      resolve.run(lassId, userId, resolvedAt, rowId);
      counts.lass++;
      counts.versions++;
      summary.created++;
    }

    // …and corrected the weight from the scale.
    if (heavier && byLass.has(heavier.lass_id)) {
      const { line } = rowIds.get(heavier);
      addVersion(byLass.get(heavier.lass_id), { netto_kg: heavier.list_kg }, {
        reason: `${WEIGH_LIST_FIX_REASON} från ${f.namn} (rad ${line})`, at: at(friday, '15:16'),
      });
      summary.corrected++;
    }
  }
  return summary;
}

/** Invoice every project's history week as the office did on the Friday afternoon: a Fortnox draft, or a locked underlag. */
function invoiceHistory({ db, companyId, userId, at, histWeeks }) {
  const load = createUnderlagLoader(db);
  const insBatch = db.prepare(`
    INSERT INTO invoice_batches (company_id, iso_week, customer_id, project_id, kind, status, external_ref, fortnox_document_nr, total_ore,
      vat_mode, lines_snapshot_json, created_by_user_id, created_at)
    VALUES (@company_id, @iso_week, @customer_id, @project_id, @kind, 'skapad', @external_ref, @fortnox_document_nr, @total_ore,
      @vat_mode, @lines_snapshot_json, @created_by_user_id, @created_at)`);
  const insLine = db.prepare(`
    INSERT INTO invoice_lines (batch_id, lass_id, lass_version, assignment_id, datum, job_id, description, quantity, unit, price_ore, amount_ore)
    VALUES (@batch_id, @lass_id, @lass_version, @assignment_id, @datum, @job_id, @description, @quantity, @unit, @price_ore, @amount_ore)`);
  let documentNr = 4318;
  const out = { batches: 0, fortnox: 0, locked: 0, total_ore: 0 };
  for (const week of histWeeks) {
    const friday = addDays(isoWeekRange(week).from, 4);
    load(companyId, week).groups.forEach((group, i) => {
      if (group.status !== 'klar') return;
      const rows = billableRows(group);
      const fortnox = Boolean(group.customer.fortnox_customer_nr);
      const total = rows.reduce((s, r) => s + r.amount_ore, 0);
      const minute = 5 + i * 3;
      const batchId = Number(insBatch.run({
        company_id: companyId, iso_week: week, customer_id: group.customer.id, project_id: group.project.id,
        kind: fortnox ? 'fortnox' : 'manuell', external_ref: `demo-${week}-${group.customer.id}-${group.project.id}`,
        fortnox_document_nr: fortnox ? String(documentNr++) : null, total_ore: total, vat_mode: group.vat_mode,
        lines_snapshot_json: JSON.stringify(rows.map(({ invoiced, blockers, ...r }) => r)), created_by_user_id: userId,
        created_at: at(friday, `16:${String(minute).padStart(2, '0')}`),
      }).lastInsertRowid);
      for (const r of rows) {
        insLine.run({
          batch_id: batchId, lass_id: r.lass_id ?? null, lass_version: r.lass_version ?? null, assignment_id: r.assignment_id ?? null,
          datum: r.kind === 'timmar' ? r.datum : null, job_id: r.kind === 'fast' || r.kind === 'lass' ? r.job_id : null,
          description: r.description, quantity: r.quantity, unit: r.unit, price_ore: r.price_ore, amount_ore: r.amount_ore,
        });
      }
      out.batches++;
      out[fortnox ? 'fortnox' : 'locked']++;
      out.total_ore += total;
    });
  }
  return out;
}
