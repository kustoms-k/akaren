import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { reviewStatusFor } from '../lib/lassReview.js';
import { addDays, isoWeek, isoWeekRange, isoWeekday, stockholmDate, stockholmLocalToUtc } from '../lib/dates.js';
import { seedInbox } from './inbox.js';
import { seedWeighList } from './weighList.js';
import { seedFullCompany } from './demoFull.js';

// Demo data for "Lagerviks Åkeri AB". Every company name, org nr, regnr, domain and person is fictional (domains were
// checked to be unregistered when chosen; see lib/inboxDemo.js). It should look real to a prospect, so no "test" names.
// Driver phone numbers are in 070-174 06 05–99 and the office number in 08-465 004 00–99, ranges PTS reserves for fiction.

export const DEMO_EMAIL = 'kontor@lagerviksakeri.se';

const COMPANY = {
  name: 'Lagerviks Åkeri AB', org_nr: '559000-0013', address: 'Lagervägen 7', postnr: '13650', ort: 'Haninge',
  phone: '+46846500400', email: 'kontor@lagerviksakeri.se', retention_months: 36, default_vat_mode: 'normal',
  order_terms: 'Uppdraget utförs enligt Alltrans 2007 och våra prislistor. Avbokning senast kl 15.00 vardagen före, '
    + 'annars debiteras framkörning. Väntetid över 15 minuter per lass debiteras per påbörjad kvart.',
};

const VEHICLES = [
  { key: 'tka412', regnr: 'TKA412', typ: 'tippbil',     miljozonsklass: 1, tara: 14240 },
  { key: 'tka418', regnr: 'TKA418', typ: 'tippbil',     miljozonsklass: 1, tara: 14380 },
  { key: 'mxr27c', regnr: 'MXR27C', typ: 'tippbil',     miljozonsklass: 0, tara: 11960 },  // older Euro V: miljözon warning
  { key: 'krn905', regnr: 'KRN905', typ: 'kranbil',     miljozonsklass: 1, tara: 18900 },
  { key: 'lvx330', regnr: 'LVX330', typ: 'lastvaxlare', miljozonsklass: 1, tara: 13100 },
];

const DRIVERS = [
  { key: 'mikael', name: 'Mikael Lund',   phone: '+46701740605' },
  { key: 'sara',   name: 'Sara Engström', phone: '+46701740606' },
  { key: 'tomasz', name: 'Tomasz Nowak',  phone: '+46701740607' },
  { key: 'jonas',  name: 'Jonas Berg',    phone: '+46701740608' },
];

const PRICE_LISTS = [
  {
    key: 'standard', name: 'Standardprislista 2026', is_default: 1,
    items: [
      { uppdragstyp: 'schakt',          unit: 'lass',  price_ore: 245000 },
      { uppdragstyp: 'grus_leverans',   unit: 'ton',   price_ore: 9800 },
      { uppdragstyp: 'kran',            unit: 'timme', price_ore: 129000 },
      { uppdragstyp: 'maskintransport', unit: 'timme', price_ore: 119000 },
      { uppdragstyp: 'container',       unit: 'fast',  price_ore: 395000 },
      { uppdragstyp: 'ovrigt',          unit: 'timme', price_ore: 105000 },
    ],
  },
  {
    key: 'norrbacka', name: 'Norrbacka Mark – avtal 2026', is_default: 0,
    items: [
      { uppdragstyp: 'schakt', unit: 'ton', price_ore: 13200 },
      { uppdragstyp: 'schakt', material: 'Förorenade massor', unit: 'ton', price_ore: 21500 },
    ],
  },
  {
    key: 'ekhagen', name: 'Ekhagen – avtal 2026', is_default: 0,
    items: [{ uppdragstyp: 'kran', unit: 'timme', price_ore: 135000 }],
  },
];

