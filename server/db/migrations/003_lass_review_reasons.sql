-- Phase 4: why a lass version needs office review, and photo lookups.

-- JSON array of Swedish reasons, e.g. ["Nettovikt osäker", "Farligt avfall"]. Empty or NULL when status is ok.
ALTER TABLE lass_versions ADD COLUMN review_reasons_json TEXT;

-- Retried uploads of the same (re-encoded) image are de-duplicated per uploader.
CREATE INDEX ix_photos_sha ON photos(company_id, sha256);
CREATE INDEX ix_ai_extractions_photo ON ai_extractions(input_photo_id);
CREATE INDEX ix_time_entries_lookup ON time_entries(company_id, assignment_id, datum);
