import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { TextField, SelectField } from '../components/Field.jsx';
import { Link } from '../components/Link.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useForm } from '../lib/useForm.js';
import { useToast } from '../lib/toast.js';
import { PRICE_UNITS, UPPDRAGSTYPER, formatKr } from '../lib/labels.js';

const EMPTY_ITEM = { uppdragstyp: '', material: '', unit: 'ton', price: '' };

/** '132,50' or '1 290' (kr) → öre; '' → null; anything else → NaN. */
function krToOre(v) {
  const s = String(v ?? '').replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}
const oreToKr = (ore) => (ore == null ? '' : String(ore / 100).replace('.', ','));

function ItemDialog({ open, list, item, onClose, onSaved }) {
  const form = useForm(EMPTY_ITEM);
  const { reset } = form;
  useEffect(() => {
    if (open) reset(item ? { uppdragstyp: item.uppdragstyp ?? '', material: item.material ?? '', unit: item.unit, price: oreToKr(item.price_ore) } : EMPTY_ITEM);
  }, [open, item, reset]);

  async function save(e) {
    e?.preventDefault();
    const priceOre = krToOre(form.values.price);
    if (priceOre == null || Number.isNaN(priceOre)) { form.setErrors({ price: 'Ange ett pris i kronor, t.ex. 132,50.' }); return; }
    try {
      await form.submit((v) => api(item ? `/api/price-lists/${list.id}/items/${item.id}` : `/api/price-lists/${list.id}/items`, {
        method: item ? 'PATCH' : 'POST',
        body: { uppdragstyp: v.uppdragstyp || null, material: v.material || null, unit: v.unit, price_ore: priceOre },
      }));
      onSaved();
    } catch { /* shown in the form */ }
  }

  return (
    <Dialog open={open} onClose={onClose} title={item ? 'Ändra pris' : 'Nytt pris'} description={list?.name}
      footer={<><Button variant="secondary" onClick={onClose}>Avbryt</Button><Button onClick={save} loading={form.busy}>Spara</Button></>}>
      <form onSubmit={save} className="form-grid">
        <SelectField label="Uppdragstyp" options={[['', 'Alla typer'], ...Object.entries(UPPDRAGSTYPER)]} {...form.field('uppdragstyp')} />
        <SelectField label="Enhet" options={Object.entries(PRICE_UNITS)} {...form.field('unit')} />
        <TextField className="span-2" label="Material (valfritt)" placeholder="t.ex. Förorenade massor"
          hint="Gäller när lassets material innehåller texten. Ett pris med material går före ett utan." {...form.field('material')} />
        <TextField label="Pris (kr exkl. moms)" inputMode="decimal" placeholder="132,50" {...form.field('price')} />
        {form.formError && <div className="notice notice-red span-2">{form.formError}</div>}
      </form>
    </Dialog>
  );
}

function ListDialog({ open, list, onClose, onSaved }) {
  const form = useForm({ name: '' });
  const { reset } = form;
  useEffect(() => { if (open) reset({ name: list?.name ?? '' }); }, [open, list, reset]);
  async function save(e) {
    e?.preventDefault();
    try {
      const saved = await form.submit((v) => api(list ? `/api/price-lists/${list.id}` : '/api/price-lists', { method: list ? 'PATCH' : 'POST', body: { name: v.name } }));
      onSaved(saved);
    } catch { /* shown in the form */ }
  }
  return (
    <Dialog open={open} onClose={onClose} title={list ? 'Byt namn' : 'Ny prislista'}
      description={list ? null : 'Koppla den sedan till en kund eller ett projekt under Kunder & projekt.'}
      footer={<><Button variant="secondary" onClick={onClose}>Avbryt</Button><Button onClick={save} loading={form.busy}>Spara</Button></>}>
      <form onSubmit={save}><TextField label="Namn" placeholder="t.ex. Saltsjö Bygg – avtal 2026" {...form.field('name')} /></form>
    </Dialog>
  );
}

export function PriceLists() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/api/price-lists');
  const [itemDialog, setItemDialog] = useState(null);   // { list, item }
  const [listDialog, setListDialog] = useState(null);   // { list } (null list = new)

  async function act(fn, done) {
    try { await fn(); toast(done); reload(); } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <Link to="/faktura" className="t-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, textDecoration: 'none', fontSize: 13 }}>
        <ArrowLeft size={14} /> Fakturaunderlag
      </Link>
      <PageHeader
        title="Prislistor"
        description="Priser exkl. moms. Åkaren använder projektets prislista först, sedan kundens och sist standardlistan. Det mest specifika priset vinner."
        actions={<Button onClick={() => setListDialog({ list: null })}><Plus size={14} /> Ny prislista</Button>}
      />
      <ErrorNotice error={error} onRetry={reload} />
      {loading && !data ? <TableSkeleton rows={6} /> : data?.map((list) => (
        <section key={list.id} className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 className="t-heading">{list.name}</h2>
              {list.is_default && <span className="badge badge-blue">Standard</span>}
              <span className="t-muted" style={{ fontSize: 12 }}>
                {list.is_default ? 'Gäller alla som saknar egen lista' : `Används av ${list.customer_count} kunder och ${list.project_count} projekt`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {!list.is_default && <Button size="sm" variant="ghost" onClick={() => act(() => api(`/api/price-lists/${list.id}`, { method: 'PATCH', body: { is_default: true } }), `${list.name} är nu standard`)}><Star size={13} /> Gör till standard</Button>}
              <Button size="sm" variant="ghost" onClick={() => setListDialog({ list })}><Pencil size={13} /> Byt namn</Button>
              {!list.is_default && <Button size="sm" variant="ghost" onClick={() => window.confirm(`Ta bort ${list.name}?`) && act(() => api(`/api/price-lists/${list.id}`, { method: 'DELETE' }), 'Prislistan är borttagen')}><Trash2 size={13} /></Button>}
            </div>
          </div>
          {list.items.length === 0 ? <div className="empty" style={{ padding: 24 }}>Inga priser än.</div> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Uppdragstyp</th><th>Material</th><th>Enhet</th><th style={{ textAlign: 'right' }}>Pris</th><th /></tr></thead>
                <tbody>
                  {list.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.uppdragstyp ? UPPDRAGSTYPER[it.uppdragstyp] : <span className="t-muted">Alla typer</span>}</td>
                      <td>{it.material ?? <span className="t-muted">Allt material</span>}</td>
                      <td>{PRICE_UNITS[it.unit]}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{formatKr(it.price_ore)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Button size="sm" variant="ghost" onClick={() => setItemDialog({ list, item: it })} aria-label="Ändra"><Pencil size={13} /></Button>{' '}
                        <Button size="sm" variant="ghost" aria-label="Ta bort" onClick={() => window.confirm('Ta bort priset?') && act(() => api(`/api/price-lists/${list.id}/items/${it.id}`, { method: 'DELETE' }), 'Priset är borttaget')}><Trash2 size={13} /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: '10px 18px' }}>
            <Button size="sm" variant="secondary" onClick={() => setItemDialog({ list, item: null })}><Plus size={13} /> Lägg till pris</Button>
          </div>
        </section>
      ))}
      <ItemDialog open={itemDialog != null} list={itemDialog?.list} item={itemDialog?.item} onClose={() => setItemDialog(null)}
        onSaved={() => { setItemDialog(null); toast('Priset är sparat'); reload(); }} />
      <ListDialog open={listDialog != null} list={listDialog?.list} onClose={() => setListDialog(null)}
        onSaved={() => { setListDialog(null); toast('Prislistan är sparad'); reload(); }} />
    </>
  );
}
