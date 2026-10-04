-- Order confirmation email (orderbekräftelse) to the customer.

-- Email of the customer contact who placed the order; the default recipient.
ALTER TABLE jobs ADD COLUMN epost TEXT;

-- Terms text included in every order confirmation, e.g. a reference to Alltrans 2007 and cancellation rules.
ALTER TABLE companies ADD COLUMN order_terms TEXT;

-- Every send attempt with the exact content, so the office can show what was confirmed and when.
CREATE TABLE order_confirmations (
  id              INTEGER PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  job_id          INTEGER NOT NULL REFERENCES jobs(id),
  to_email        TEXT    NOT NULL,
  cc_email        TEXT,
  bcc_email       TEXT,
  subject         TEXT    NOT NULL,
  body_text       TEXT    NOT NULL,
  body_html       TEXT    NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ('skickat','simulerat','misslyckat')),
  error           TEXT,
  message_id      TEXT,
  sent_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_order_confirmations_job ON order_confirmations(company_id, job_id, created_at);
