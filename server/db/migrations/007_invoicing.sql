-- Phase 6: the weekly fakturaunderlag reads batches per week; customers and projects look up their price list.
CREATE INDEX ix_invoice_batches_week ON invoice_batches(company_id, iso_week, customer_id, project_id);
CREATE INDEX ix_customers_price_list ON customers(price_list_id) WHERE price_list_id IS NOT NULL;
CREATE INDEX ix_projects_price_list  ON projects(price_list_id)  WHERE price_list_id IS NOT NULL;
