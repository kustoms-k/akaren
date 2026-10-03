import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { TextField, SelectField, Checkbox } from '../components/Field.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { useToast } from '../lib/toast.js';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useForm } from '../lib/useForm.js';
import { VEHICLE_TYPES, VEHICLE_ZONE_CLASSES, formatPhone } from '../lib/labels.js';

const EMPTY_VEHICLE = { regnr: '', typ: 'tippbil', miljozonsklass: '1', active: true };
const EMPTY_DRIVER = { name: '', phone: '', active: true };

function VehicleDialog({ open, vehicle, onClose, onSaved }) {
  const form = useForm(EMPTY_VEHICLE);
  const { reset } = form;
  useEffect(() => {
    if (open) reset(vehicle ? { regnr: vehicle.regnr, typ: vehicle.typ, miljozonsklass: String(vehicle.miljozonsklass), active: Boolean(vehicle.active) } : EMPTY_VEHICLE);
  }, [open, vehicle, reset]);

  async function save(e) {
    e?.preventDefault();
    try {
      onSaved(await form.submit((v) => api(vehicle ? `/api/vehicles/${vehicle.id}` : '/api/vehicles', {
        method: vehicle ? 'PATCH' : 'POST',
        body: { ...v, miljozonsklass: Number(v.miljozonsklass) },
      })));
    } catch { /* shown in form */ }
  }

  return (
    <Dialog open={open} onClose={onClose} title={vehicle ? `Redigera ${vehicle.regnr}` : 'Nytt fordon'}
      footer={<><Button variant="secondary" onClick={onClose}>Avbryt</Button><Button onClick={save} loading={form.busy}>Spara</Button></>}>
      <form onSubmit={save} className="form-grid">
        <TextField label="Registreringsnummer" required placeholder="ABC123" autoCapitalize="characters" {...form.field('regnr')} />
        <SelectField label="Typ" options={Object.entries(VEHICLE_TYPES)} {...form.field('typ')} />
        <SelectField
          className="span-2"
          label="Miljözonsklass som fordonet uppfyller"
          options={Object.entries(VEHICLE_ZONE_CLASSES)}
          hint="Jämförs med projektets miljözon när fordonet tilldelas ett uppdrag."
          {...form.field('miljozonsklass')}
        />
        {vehicle && <Checkbox label="I trafik" checked={form.values.active} onChange={form.field('active').onChange} />}
        {form.formError && <div className="notice notice-red span-2">{form.formError}</div>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function DriverDialog({ open, driver, onClose, onSaved }) {
  const form = useForm(EMPTY_DRIVER);
  const { reset } = form;
  useEffect(() => {
    if (open) reset(driver ? { name: driver.name, phone: formatPhone(driver.phone), active: Boolean(driver.active) } : EMPTY_DRIVER);
  }, [open, driver, reset]);

  async function save(e) {
    e?.preventDefault();
    try {
      onSaved(await form.submit((v) => api(driver ? `/api/drivers/${driver.id}` : '/api/drivers', {
        method: driver ? 'PATCH' : 'POST',
        body: v,
      })));
    } catch { /* shown in form */ }
  }

  return (
    <Dialog open={open} onClose={onClose} title={driver ? 'Redigera förare' : 'Ny förare'}
      description="Föraren får uppdrag via SMS med en personlig länk. Inget konto behövs."
      footer={<><Button variant="secondary" onClick={onClose}>Avbryt</Button><Button onClick={save} loading={form.busy}>Spara</Button></>}>
      <form onSubmit={save} className="form-grid">
        <TextField className="span-2" label="Namn" required {...form.field('name')} />
        <TextField className="span-2" label="Mobilnummer" type="tel" required placeholder="070-123 45 67" {...form.field('phone')} />
        {driver && <Checkbox label="Aktiv" checked={form.values.active} onChange={form.field('active').onChange} />}
        {form.formError && <div className="notice notice-red span-2">{form.formError}</div>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function Fleet() {
  const toast = useToast();
  const vehicles = useApi('/api/vehicles?all=1');
  const drivers = useApi('/api/drivers?all=1');
  const [vehicleDialog, setVehicleDialog] = useState(null);
  const [driverDialog, setDriverDialog] = useState(null);

  return (
    <>
      <PageHeader title="Fordon & förare" description="Regnr, typ och miljözonsklass. Förare med mobilnummer för SMS-länkar." />
      <ErrorNotice error={vehicles.error ?? drivers.error} onRetry={() => { vehicles.reload(); drivers.reload(); }} />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-head">
            <h2 className="t-heading">Fordon</h2>
            <Button size="sm" onClick={() => setVehicleDialog({ vehicle: null })}><Plus size={14} /> Nytt fordon</Button>
          </div>
          {vehicles.loading && !vehicles.data ? <TableSkeleton /> : vehicles.data?.length === 0 ? (
            <div className="empty">Inga fordon än.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Regnr</th><th>Typ</th><th>Miljözon</th></tr></thead>
              <tbody>
                {vehicles.data?.map((v) => (
                  <tr key={v.id} className={`clickable${v.active ? '' : ' inactive'}`} tabIndex={0}
                    onClick={() => setVehicleDialog({ vehicle: v })}
                    onKeyDown={(e) => { if (e.key === 'Enter') setVehicleDialog({ vehicle: v }); }}>
                    <td className="num" style={{ fontWeight: 600 }}>{v.regnr}{!v.active && <span className="badge badge-muted" style={{ marginLeft: 8 }}>Ur trafik</span>}</td>
                    <td>{VEHICLE_TYPES[v.typ]}</td>
                    <td>{v.miljozonsklass > 0 ? VEHICLE_ZONE_CLASSES[v.miljozonsklass] : <span className="badge badge-amber">Uppfyller ingen</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="t-heading">Förare</h2>
            <Button size="sm" onClick={() => setDriverDialog({ driver: null })}><Plus size={14} /> Ny förare</Button>
          </div>
          {drivers.loading && !drivers.data ? <TableSkeleton /> : drivers.data?.length === 0 ? (
            <div className="empty">Inga förare än.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Namn</th><th>Mobil</th></tr></thead>
              <tbody>
                {drivers.data?.map((d) => (
                  <tr key={d.id} className={`clickable${d.active ? '' : ' inactive'}`} tabIndex={0}
                    onClick={() => setDriverDialog({ driver: d })}
                    onKeyDown={(e) => { if (e.key === 'Enter') setDriverDialog({ driver: d }); }}>
                    <td style={{ fontWeight: 550 }}>{d.name}{!d.active && <span className="badge badge-muted" style={{ marginLeft: 8 }}>Inaktiv</span>}</td>
                    <td className="num">{formatPhone(d.phone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <VehicleDialog
        open={Boolean(vehicleDialog)}
        vehicle={vehicleDialog?.vehicle ?? null}
        onClose={() => setVehicleDialog(null)}
        onSaved={(v) => { setVehicleDialog(null); toast(`${v.regnr} är sparat`); vehicles.reload(); }}
      />
      <DriverDialog
        open={Boolean(driverDialog)}
        driver={driverDialog?.driver ?? null}
        onClose={() => setDriverDialog(null)}
        onSaved={(d) => { setDriverDialog(null); toast(`${d.name} är sparad`); drivers.reload(); }}
      />
    </>
  );
}
