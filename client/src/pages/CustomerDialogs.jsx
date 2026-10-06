import { useEffect } from 'react';
import { Button } from '../components/Button.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { TextField, SelectField, Checkbox } from '../components/Field.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useForm } from '../lib/useForm.js';
import { ZONE_CLASSES, VAT_MODES, formatPhone } from '../lib/labels.js';

const EMPTY_CUSTOMER = { name: '', org_nr: '', address: '', postnr: '', ort: '', email: '', phone: '', vat_mode: '', price_list_id: '', active: true };

/** Price list picker options: '' = inherit (the label says from where). */
function usePriceListOptions(open, inherit) {
  const { data } = useApi(open ? '/api/price-lists' : null);
  return [['', inherit], ...(data ?? []).filter((l) => !l.is_default).map((l) => [String(l.id), l.name])];
}

/** Create (customer = null) or edit a customer. */
export function CustomerDialog({ open, customer, onClose, onSaved }) {
  const form = useForm(EMPTY_CUSTOMER);
  const { reset } = form;
  const priceLists = usePriceListOptions(open, 'Standardprislistan');

  useEffect(() => {
    if (!open) return;
    reset(customer ? {
      ...EMPTY_CUSTOMER,
      ...Object.fromEntries(Object.keys(EMPTY_CUSTOMER).map((k) => [k, customer[k] ?? EMPTY_CUSTOMER[k]])),
      phone: formatPhone(customer.phone),
      vat_mode: customer.vat_mode ?? '',
      price_list_id: customer.price_list_id ? String(customer.price_list_id) : '',
      active: Boolean(customer.active),
    } : EMPTY_CUSTOMER);
  }, [open, customer, reset]);

  async function save(e) {
    e?.preventDefault();
    try {
      const saved = await form.submit((v) => api(customer ? `/api/customers/${customer.id}` : '/api/customers', {
        method: customer ? 'PATCH' : 'POST',
        body: { ...v, vat_mode: v.vat_mode || null, price_list_id: v.price_list_id ? Number(v.price_list_id) : null },
      }));
      onSaved(saved);
    } catch { /* errors are shown in the form */ }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={customer ? 'Redigera kund' : 'Ny kund'}
      description={customer ? null : 'Organisationsnumret används för att hitta kunden när beställningar kommer in.'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button onClick={save} loading={form.busy}>{customer ? 'Spara' : 'Lägg till kund'}</Button>
        </>
      )}
    >
      <form onSubmit={save} className="form-grid">
        <TextField className="span-2" label="Namn" required {...form.field('name')} />
        <TextField label="Organisationsnummer" placeholder="556677-8899" {...form.field('org_nr')} />
        <SelectField
          label="Moms"
          options={[['', 'Företagets standard'], ...Object.entries(VAT_MODES)]}
          hint="Omvänd byggmoms gäller vissa byggtjänster. Stäm av med er redovisningskonsult."
          {...form.field('vat_mode')}
        />
        <SelectField className="span-2" label="Prislista" options={priceLists} hint="Projekt kan ha en egen prislista som går före kundens." {...form.field('price_list_id')} />
        <TextField className="span-2" label="Adress" {...form.field('address')} />
        <TextField label="Postnummer" inputMode="numeric" {...form.field('postnr')} />
        <TextField label="Ort" {...form.field('ort')} />
        <TextField label="E-post (faktura)" type="email" {...form.field('email')} />
        <TextField label="Telefon" type="tel" {...form.field('phone')} />
        {customer && <Checkbox label="Aktiv kund" checked={form.values.active} onChange={form.field('active').onChange} />}
        {form.formError && <div className="notice notice-red span-2">{form.formError}</div>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

const EMPTY_PROJECT = {
  name: '', customer_ref: '', address: '', postnr: '', ort: '', miljozon: '0', kontaktperson: '', telefon: '', price_list_id: '', active: true,
};

/** Create or edit a project for a customer. */
export function ProjectDialog({ open, customerId, project, onClose, onSaved }) {
  const form = useForm(EMPTY_PROJECT);
  const { reset } = form;
  const priceLists = usePriceListOptions(open, 'Kundens prislista');

  useEffect(() => {
    if (!open) return;
    reset(project ? {
      ...Object.fromEntries(Object.keys(EMPTY_PROJECT).map((k) => [k, project[k] ?? EMPTY_PROJECT[k]])),
      miljozon: String(project.miljozon),
      telefon: formatPhone(project.telefon),
      price_list_id: project.price_list_id ? String(project.price_list_id) : '',
      active: Boolean(project.active),
    } : EMPTY_PROJECT);
  }, [open, project, reset]);

  async function save(e) {
    e?.preventDefault();
    try {
      const saved = await form.submit((v) => api(project ? `/api/projects/${project.id}` : '/api/projects', {
        method: project ? 'PATCH' : 'POST',
        body: { ...v, miljozon: Number(v.miljozon), price_list_id: v.price_list_id ? Number(v.price_list_id) : null, ...(project ? {} : { customer_id: customerId }) },
      }));
      onSaved(saved);
    } catch { /* errors are shown in the form */ }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={project ? 'Redigera projekt' : 'Nytt projekt'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Avbryt</Button>
          <Button onClick={save} loading={form.busy}>{project ? 'Spara' : 'Lägg till projekt'}</Button>
        </>
      )}
    >
      <form onSubmit={save} className="form-grid">
        <TextField className="span-2" label="Projekt / arbetsplats" required placeholder="Kv. Rörstrand – schakt" {...form.field('name')} />
        <TextField label="Kundens referens" hint="Visas som ”Er referens” på fakturan." {...form.field('customer_ref')} />
        <SelectField
          label="Miljözon"
          options={Object.entries(ZONE_CLASSES)}
          hint="Fordon som inte uppfyller zonen ger en varning vid tilldelning."
          {...form.field('miljozon')}
        />
        <TextField className="span-2" label="Adress" {...form.field('address')} />
        <TextField label="Postnummer" inputMode="numeric" {...form.field('postnr')} />
        <TextField label="Ort" {...form.field('ort')} />
        <TextField label="Kontaktperson" {...form.field('kontaktperson')} />
        <TextField label="Telefon" type="tel" {...form.field('telefon')} />
        <SelectField className="span-2" label="Prislista" options={priceLists} hint="Ett avtalspris för just det här projektet." {...form.field('price_list_id')} />
        {project && <Checkbox label="Aktivt projekt" checked={form.values.active} onChange={form.field('active').onChange} />}
        {form.formError && <div className="notice notice-red span-2">{form.formError}</div>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
