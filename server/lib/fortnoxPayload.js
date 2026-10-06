import { VAT_RATE } from './pricing.js';
import { weekLabel } from './weeks.js';

// The Fortnox draft invoice (POST /3/invoices) for one customer + project and week. Pure.
// The invoice is created unbooked; we never call bookkeep or any send endpoint.
//
// To verify against a Fortnox sandbox (pivot plan §7): the 50-character Description limit,
// DeliveredQuantity as the quantity field, whether the Unit codes must exist in the customer's
// Fortnox settings, and how reverse charge is set (here: VAT 0 on the rows, a remark on the invoice,
// and VATType SEREVERSEDVAT on the customer in Fortnox).

export const DESCRIPTION_MAX = 50;
export const FORTNOX_UNITS = { ton: 't', lass: 'st', timme: 'tim', fast: 'st' };
export const REVERSE_CHARGE_TEXT = 'Omvänd betalningsskyldighet för byggtjänster enligt 16 kap. 13 § mervärdesskattelagen. Köparen redovisar momsen.';

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/[\s,;:–-]+$/, '')}…` : t;
};
/** Öre → kronor with two decimals, as Fortnox expects. */
export const kronor = (ore) => Math.round(ore) / 100;

/**
 * group: from buildUnderlag (customer, project, vat_mode); rows: the rows to invoice.
 * Returns { Invoice: {...} }.
 */
export function buildFortnoxInvoice({ group, rows, week, externalRef, invoiceDate = null }) {
  if (!group.customer.fortnox_customer_nr) throw new Error('Customer has no Fortnox customer number');
  if (!rows.length) throw new Error('No rows');
  const reverse = group.vat_mode === 'omvand_bygg';
  const vat = VAT_RATE[group.vat_mode] ?? 25;
  const remarks = [`Fakturaunderlag ${weekLabel(week)}. Projekt: ${group.project.name}.`, reverse ? REVERSE_CHARGE_TEXT : null]
    .filter(Boolean).join('\n');
  return {
    Invoice: {
      CustomerNumber: group.customer.fortnox_customer_nr,
      ...(invoiceDate ? { InvoiceDate: invoiceDate } : {}),
      ...(group.project.customer_ref ? { YourReference: clip(group.project.customer_ref, 50) } : {}),
      ExternalInvoiceReference1: externalRef,
      ExternalInvoiceReference2: week,
      Remarks: clip(remarks, 1024),
      VATIncluded: false,
      InvoiceRows: rows.map((r) => ({
        Description: clip(r.description, DESCRIPTION_MAX),
        DeliveredQuantity: r.unit === 'ton' ? Number(r.quantity.toFixed(3)) : r.quantity,
        Unit: FORTNOX_UNITS[r.unit],
        Price: kronor(r.price_ore),
        VAT: vat,
      })),
    },
  };
}
