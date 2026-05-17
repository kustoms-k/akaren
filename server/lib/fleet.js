import db        from '../db.js';
import fleetJson from '../data/fleet.json' with { type: 'json' };

const stmtList = db.prepare('SELECT * FROM company_fleet WHERE company_id = ? ORDER BY id');

function rowToVehicle(r) {
  return {
    id:              r.ext_id,
    reg:             r.reg,
    namn:            r.namn,
    lasttyp:         r.lasttyp,
    typ:             r.typ,
    maxLast_kg:      r.max_last_kg,
    volym_m3:        r.volym_m3,
    'lez_godkänd':   Boolean(r.lez_godkand),
    euro_klass:      r.euro_klass,
    timkostnad_sek:  r.timkostnad_sek,
    'tillstånd':     r.tillstand ? JSON.parse(r.tillstand) : [],
    priskm_sek:      r.priskm_sek,
    startavgift_sek: r.startavgift_sek,
    beskrivning:     r.beskrivning,
    _db_id:          r.id,
  };
}

export function getActiveFleet(companyId) {
  const rows = stmtList.all(companyId);
  return rows.length > 0 ? rows.map(rowToVehicle) : [...fleetJson];
}
