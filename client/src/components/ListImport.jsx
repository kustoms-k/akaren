import { formatDate, formatKr, formatTon } from '../lib/labels.js';

// Column mapping and preview for an imported list: a facility's weighing list (Avstämning, Förlustkontroll) or an
// invoice specification (Förlustkontroll).

const WEIGH_FIELDS = ['datum', 'tid', 'vagsedel_nr', 'regnr', 'netto_kg', 'brutto_kg', 'tara_kg', 'material', 'referens'];

/** Which column is which. `fields`: the fields to offer, in order; `required`: fields marked with *. */
export function MappingPicker({ headers, mapping, onChange, labels, fields = WEIGH_FIELDS, required = null, idPrefix = '' }) {
  const set = (field, value) => {
    const columns = { ...mapping.columns };
    if (value === '') delete columns[field];
    else {
      const i = Number(value);
      // A column can only mean one thing: whatever had it before lets go.
      for (const [f, c] of Object.entries(columns)) if (c === i) delete columns[f];
      columns[field] = i;
    }
    onChange({ ...mapping, columns });
  };
  const req = required ?? { datum: true, netto_kg: mapping.columns.brutto_kg == null };
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
      {fields.map((f) => (
        <div className="field" key={f}>
          <label className="field-label" htmlFor={`map-${idPrefix}${f}`}>{labels[f]}{req[f] ? ' *' : ''}</label>
          <select id={`map-${idPrefix}${f}`} className="input" value={mapping.columns[f] ?? ''} onChange={(e) => set(f, e.target.value)}>
            <option value="">– Ingen –</option>
            {headers.map((h, i) => <option key={i} value={i}>{h || `Kolumn ${i + 1}`}</option>)}
          </select>
        </div>
      ))}
      <div className="field">
        <span className="field-label">Vikten är i</span>
        <div className="segmented" role="group" aria-label="Viktenhet">
          {[['kg', 'kg'], ['ton', 'ton']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={mapping.unit === v} onClick={() => onChange({ ...mapping, unit: v })}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The first parsed rows. `amounts`: show the invoice amount column. */
export function PreviewTable({ rows, amounts = false }) {
  return (
    <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10, maxHeight: 280, overflow: 'auto' }}>
      <table className="table">
        <thead><tr><th>Rad</th><th>Datum</th><th>Tid</th><th>Vågsedel</th><th>Regnr</th><th>Material</th><th style={{ textAlign: 'right' }}>Netto</th>{amounts && <th style={{ textAlign: 'right' }}>Belopp</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line}>
              <td className="num t-muted">{r.line}</td>
              <td className="num">{formatDate(r.datum)}</td>
              <td className="num">{r.tid ?? '–'}</td>
              <td className="num">{r.vagsedel_nr ?? '–'}</td>
              <td className="num">{r.regnr ?? '–'}</td>
              <td>{r.material ?? '–'}</td>
              <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                {formatTon(r.netto_kg) || (amounts ? <span className="t-muted">–</span> : <span className="badge badge-amber">Saknas</span>)}
              </td>
              {amounts && <td className="num" style={{ textAlign: 'right' }}>{r.belopp_ore != null ? formatKr(r.belopp_ore) : '–'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
