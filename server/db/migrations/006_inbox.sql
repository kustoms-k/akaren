-- Order inbox: a connected mailbox, incoming emails sorted into order-related or not, and replies sent from it.

-- One mailbox per company (the dedicated order address, read-only). provider 'demo' is the DEMO_MODE mailbox.
CREATE TABLE mail_accounts (
  id              INTEGER PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  provider        TEXT    NOT NULL CHECK (provider IN ('microsoft','google','imap','demo')),
  address         TEXT    NOT NULL,
  folder          TEXT    NOT NULL DEFAULT 'Inkorgen',
  status          TEXT    NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','reconnect_required','disconnected')),
  credentials_enc TEXT,
  last_sync_at    TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX ux_mail_accounts_company ON mail_accounts(company_id);

-- category: what the email is about. category_source: who decided (AI, a cheap pre-filter rule, or the office).
CREATE TABLE inbound_emails (
  id                 INTEGER PRIMARY KEY,
  company_id         INTEGER NOT NULL REFERENCES companies(id),
  mail_account_id    INTEGER NOT NULL REFERENCES mail_accounts(id),
  message_id         TEXT    NOT NULL,
  in_reply_to        TEXT,
  thread_id          INTEGER,              -- id of the first email in the thread
  from_name          TEXT,
  from_email         TEXT    NOT NULL,
  to_email           TEXT,
  cc                 TEXT,
  subject            TEXT    NOT NULL DEFAULT '',
  body_text          TEXT    NOT NULL DEFAULT '',
  received_at        TEXT    NOT NULL,
  category           TEXT    NOT NULL CHECK (category IN ('bestallning','andring','avbokning','fraga','svar','ovrigt')),
  category_source    TEXT    NOT NULL CHECK (category_source IN ('ai','regel','kontoret')),
  summary            TEXT,
  filter_reason      TEXT,
  flags_json         TEXT    NOT NULL DEFAULT '[]',
  change_json        TEXT    NOT NULL DEFAULT '[]',
  ai_extraction_id   INTEGER REFERENCES ai_extractions(id),
  job_id             INTEGER REFERENCES jobs(id),
  order_intake_id    INTEGER REFERENCES order_intakes(id),
  read_at            TEXT,
  handled_at         TEXT,
  handled_by_user_id INTEGER REFERENCES users(id),
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX ux_inbound_emails_message ON inbound_emails(company_id, message_id);
CREATE INDEX ix_inbound_emails_thread   ON inbound_emails(company_id, thread_id, received_at);
CREATE INDEX ix_inbound_emails_received ON inbound_emails(company_id, received_at);
CREATE INDEX ix_inbound_emails_intake   ON inbound_emails(order_intake_id) WHERE order_intake_id IS NOT NULL;

-- Attachment metadata and extracted text (shown as a preview and given to the AI). No file bytes are kept.
CREATE TABLE inbound_attachments (
  id           INTEGER PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id),
  email_id     INTEGER NOT NULL REFERENCES inbound_emails(id),
  filename     TEXT    NOT NULL,
  content_type TEXT    NOT NULL,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  text_content TEXT
);
CREATE INDEX ix_inbound_attachments_email ON inbound_attachments(email_id);

-- Every reply sent from the inbox, with the exact content. Threaded with In-Reply-To/References via message_id.
CREATE TABLE email_replies (
  id                    INTEGER PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES companies(id),
  thread_id             INTEGER NOT NULL,
  inbound_email_id      INTEGER NOT NULL REFERENCES inbound_emails(id),
  template              TEXT    NOT NULL CHECK (template IN ('bekrafta','nytt_datum','mer_info','tacka_nej','bekrafta_andring','bekrafta_avbokning','fritt')),
  from_email            TEXT    NOT NULL,
  to_email              TEXT    NOT NULL,
  cc_email              TEXT,
  subject               TEXT    NOT NULL,
  body_text             TEXT    NOT NULL,
  body_html             TEXT    NOT NULL,
  status                TEXT    NOT NULL CHECK (status IN ('skickat','simulerat','misslyckat')),
  error                 TEXT,
  message_id            TEXT    NOT NULL,
  order_confirmation_id INTEGER REFERENCES order_confirmations(id),
  sent_by_user_id       INTEGER NOT NULL REFERENCES users(id),
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_email_replies_thread ON email_replies(company_id, thread_id, created_at);
CREATE UNIQUE INDEX ux_email_replies_message ON email_replies(company_id, message_id);
