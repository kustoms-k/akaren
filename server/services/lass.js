import { conflict, notFound } from '../lib/http.js';
import { LASS_FIELDS, REGNR_MISMATCH_REASON, reviewStatusFor } from '../lib/lassReview.js';

/**
 * Lass records: an immutable identity row plus append-only versions.
 * Every change is a new full snapshot in lass_versions; nothing is updated in place.
 */
export function createLassService({ db }) {
  const stmtInsertLass = db.prepare(`
    INSERT INTO lass (company_id, job_id, assignment_id, client_uuid, weigh_list_row_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const stmtWeighRow = db.prepare('SELECT weigh_list_row_id FROM lass WHERE id = ?');
  const stmtInsertVersion = db.prepare(`
    INSERT INTO lass_versions (lass_id, version, customer_id, project_id, vehicle_regnr, driver_id, datum, tid,
      fran_text, till_namn, till_orgnr, till_adress, material, avfallskod, farligt_avfall, netto_kg, vagsedel_nr,
      photo_id, ai_extraction_id, field_confidence_json, review_status, review_reasons_json, note, change_reason,
      created_by_kind, created_by_user_id, created_by_driver_id, created_at)
    VALUES (@lass_id, @version, @customer_id, @project_id, @vehicle_regnr, @driver_id, @datum, @tid,
      @fran_text, @till_namn, @till_orgnr, @till_adress, @material, @avfallskod, @farligt_avfall, @netto_kg, @vagsedel_nr,
      @photo_id, @ai_extraction_id, @field_confidence_json, @review_status, @review_reasons_json, @note, @change_reason,
      @created_by_kind, @created_by_user_id, @created_by_driver_id, @created_at)
  `);
  const stmtCurrent = db.prepare('SELECT * FROM lass_current WHERE lass_id = ? AND company_id = ?');
  const stmtByClientUuid = db.prepare('SELECT id FROM lass WHERE client_uuid = ? AND company_id = ?');
  const stmtVersions = db.prepare('SELECT * FROM lass_versions WHERE lass_id = ? ORDER BY version');
  const stmtDuplicate = db.prepare(`
    SELECT 1 FROM lass_current
    WHERE company_id = ? AND lower(trim(vagsedel_nr)) = lower(trim(?)) AND lass_id != ? LIMIT 1
  `);
  const stmtStartJob = db.prepare(`
    UPDATE jobs SET status = 'pagar', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? AND status = 'bekraftad'
  `);
  const stmtInvoiced = db.prepare('SELECT 1 FROM invoice_lines WHERE lass_id = ? LIMIT 1');

  const parseJson = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

  /** Current version with parsed JSON columns, or null. */
  function current(lassId, companyId) {
    const row = stmtCurrent.get(lassId, companyId);
    if (!row) return null;
    return {
      ...row,
      farligt_avfall: Boolean(row.farligt_avfall),
      field_confidence: parseJson(row.field_confidence_json, {}),
      review_reasons: parseJson(row.review_reasons_json, []),
    };
  }

  function isDuplicate(companyId, vagsedelNr, exceptLassId = 0) {
    return Boolean(vagsedelNr) && Boolean(stmtDuplicate.get(companyId, vagsedelNr, exceptLassId));
  }

  function versionRow(base) {
    const row = { ...base };
    for (const k of LASS_FIELDS) row[k] = base.values[k] ?? null;
    row.farligt_avfall = base.values.farligt_avfall ? 1 : 0;
    delete row.values;
    return row;
  }

  /**
   * Create a lass with version 1. Idempotent on clientUuid: a retried submit returns the existing lass.
   * Returns { lass, created }.
   */
  function create({
    companyId, jobId, assignmentId = null, clientUuid = null, customerId, projectId, vehicleRegnr, driverId = null,
    values, photoId = null, aiExtractionId = null, confidence, regnrMismatch = false, note = null, weighListRowId = null,
    createdByKind, createdByUserId = null, createdByDriverId = null, createdAt = new Date().toISOString(),
  }) {
    if (clientUuid) {
      const existing = stmtByClientUuid.get(clientUuid, companyId);
      if (existing) return { lass: current(existing.id, companyId), created: false };
    }
    const review = reviewStatusFor({
      confidence, hasPhoto: Boolean(photoId), fromWeighList: Boolean(weighListRowId),
      duplicate: isDuplicate(companyId, values.vagsedel_nr), farligtAvfall: Boolean(values.farligt_avfall), regnrMismatch,
    });
    const lassId = db.transaction(() => {
      const id = Number(stmtInsertLass.run(companyId, jobId, assignmentId, clientUuid, weighListRowId, createdAt).lastInsertRowid);
      stmtInsertVersion.run(versionRow({
        lass_id: id, version: 1, customer_id: customerId, project_id: projectId, vehicle_regnr: vehicleRegnr,
        driver_id: driverId, values, photo_id: photoId, ai_extraction_id: aiExtractionId,
        field_confidence_json: JSON.stringify(confidence), review_status: review.status,
        review_reasons_json: JSON.stringify(review.reasons), note, change_reason: null,
        created_by_kind: createdByKind, created_by_user_id: createdByUserId, created_by_driver_id: createdByDriverId,
        created_at: createdAt,
      }));
      stmtStartJob.run(jobId);
      return id;
    })();
    return { lass: current(lassId, companyId), created: true };
  }

  /**
   * Append a corrected version. `patch` holds changed lass fields; confidence for changed fields
   * becomes `personKind`. reviewStatus forces a status (e.g. 'granskad' when the office approves).
   * markChecked: a person checked every value (office review), so uncertain AI values become `personKind` too.
   * The other-truck flag is carried over from the previous version; the ticket photo doesn't change.
   */
  function addVersion({
    lassId, companyId, patch = {}, note, changeReason, personKind, reviewStatus = null, markChecked = false,
    createdByKind, createdByUserId = null, createdByDriverId = null,
  }) {
    const prev = current(lassId, companyId);
    if (!prev) throw notFound('Lasset finns inte.');
    if (stmtInvoiced.get(lassId)) throw conflict('invoiced', 'Lasset är redan fakturerat och kan inte ändras.');

    const values = {};
    for (const k of LASS_FIELDS) values[k] = Object.hasOwn(patch, k) ? patch[k] : prev[k];
    const confidence = { ...prev.field_confidence };
    for (const k of LASS_FIELDS) {
      if (!Object.hasOwn(patch, k)) continue;
      const before = prev[k] == null ? '' : String(prev[k]);
      const after = values[k] == null ? '' : String(values[k]);
      if (before !== after) confidence[k] = after === '' ? 'saknas' : personKind;
    }
    if (markChecked) {
      for (const k of LASS_FIELDS) {
        if (values[k] != null && values[k] !== '' && ['lag', 'saknas', undefined].includes(confidence[k])) confidence[k] = personKind;
      }
    }
    const review = reviewStatus
      ? { status: reviewStatus, reasons: [] }
      : reviewStatusFor({
        confidence, hasPhoto: Boolean(prev.photo_id), fromWeighList: Boolean(stmtWeighRow.pluck().get(lassId)),
        duplicate: isDuplicate(companyId, values.vagsedel_nr, lassId),
        farligtAvfall: Boolean(values.farligt_avfall), regnrMismatch: prev.review_reasons.includes(REGNR_MISMATCH_REASON),
      });

    stmtInsertVersion.run(versionRow({
      lass_id: lassId, version: prev.version + 1, customer_id: prev.customer_id, project_id: prev.project_id,
      vehicle_regnr: prev.vehicle_regnr, driver_id: prev.driver_id, values, photo_id: prev.photo_id,
      ai_extraction_id: prev.ai_extraction_id, field_confidence_json: JSON.stringify(confidence),
      review_status: review.status, review_reasons_json: JSON.stringify(review.reasons),
      note: note === undefined ? prev.note : note, change_reason: changeReason,
      created_by_kind: createdByKind, created_by_user_id: createdByUserId, created_by_driver_id: createdByDriverId,
      created_at: new Date().toISOString(),
    }));
    return current(lassId, companyId);
  }

  function versions(lassId) {
    return stmtVersions.all(lassId).map((v) => ({
      ...v,
      farligt_avfall: Boolean(v.farligt_avfall),
      field_confidence: parseJson(v.field_confidence_json, {}),
      review_reasons: parseJson(v.review_reasons_json, []),
    }));
  }

  return { create, addVersion, current, versions, isDuplicate };
}
