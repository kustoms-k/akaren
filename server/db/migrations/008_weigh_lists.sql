-- Avstämning: a receiving facility's weighing list (våglista) for a period, imported by the office and matched
-- against the logged lass. Matching is computed on every read, so it follows later corrections; only what the
-- office decided about a row is stored (lass created from it, or ignored with a reason).

CREATE TABLE weigh_lists (
  id                 INTEGER PRIMARY KEY,
  company_id         INTEGER NOT NULL REFERENCES companies(id),
  facility_name      TEXT    NOT NULL,
  facility_orgnr     TEXT,
  period_from        TEXT    NOT NULL,          -- local dates, YYYY-MM-DD: first and last weighing on the list
  period_to          TEXT    NOT NULL,
  source_name        TEXT,                      -- file name, or NULL when pasted
  mapping_json       TEXT    NOT NULL,          -- column → field, plus the weight unit, as confirmed by the office
  skipped_json       TEXT    NOT NULL DEFAULT '[]',  -- rows that couldn't be read: [{ line, reason }]
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (period_from <= period_to)
);
CREATE INDEX ix_weigh_lists_company ON weigh_lists(company_id, period_to);

CREATE TABLE weigh_list_rows (
  id                  INTEGER PRIMARY KEY,
  weigh_list_id       INTEGER NOT NULL REFERENCES weigh_lists(id) ON DELETE CASCADE,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  line_no             INTEGER NOT NULL,          -- line in the imported text, for "rad 14" in the UI
  datum               TEXT    NOT NULL,
  tid                 TEXT,
  vagsedel_nr         TEXT,
  regnr               TEXT,                      -- normalised when it is a valid Swedish regnr, else as written
  netto_kg            INTEGER CHECK (netto_kg IS NULL OR netto_kg > 0),
  material            TEXT,
  referens            TEXT,                      -- customer / marking / project text on the list, shown as-is
  resolution          TEXT CHECK (resolution IN ('lass_skapad', 'ignorerad')),
  resolution_note     TEXT,
  resolved_lass_id    INTEGER REFERENCES lass(id),
  resolved_by_user_id INTEGER REFERENCES users(id),
  resolved_at         TEXT,
  CHECK ((resolution = 'lass_skapad') = (resolved_lass_id IS NOT NULL)),
  CHECK (resolution IS NOT 'ignorerad' OR (resolution_note IS NOT NULL AND length(trim(resolution_note)) > 0))
);
CREATE INDEX ix_weigh_list_rows_list ON weigh_list_rows(weigh_list_id, datum);
CREATE UNIQUE INDEX ux_weigh_list_rows_lass ON weigh_list_rows(resolved_lass_id) WHERE resolved_lass_id IS NOT NULL;

-- A lass the office created from a weighing-list row. The row is its evidence instead of a photo of the ticket.
-- Set once at creation, like the rest of the lass identity row.
ALTER TABLE lass ADD COLUMN weigh_list_row_id INTEGER REFERENCES weigh_list_rows(id);

-- Matching looks up lass by truck and day.
CREATE INDEX ix_lass_versions_regnr ON lass_versions(vehicle_regnr, datum);
