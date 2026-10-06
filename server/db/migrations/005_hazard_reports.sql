-- Phase 5: the office records that a hazardous-waste lass has been reported to Naturvårdsverket's
-- avfallsregister (deadline: two working days after the transport). One live report per lass.
-- An undo sets withdrawn_at instead of deleting, so the history stays in the table and in audit_log.

CREATE TABLE hazard_reports (
  id                   INTEGER PRIMARY KEY,
  company_id           INTEGER NOT NULL REFERENCES companies(id),
  lass_id              INTEGER NOT NULL REFERENCES lass(id),
  reported_on          TEXT    NOT NULL,      -- local date the report was filed, YYYY-MM-DD
  reference            TEXT,                  -- e.g. the registry's ärende-id
  reported_by_user_id  INTEGER NOT NULL REFERENCES users(id),
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  withdrawn_at         TEXT,
  withdrawn_by_user_id INTEGER REFERENCES users(id)
);
CREATE UNIQUE INDEX ux_hazard_reports_live ON hazard_reports(lass_id) WHERE withdrawn_at IS NULL;
CREATE INDEX ix_hazard_reports_company ON hazard_reports(company_id, lass_id);