const CUSTOMERS = [
  {
    key: 'norrbacka', name: 'Norrbacka Mark & Anläggning AB', org_nr: '559101-2348',
    address: 'Industrigatan 14', postnr: '11246', ort: 'Stockholm', email: 'faktura@norrbackamark.se',
    price_list: 'norrbacka', vat_mode: 'omvand_bygg',
  },
  {
    key: 'saltsjo', name: 'Saltsjö Bygg & Entreprenad AB', org_nr: '559212-6782',
    address: 'Värmdövägen 220', postnr: '13140', ort: 'Nacka', email: 'ekonomi@saltsjobyggentreprenad.se',
    price_list: null, vat_mode: null,
  },
  {
    key: 'ekhagen', name: 'Ekhagens Fastighetsutveckling AB', org_nr: '559303-4563',
    address: 'Frösundaleden 2', postnr: '16970', ort: 'Solna', email: 'inkop@ekhagensfastigheter.se',
    price_list: 'ekhagen', vat_mode: null,
  },
];

const PROJECTS = [
  {
    key: 'rorstrand', customer: 'norrbacka', name: 'Kv. Rörstrand – schakt', customer_ref: 'NMA-2611',
    address: 'Rörstrandsgatan 40', postnr: '11340', ort: 'Stockholm', miljozon: 1,
    kontaktperson: 'Petra Holm', telefon: '+46701740610',
  },
  {
    key: 'taby', customer: 'norrbacka', name: 'Täby Park etapp 3 – VA-schakt', customer_ref: 'NMA-2604',
    address: 'Stora Marknadsvägen 15', postnr: '18370', ort: 'Täby', miljozon: 0,
    kontaktperson: 'Oskar Wiklund', telefon: '+46701740611',
  },
  {
    key: 'orminge', customer: 'saltsjo', name: 'Orminge centrum – grundläggning', customer_ref: 'SBE-118',
    address: 'Kanholmsvägen 2', postnr: '13230', ort: 'Saltsjö-Boo', miljozon: 0,
    kontaktperson: 'Linnea Ek', telefon: '+46701740612',
  },
  {
    key: 'arenastaden', customer: 'ekhagen', name: 'Arenastaden kv. Lagern', customer_ref: 'EF-2026-07',
    address: 'Evenemangsgatan 21', postnr: '16979', ort: 'Solna', miljozon: 0,
    kontaktperson: 'Hampus Strand', telefon: '+46701740613',
  },
];

const FACILITIES = {
  ekbacka:  { namn: 'Ekbacka massmottagning',  orgnr: '559404-1236', adress: 'Ekbackavägen 3, Upplands Väsby', prefix: 'EKB', start: 418200 },
  skogsas:  { namn: 'Skogsås återvinning',     orgnr: null,          adress: 'Skogsåsvägen 11, Vallentuna',   prefix: 'SK-', start: 77100 },
  lindhov:  { namn: 'Lindhovs bergtäkt',       orgnr: null,          adress: 'Lindhovsvägen 40, Värmdö',      prefix: 'LH',  start: 102500 },
};

/** Small deterministic PRNG so the demo data is the same on every run. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random helpers over one PRNG stream: between(lo, hi) and int(lo, hi) inclusive. */
export function randomHelpers(seed) {
  const rand = mulberry32(seed);
  const between = (lo, hi) => lo + rand() * (hi - lo);
  return { rand, between, int: (lo, hi) => Math.floor(between(lo, hi + 1)) };
}

/** Weekdays (Mon–Fri) of the previous and the current ISO week, up to and including `today`. */
export function demoWorkdays(today) {
  const current = isoWeekRange(isoWeek(today).key).from;
  const previous = addDays(current, -7);
  const days = [];
  for (const monday of [previous, current]) {
    for (let i = 0; i < 5; i++) {
      const d = addDays(monday, i);
      if (d <= today) days.push(d);
    }
  }
  return { days, previousWeek: isoWeek(previous).key, currentWeek: isoWeek(current).key };
}

/**
 * Seed a fresh database. Throws if any company already exists.
 * Returns a summary with row counts and the office login.
 * withPhotos: create a photo row per driver lass and return `photos` [{ id, slip, blur }]
 * for the caller to render (rendering is async; see renderDemoPhotos in run.js).
 * withInbox: also seed the demo order mailbox (seed/inbox.js) as of `now` (default: now if `today` is today,
 * otherwise noon on `today`).
 * withWeighList: also import Ekbacka's weighing list for the previous week (seed/weighList.js), for Avstämning.
 * full: the whole company the demo instances show (seed/demoFull.js): 14 trucks, 7 customers, two more weeks of
 * history with invoiced weeks, weighing lists and hazardous-waste reports. Off by default so tests stay small; the
 * base data is identical either way.
 */
