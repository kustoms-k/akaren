import db          from '../db.js';
import { sendSms } from '../sms.js';
import { getActiveFleet } from '../lib/fleet.js';

const THRESHOLDS = [30, 14, 7];

const TYPE_LABELS = {
  besiktning: 'Kontrollbesiktning',
  forsakring: 'Försäkringsförnyelse',
  adr:        'ADR-certifikat',
  service:    'Servicedatum',
  service_km: 'Serviceintervall',
  dack:       'Däckbyte',
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date(new Date().toISOString().slice(0, 10));
  return Math.round(diff / 86_400_000);
}

function hasAlertBeenSent(companyId, vehicleId, alertType, daysBefore) {
  const row = db.prepare(
    'SELECT id FROM maintenance_alerts WHERE company_id = ? AND vehicle_id = ? AND alert_type = ? AND days_before = ?'
  ).get(companyId, vehicleId, alertType, daysBefore);
  return Boolean(row);
}

function markAlertSent(companyId, vehicleId, alertType, daysBefore) {
  db.prepare(`
    INSERT OR REPLACE INTO maintenance_alerts (company_id, vehicle_id, alert_type, days_before, sent_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(companyId, vehicleId, alertType, daysBefore);
}

function estimateServiceDays(companyId, vehicleId, serviceKm, currentKm) {
  if (!serviceKm || !currentKm) return null;
  const remaining = serviceKm - currentKm;
  if (remaining <= 0) return 0;

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const since = ninetyDaysAgo.toISOString().slice(0, 10);

  const { total_km } = db.prepare(`
    SELECT COALESCE(SUM(q.avstand_km), 0) AS total_km
    FROM jobs j
    JOIN quotes q ON q.id = j.quote_id
    WHERE j.company_id = ? AND q.fordon_id = ? AND date(j.created_at) >= ?
  `).get(companyId, vehicleId, since);

  const avgDailyKm = total_km / 90;
  if (avgDailyKm < 0.1) return null;
  return Math.round(remaining / avgDailyKm);
}

function buildAlertMessage(vehicleId, vehicleNamn, alertType, days, datum) {
  const label = TYPE_LABELS[alertType] ?? alertType;
  if (alertType === 'service_km') {
    return `VARNING: ${vehicleId} (${vehicleNamn}) når serviceintervall om ~${days} dagar baserat på körda mil. Boka service snarast.`;
  }
  const when = days <= 0
    ? 'är FÖRFALLEN'
    : days === 1 ? 'förfaller IMORGON'
    : `förfaller om ${days} dagar (${datum})`;
  return `VARNING: ${label} för ${vehicleId} (${vehicleNamn}) ${when}. Åtgärd krävs.`;
}

async function processCompany(companyId) {
  const fleet = getActiveFleet(companyId);
  const rows  = db.prepare('SELECT * FROM vehicle_maintenance WHERE company_id = ?').all(companyId);
  const byId  = Object.fromEntries(rows.map((r) => [r.vehicle_id, r]));

  // Get all company phone numbers for admins to notify
  const adminPhones = db.prepare(
    `SELECT u.id, d.phone FROM users u
     LEFT JOIN drivers d ON d.id = u.driver_id
     WHERE u.company_id = ? AND u.role IN ('agare', 'trafikledare') AND u.active = 1
       AND d.phone IS NOT NULL`
  ).all(companyId).map((r) => r.phone).filter(Boolean);

  // Also get company phone
  const company = db.prepare('SELECT phone FROM companies WHERE id = ?').get(companyId);
  const notifyPhones = [...new Set([
    ...(company?.phone ? [company.phone] : []),
    ...adminPhones,
  ])].slice(0, 3); // max 3 recipients

  let alertsSent = 0;

  for (const v of fleet) {
    const row = byId[v.id];
    if (!row) continue;

    const checks = [
      { type: 'besiktning', days: daysUntil(row.besiktning_datum), datum: row.besiktning_datum },
      { type: 'forsakring', days: daysUntil(row.forsakring_datum), datum: row.forsakring_datum },
      { type: 'adr',        days: row.adr_datum ? daysUntil(row.adr_datum) : null,  datum: row.adr_datum },
      { type: 'service',    days: daysUntil(row.service_datum),    datum: row.service_datum },
    ];

    // km-based service estimate
    const serviceEstDays = estimateServiceDays(companyId, v.id, row.service_km, row.current_km);
    if (serviceEstDays !== null) {
      checks.push({ type: 'service_km', days: serviceEstDays, datum: null });
    }

    for (const check of checks) {
      if (check.days === null) continue;

      for (const threshold of THRESHOLDS) {
        if (check.days <= threshold) {
          if (hasAlertBeenSent(companyId, v.id, check.type, threshold)) continue;

          const msg = buildAlertMessage(v.id, v.namn, check.type, check.days, check.datum);
          console.log(`[underhåll-alert] ${companyId}/${v.id}/${check.type}/${threshold}d: ${msg}`);

          for (const phone of notifyPhones) {
            await sendSms(phone, msg);
          }

          markAlertSent(companyId, v.id, check.type, threshold);
          alertsSent++;
          break; // only send the tightest threshold not yet sent
        }
      }
    }
  }

  return alertsSent;
}

export async function runMaintenanceAlerts() {
  const companies = db.prepare('SELECT id FROM companies WHERE active = 1').all();
  let total = 0;
  for (const { id } of companies) {
    try {
      const n = await processCompany(id);
      total += n;
    } catch (err) {
      console.error(`[underhåll-alert] Failed for company ${id}:`, err.message);
    }
  }
  console.log(`[underhåll-alert] ${total} alerts processed — ${new Date().toISOString()}`);
}

export function scheduleMaintenanceAlerts() {
  // Run once at startup, then every 6 hours
  runMaintenanceAlerts().catch(console.error);
  setInterval(() => runMaintenanceAlerts().catch(console.error), 6 * 60 * 60 * 1000);
}
