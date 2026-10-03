-- Phase 3: AI spend tracking (monthly budget) and the human review record on order intakes.

ALTER TABLE ai_extractions ADD COLUMN stop_reason TEXT;
ALTER TABLE ai_extractions ADD COLUMN cache_read_tokens INTEGER;
ALTER TABLE ai_extractions ADD COLUMN cache_write_tokens INTEGER;
-- Estimated list-price cost of the call in micro-USD (1 USD = 1 000 000).
ALTER TABLE ai_extractions ADD COLUMN cost_micro_usd INTEGER NOT NULL DEFAULT 0;
CREATE INDEX ix_ai_extractions_month ON ai_extractions(company_id, created_at);

-- What the office user actually confirmed, and which AI values they changed or accepted.
ALTER TABLE order_intakes ADD COLUMN final_json TEXT;
ALTER TABLE order_intakes ADD COLUMN overrides_json TEXT;
CREATE INDEX ix_order_intakes_status ON order_intakes(company_id, status, created_at);