export function seedDemo(db, { today, password, withPhotos = false, withInbox = true, withWeighList = true, now = null, full = false }) {
  if (db.prepare('SELECT COUNT(*) FROM companies').pluck().get() > 0) {
    throw new Error('Database already contains data');
  }
  const R = randomHelpers(20261003);
  const { between, int } = R;
  const round20 = (kg) => Math.round(kg / 20) * 20;

  const ids = { vehicles: {}, drivers: {}, priceLists: {}, customers: {}, projects: {} };
  const counts = { lass: 0, versions: 0, timeEntries: 0, assignments: 0 };
  const photos = [];
  const { days, previousWeek, currentWeek } = demoWorkdays(today);
  let inbox = null;
  let weighList = null;
  let fullSummary = null;
  // Registries the full company extends (seed/demoFull.js).
  const vehicles = new Map(VEHICLES.map((v) => [v.key, v]));
  const projectsByKey = new Map(PROJECTS.map((p) => [p.key, p]));
  const facilities = { ...FACILITIES };

  const ins = {
    company: db.prepare(`INSERT INTO companies (name, org_nr, address, postnr, ort, phone, email, retention_months, default_vat_mode, order_terms)
      VALUES (@name, @org_nr, @address, @postnr, @ort, @phone, @email, @retention_months, @default_vat_mode, @order_terms)`),
    user: db.prepare('INSERT INTO users (company_id, name, email, password_hash) VALUES (?, ?, ?, ?)'),
    vehicle: db.prepare('INSERT INTO vehicles (company_id, regnr, typ, miljozonsklass) VALUES (?, ?, ?, ?)'),
    driver: db.prepare('INSERT INTO drivers (company_id, name, phone) VALUES (?, ?, ?)'),
    priceList: db.prepare('INSERT INTO price_lists (company_id, name, is_default) VALUES (?, ?, ?)'),
    priceItem: db.prepare('INSERT INTO price_list_items (price_list_id, uppdragstyp, material, unit, price_ore) VALUES (?, ?, ?, ?, ?)'),
    customer: db.prepare(`INSERT INTO customers (company_id, name, org_nr, address, postnr, ort, email, price_list_id, vat_mode)
      VALUES (@company_id, @name, @org_nr, @address, @postnr, @ort, @email, @price_list_id, @vat_mode)`),
    project: db.prepare(`INSERT INTO projects (company_id, customer_id, name, customer_ref, address, postnr, ort, miljozon, kontaktperson, telefon)
      VALUES (@company_id, @customer_id, @name, @customer_ref, @address, @postnr, @ort, @miljozon, @kontaktperson, @telefon)`),
    job: db.prepare(`INSERT INTO jobs (company_id, customer_id, project_id, uppdragstyp, material, uppskattad_mangd, mangd_enhet,
        antal_lass, datum_fran, datum_till, tid, fran_text, till_text, instruktioner, kontaktperson, telefon, status, created_by_user_id, created_at)
      VALUES (@company_id, @customer_id, @project_id, @uppdragstyp, @material, @uppskattad_mangd, @mangd_enhet,
        @antal_lass, @datum_fran, @datum_till, @tid, @fran_text, @till_text, @instruktioner, @kontaktperson, @telefon, @status, @created_by_user_id, @created_at)`),
    assignment: db.prepare(`INSERT INTO job_assignments (company_id, job_id, vehicle_id, driver_id, datum, miljozon_warning,
        miljozon_ack_user_id, sms_status, sms_sent_at, created_by_user_id, created_at)
      VALUES (@company_id, @job_id, @vehicle_id, @driver_id, @datum, @miljozon_warning,
        @miljozon_ack_user_id, 'simulerat', @created_at, @created_by_user_id, @created_at)`),
    lass: db.prepare('INSERT INTO lass (company_id, job_id, assignment_id, created_at) VALUES (?, ?, ?, ?)'),
    version: db.prepare(`INSERT INTO lass_versions (lass_id, version, customer_id, project_id, vehicle_regnr, driver_id, datum, tid,
        fran_text, till_namn, till_orgnr, till_adress, material, avfallskod, farligt_avfall, netto_kg, vagsedel_nr, photo_id,
        field_confidence_json, review_status, review_reasons_json, note, change_reason, created_by_kind, created_by_user_id,
        created_by_driver_id, created_at)
      VALUES (@lass_id, @version, @customer_id, @project_id, @vehicle_regnr, @driver_id, @datum, @tid,
        @fran_text, @till_namn, @till_orgnr, @till_adress, @material, @avfallskod, @farligt_avfall, @netto_kg, @vagsedel_nr, @photo_id,
        @field_confidence_json, @review_status, @review_reasons_json, @note, @change_reason, @created_by_kind, @created_by_user_id,
        @created_by_driver_id, @created_at)`),
    photo: db.prepare(`INSERT INTO photos (id, company_id, sha256, bytes, uploaded_by_driver_id, created_at)
      VALUES (?, ?, 'pending', 0, ?, ?)`),
    time: db.prepare(`INSERT INTO time_entries (company_id, assignment_id, datum, timmar, created_by_kind, created_by_driver_id, created_at)
      VALUES (?, ?, ?, ?, 'driver', ?, ?)`),
  };

  const HIGH = { datum: 'hog', tid: 'hog', vagsedel_nr: 'hog', vehicle_regnr: 'hog', material: 'hog', netto_kg: 'hog', till_namn: 'hog' };

  db.transaction(() => {
    const companyId = Number(ins.company.run(COMPANY).lastInsertRowid);
    const userId = Number(ins.user.run(companyId, 'Kontoret', DEMO_EMAIL, bcrypt.hashSync(password, 10)).lastInsertRowid);
    const at = (date, time) => stockholmLocalToUtc(date, time);

    for (const v of VEHICLES) ids.vehicles[v.key] = Number(ins.vehicle.run(companyId, v.regnr, v.typ, v.miljozonsklass).lastInsertRowid);
    for (const d of DRIVERS) ids.drivers[d.key] = Number(ins.driver.run(companyId, d.name, d.phone).lastInsertRowid);
    for (const pl of PRICE_LISTS) {
      const id = Number(ins.priceList.run(companyId, pl.name, pl.is_default).lastInsertRowid);
      ids.priceLists[pl.key] = id;
      for (const it of pl.items) ins.priceItem.run(id, it.uppdragstyp ?? null, it.material ?? null, it.unit, it.price_ore);
    }
    for (const c of CUSTOMERS) {
      ids.customers[c.key] = Number(ins.customer.run({
        company_id: companyId, name: c.name, org_nr: c.org_nr, address: c.address, postnr: c.postnr, ort: c.ort,
        email: c.email, price_list_id: c.price_list ? ids.priceLists[c.price_list] : null, vat_mode: c.vat_mode,
      }).lastInsertRowid);
    }
    for (const p of PROJECTS) {
      const { key, customer, ...rest } = p;
      ids.projects[key] = Number(ins.project.run({ company_id: companyId, customer_id: ids.customers[customer], ...rest }).lastInsertRowid);
    }

    const firstDay = days[0];
    const lastDay = addDays(isoWeekRange(currentWeek).from, 4);
    const job = (def) => Number(ins.job.run({
      company_id: companyId, created_by_user_id: userId, created_at: at(addDays(firstDay, -3), '09:15'),
      uppskattad_mangd: null, mangd_enhet: null, antal_lass: null, tid: '07:00', instruktioner: null,
      datum_fran: firstDay, datum_till: lastDay, status: 'pagar', ...def,
    }).lastInsertRowid);

    const projectOf = (key) => PROJECTS.find((p) => p.key === key);
    const jobs = {
      rorstrand: job({
        customer_id: ids.customers.norrbacka, project_id: ids.projects.rorstrand, uppdragstyp: 'schakt',
        material: 'Schaktmassor', uppskattad_mangd: 1400, mangd_enhet: 'ton',
        fran_text: 'Rörstrandsgatan 40, Stockholm', till_text: `${FACILITIES.ekbacka.namn}, Upplands Väsby`,
        instruktioner: 'Infart från Rörstrandsgatan. Miljözon klass 1, endast Euro VI.',
        kontaktperson: 'Petra Holm', telefon: projectOf('rorstrand').telefon,
      }),
      taby: job({
        customer_id: ids.customers.norrbacka, project_id: ids.projects.taby, uppdragstyp: 'schakt',
        material: 'Schaktmassor', fran_text: 'Stora Marknadsvägen 15, Täby',
        till_text: `${FACILITIES.skogsas.namn}, Vallentuna`, kontaktperson: 'Oskar Wiklund', telefon: projectOf('taby').telefon,
      }),
      orminge: job({
        customer_id: ids.customers.saltsjo, project_id: ids.projects.orminge, uppdragstyp: 'grus_leverans',
        material: 'Bergkross 0–32', uppskattad_mangd: 600, mangd_enhet: 'ton',
        fran_text: `${FACILITIES.lindhov.namn}, Värmdö`, till_text: 'Kanholmsvägen 2, Saltsjö-Boo',
        kontaktperson: 'Linnea Ek', telefon: projectOf('orminge').telefon,
      }),
      kran: job({
        customer_id: ids.customers.ekhagen, project_id: ids.projects.arenastaden, uppdragstyp: 'kran',
        material: null, fran_text: null, till_text: 'Evenemangsgatan 21, Solna',
        instruktioner: 'Lyft av armering och formvirke. Anmälan i bygget.', kontaktperson: 'Hampus Strand',
        telefon: projectOf('arenastaden').telefon,
      }),
      container: job({
        customer_id: ids.customers.ekhagen, project_id: ids.projects.arenastaden, uppdragstyp: 'container',
        material: 'Blandat byggavfall', antal_lass: 1, datum_fran: firstDay, datum_till: firstDay, status: 'klar',
        fran_text: 'Evenemangsgatan 21, Solna', till_text: `${FACILITIES.ekbacka.namn}, Upplands Väsby`,
        kontaktperson: 'Hampus Strand', telefon: projectOf('arenastaden').telefon,
      }),
    };

    const counters = Object.fromEntries(Object.entries(FACILITIES).map(([k, f]) => [k, f.start]));
    const slipNr = (fac, r = R) => {
      const f = facilities[fac];
      counters[fac] = (counters[fac] ?? f.start) + r.int(1, 4);
      return `${f.prefix}${counters[fac]}`;
    };

    const assign = (jobId, vehicle, driver, datum, { warning = false } = {}) => {
      counts.assignments++;
      return Number(ins.assignment.run({
        company_id: companyId, job_id: jobId, vehicle_id: ids.vehicles[vehicle], driver_id: ids.drivers[driver], datum,
        miljozon_warning: warning ? 1 : 0, miljozon_ack_user_id: warning ? userId : null,
        created_by_user_id: userId, created_at: at(addDays(datum, -1), '15:30'),
      }).lastInsertRowid);
    };

    const addLass = ({ jobId, assignmentId, customer, project, vehicle, driver, datum, tid, fran, fac, material,
      avfallskod = null, farligt = false, netto, slipNetto = netto, confidence = HIGH, review = 'ok', note = null, r = R }) => {
      const f = facilities[fac];
      const created = at(datum, tid);
      const v = vehicles.get(vehicle);
      const lassId = Number(ins.lass.run(companyId, jobId, assignmentId, created).lastInsertRowid);
      const nr = slipNr(fac, r);
      let photoId = null;
      if (withPhotos) {
        photoId = randomBytes(16).toString('hex');
        ins.photo.run(photoId, companyId, ids.drivers[driver], created);
        const tara = v.tara + r.int(-60, 60) * 2;
        photos.push({
          id: photoId,
          blur: confidence.netto_kg === 'lag' || confidence.vagsedel_nr === 'lag',
          // Rendered before the reset returns: what the demo shows first (today, and lass waiting for review).
          urgent: datum === today || review !== 'ok',
          slip: {
            facility: f, nr, datum, tid, regnr: v.regnr, kund: COMPANY.name,
            marking: projectsByKey.get(project).customer_ref, material, avfallskod, farligt,
            netto: slipNetto, tara, brutto: slipNetto + tara,
          },
        });
      }
      const base = {
        lass_id: lassId, customer_id: ids.customers[customer], project_id: ids.projects[project],
        vehicle_regnr: v.regnr, driver_id: ids.drivers[driver], datum, tid,
        fran_text: fran, till_namn: f.namn, till_orgnr: f.orgnr, till_adress: f.adress, material, avfallskod,
        farligt_avfall: farligt ? 1 : 0, netto_kg: netto, vagsedel_nr: nr, photo_id: photoId,
      };
      const reasons = review === 'ok' ? [] : reviewStatusFor({ confidence, hasPhoto: true, farligtAvfall: farligt }).reasons;
      ins.version.run({
        ...base, version: 1, field_confidence_json: JSON.stringify(confidence), review_status: review,
        review_reasons_json: JSON.stringify(reasons), note,
        change_reason: null, created_by_kind: 'driver', created_by_user_id: null, created_by_driver_id: ids.drivers[driver],
        created_at: created,
      });
      counts.lass++;
      counts.versions++;
      return { lassId, base, created, version: 1 };
    };

    const addVersion = (prev, patch, { reason, review = 'granskad', minutesLater = 240, at: when = null }) => {
      const created = when ?? new Date(Date.parse(prev.created) + minutesLater * 60_000).toISOString();
      const version = (prev.version ?? 1) + 1;
      ins.version.run({
        ...prev.base, ...patch, version, field_confidence_json: JSON.stringify(HIGH), review_status: review,
        review_reasons_json: '[]',
        note: null, change_reason: reason, created_by_kind: 'office', created_by_user_id: userId,
        created_by_driver_id: null, created_at: created,
      });
      counts.versions++;
      prev.version = version;
      Object.assign(prev.base, patch);
    };

    const times = (n, start = 6 * 60 + 45) => {
      const out = [];
      let m = start + int(0, 20);
      for (let i = 0; i < n; i++) {
        out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
        m += int(52, 78);
      }
      return out;
    };

    const isCurrentWeek = (d) => isoWeek(d).key === currentWeek;
    const curDays = days.filter(isCurrentWeek);
    // Fixed demo cases in the current week (fall back to the last day if the week has just started).
    const pick = (i) => curDays[Math.min(i, curDays.length - 1)];
    const warningDay = pick(1);
    const lowDays = new Set([pick(0), pick(2)]);
    const hazardDay = pick(1);
    const correctionDay = pick(0);
    const prevReviewed = new Set(days.filter((d) => !isCurrentWeek(d)).slice(1, 4));

    for (const datum of days) {
      const wd = isoWeekday(datum);

      // Rörstrand (miljözon 1): Mikael every day; Tomasz's Euro V truck one day with an acknowledged warning.
      {
        const a = assign(jobs.rorstrand, 'tka412', 'mikael', datum);
        times(int(6, 8)).forEach((tid, i) => {
          const netto = round20(between(15500, 18800));
          const low = lowDays.has(datum) && i === 2;
          const reviewedLater = prevReviewed.has(datum) && i === 1;
          const misread = datum === correctionDay && i === 4;
          const prev = addLass({
            jobId: jobs.rorstrand, assignmentId: a, customer: 'norrbacka', project: 'rorstrand', vehicle: 'tka412',
            driver: 'mikael', datum, tid, fran: 'Rörstrandsgatan 40, Stockholm', fac: 'ekbacka',
            material: 'Schaktmassor', avfallskod: '170504',
            // A dropped digit that the driver didn't notice: 18 400 read as 1 840.
            netto: misread ? round20(netto / 10) : netto, slipNetto: netto,
            confidence: low || reviewedLater ? { ...HIGH, netto_kg: 'lag' } : HIGH,
            review: low || reviewedLater ? 'behover_granskas' : 'ok',
            note: low ? 'Suddig siffra på vågsedeln' : null,
          });
          if (misread) {
            addVersion(prev, { netto_kg: netto }, { reason: `Vikt felavläst (${prev.base.netto_kg} → ${netto} kg), rättad mot vågsedel` });
          }
          if (reviewedLater) {
            addVersion(prev, {}, { reason: 'Granskad mot vågsedel' });
          }
        });
        if (datum === warningDay) {
          const w = assign(jobs.rorstrand, 'mxr27c', 'tomasz', datum, { warning: true });
          times(3, 12 * 60).forEach((tid) => addLass({
            jobId: jobs.rorstrand, assignmentId: w, customer: 'norrbacka', project: 'rorstrand', vehicle: 'mxr27c',
            driver: 'tomasz', datum, tid, fran: 'Rörstrandsgatan 40, Stockholm', fac: 'ekbacka',
            material: 'Schaktmassor', avfallskod: '170504', netto: round20(between(12500, 15000)),
          }));
        }
      }

      // Täby: Sara every day, one load of contaminated soil in the current week.
      {
        const a = assign(jobs.taby, 'tka418', 'sara', datum);
        times(int(5, 7)).forEach((tid, i) => {
          const hazard = datum === hazardDay && i === 3;
          const low = lowDays.has(datum) && i === 0;
          addLass({
            jobId: jobs.taby, assignmentId: a, customer: 'norrbacka', project: 'taby', vehicle: 'tka418', driver: 'sara',
            datum, tid, fran: 'Stora Marknadsvägen 15, Täby', fac: hazard ? 'ekbacka' : 'skogsas',
            material: hazard ? 'Förorenade massor' : 'Schaktmassor', avfallskod: hazard ? '170503' : '170504',
            farligt: hazard, netto: round20(between(15000, 18500)),
            confidence: low ? { ...HIGH, vagsedel_nr: 'lag' } : HIGH,
            review: hazard || low ? 'behover_granskas' : 'ok',
            note: hazard ? 'PAH-halt över KM enligt provsvar' : null,
          });
        });
      }

      // Orminge: Tomasz delivers bergkross, except the day he is on Rörstrand.
      if (datum !== warningDay) {
        const a = assign(jobs.orminge, 'mxr27c', 'tomasz', datum);
        times(int(4, 5)).forEach((tid) => addLass({
          jobId: jobs.orminge, assignmentId: a, customer: 'saltsjo', project: 'orminge', vehicle: 'mxr27c',
          driver: 'tomasz', datum, tid, fran: `${FACILITIES.lindhov.namn}, Värmdö`, fac: 'lindhov',
          material: 'Bergkross 0–32', netto: round20(between(12800, 15200)),
        }));
      }

      // Arenastaden: kranbil Tue–Thu (hourly), container on the first day (fixed price).
      if (wd >= 2 && wd <= 4) {
        const a = assign(jobs.kran, 'krn905', 'jonas', datum);
        ins.time.run(companyId, a, datum, [7.5, 8, 8.5, 9][int(0, 3)], ids.drivers.jonas, at(datum, '16:30'));
        counts.timeEntries++;
      }
      if (datum === firstDay) {
        const a = assign(jobs.container, 'lvx330', 'jonas', datum);
        addLass({
          jobId: jobs.container, assignmentId: a, customer: 'ekhagen', project: 'arenastaden', vehicle: 'lvx330',
          driver: 'jonas', datum, tid: '10:20', fran: 'Evenemangsgatan 21, Solna', fac: 'ekbacka',
          material: 'Blandat byggavfall', avfallskod: '170904', netto: round20(between(2800, 3600)),
        });
      }
    }

    if (full) {
      fullSummary = seedFullCompany({
        db, ins, companyId, userId, at, today, days, previousWeek, currentWeek, firstDay, lastDay, ids, counts, jobs,
        vehicles, projectsByKey, facilities, counters, assign, addLass, addVersion, HIGH, COMPANY,
      });
    }

    const seedNow = now ?? (stockholmDate() === today ? new Date() : new Date(stockholmLocalToUtc(today, '12:00')));
    if (withWeighList) weighList = seedWeighList(db, { companyId, userId, week: previousWeek, now: seedNow });
    if (withInbox) inbox = seedInbox(db, { companyId, userId, now: seedNow });
  })();

  return {
    email: DEMO_EMAIL,
    previousWeek,
    currentWeek,
    days: days.length,
    vehicles: vehicles.size,
    drivers: Object.keys(ids.drivers).length,
    customers: Object.keys(ids.customers).length,
    projects: projectsByKey.size,
    ...counts,
    inbox,
    weighList,
    full: fullSummary,
    photos,
  };
}
