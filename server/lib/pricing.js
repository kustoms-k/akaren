// Price resolution and line amounts for the fakturaunderlag. Money is integer öre ex VAT.
//
// Lists are tried in order: the project's list, the customer's list, the company default.
// The first list with an applicable item wins, and within it the most specific item:
// uppdragstyp + material > uppdragstyp > material > generic.

export const UNITS = ['lass', 'ton', 'timme', 'fast'];
export const VAT_RATE = { normal: 25, omvand_bygg: 0 };

const fold = (s) => String(s ?? '').toLowerCase()
  .replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

/** An item's material covers a material when it's contained in it: 'Förorenade massor' covers 'Förorenade massor (PAH)'. */
export function materialMatches(itemMaterial, material) {
  const a = fold(itemMaterial);
  return a !== '' && fold(material).includes(a);
}

/** How specific an item is for a job/lass, or null if it doesn't apply. */
export function specificity(item, { uppdragstyp, material }) {
  if (item.uppdragstyp && item.uppdragstyp !== uppdragstyp) return null;
  if (item.material && !materialMatches(item.material, material)) return null;
  return (item.uppdragstyp ? 2 : 0) + (item.material ? 1 : 0);
}

/**
 * lists: [{ id, name, items: [{ id, uppdragstyp, material, unit, price_ore }] }] in priority order (nulls skipped).
 * units: only consider items with one of these units (e.g. ['ton', 'lass'] for a lass row).
 * Returns { item, list } or null when nothing applies ("Pris saknas").
 */
export function resolvePrice(lists, { uppdragstyp, material = null, units = null }) {
  for (const list of lists) {
    if (!list) continue;
    let best = null;
    for (const item of list.items) {
      if (units && !units.includes(item.unit)) continue;
      const s = specificity(item, { uppdragstyp, material });
      if (s == null) continue;
      if (!best || s > best.s || (s === best.s && item.id < best.item.id)) best = { item, s };
    }
    if (best) return { item: best.item, list: { id: list.id, name: list.name } };
  }
  return null;
}

/** The lists to try for a customer and project, given every list of the company. */
export function listsFor(allLists, { projectListId = null, customerListId = null }) {
  const byId = new Map(allLists.map((l) => [l.id, l]));
  const fallback = allLists.find((l) => l.is_default) ?? null;
  return [byId.get(projectListId), byId.get(customerListId), fallback]
    .filter(Boolean)
    .filter((l, i, arr) => arr.findIndex((x) => x.id === l.id) === i);
}

/** Line amount in öre. ton: price per ton × netto kg / 1000, rounded per line. */
export function lineAmount(unit, priceOre, { nettoKg = null, hours = null } = {}) {
  switch (unit) {
    case 'ton': return nettoKg == null ? null : Math.round((priceOre * nettoKg) / 1000);
    case 'timme': return hours == null ? null : Math.round(priceOre * hours);
    case 'lass':
    case 'fast': return priceOre;
    default: throw new Error(`Unknown unit ${unit}`);
  }
}

/** The quantity shown and sent to Fortnox: tonnes with 3 decimals, hours, or 1. */
export function lineQuantity(unit, { nettoKg = null, hours = null } = {}) {
  if (unit === 'ton') return nettoKg == null ? null : nettoKg / 1000;
  if (unit === 'timme') return hours;
  return 1;
}

/** VAT for a net amount. Omvänd byggmoms: 0 % on the invoice, the buyer accounts for it. */
export function vatFor(vatMode, netOre) {
  const rate = VAT_RATE[vatMode] ?? 25;
  const vat = Math.round((netOre * rate) / 100);
  return { rate, vat_ore: vat, total_ore: netOre + vat };
}
