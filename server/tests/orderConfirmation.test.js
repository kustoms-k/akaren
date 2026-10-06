import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { createMailService } from '../services/mail.js';
import { buildOrderConfirmation, longDateSv, shortDateSv } from '../lib/orderConfirmation.js';
import { postProcessOrder } from '../lib/orderExtraction.js';
import { TEST_ENV, testApp, testConfig, silentLogger } from './helpers.js';
import { orderOutput, mf } from './fixtures.js';

const COMPANY = {
  name: 'Lagerviks Åkeri AB', org_nr: '559000-0013', address: 'Lagervägen 7', postnr: '13650', ort: 'Haninge',
  phone: '+46846500400', email: 'kontor@lagerviksakeri.se', order_terms: 'Uppdraget utförs enligt Alltrans 2007.\nAvbokning senast kl 15.00 dagen före.',
};

const JOB = {
  id: 42, uppdragstyp: 'schakt', material: 'Schaktmassor (lera/morän)', uppskattad_mangd: null, mangd_enhet: null,
  antal_lass: 12, datum_fran: '2026-10-06', datum_till: null, tid: '07:00',
  fran_text: 'Kv. Rörstrand, Rörstrandsgatan 40', till_text: 'Ekbacka massmottagning, Upplands Väsby',
  instruktioner: 'Infart via Birkagatan.\nRing Petra vid ankomst.', kontaktperson: 'Petra Holm', telefon: '+46701740610',
  customer_name: 'Norrbacka Mark & Anläggning AB', customer_org_nr: '559101-2348', customer_ref: 'NMA-2611',
  project_name: 'Kv. Rörstrand – schakt', project_address: 'Rörstrandsgatan 40', project_postnr: '11340', project_ort: 'Stockholm',
};

describe('buildOrderConfirmation', () => {
  it('formats Swedish dates', () => {
    expect(longDateSv('2026-10-06')).toBe('tisdag 6 oktober 2026');
    expect(shortDateSv('2026-10-06')).toBe('tis 6 okt');
  });

  it('builds subject, text and html with every job detail the customer needs', () => {
    const { subject, text, html } = buildOrderConfirmation({ job: JOB, company: COMPANY });
    expect(subject).toBe('Orderbekräftelse: Kv. Rörstrand – schakt, tis 6 okt kl 07:00, er ref NMA-2611');

    expect(text).toMatch(/^Hej Petra!/);
    for (const s of [
      'UPPDRAG 42', 'NMA-2611', 'Schakt – bortforsling av massor', 'tisdag 6 oktober 2026', 'kl 07:00',
      'Schaktmassor (lera/morän)', 'Antal lass:', 'Ekbacka massmottagning', 'Rörstrandsgatan 40, 113 40 Stockholm',
      'Petra Holm, 070-174 06 10', 'Norrbacka Mark & Anläggning AB, org.nr 559101-2348',
      'ring oss på 08-465 004 00', 'helst före tis 6 okt', 'VILLKOR', 'Alltrans 2007', 'Org.nr 559000-0013',
    ]) expect(text).toContain(s);
    expect(text).not.toContain('Uppskattad mängd'); // empty rows are left out
    expect(text).not.toContain('FÖRORENADE');
    expect(text).toContain('Infart via Birkagatan.\n'); // multi-line values stay readable

    expect(html).toContain('<html lang="sv">');
    expect(html).toContain('Norrbacka Mark &amp; Anläggning AB');
    expect(html).toContain('Infart via Birkagatan.<br>Ring Petra');
    expect(html).toContain('<span style="white-space:nowrap;">559101-2348</span>');
    expect(html).toContain('<span style="white-space:nowrap;">070-174 06 10</span>');
    expect(html).not.toMatch(/<img|<script/);
  });

  it('describes a multi-day job and a quantity', () => {
    const job = { ...JOB, uppdragstyp: 'grus_leverans', datum_till: '2026-10-07', uppskattad_mangd: 1240, mangd_enhet: 'ton', antal_lass: null, tid: null, customer_ref: null };
    const { subject, text } = buildOrderConfirmation({ job, company: COMPANY });
    expect(subject).toBe('Orderbekräftelse: Kv. Rörstrand – schakt, tis 6 okt');
    expect(text).toContain('tisdag 6 – onsdag 7 oktober 2026');
    expect(text).toMatch(/ca 1\s240 ton/);
    expect(text).not.toContain('Starttid');
  });

  it('asks for waste details when the masses may be hazardous', () => {
    const { text, html } = buildOrderConfirmation({ job: { ...JOB, material: 'Förorenade massor (MKM)' }, company: COMPANY });
    expect(text).toContain('FÖRORENADE MASSOR');
    expect(text).toContain('Naturvårdsverkets avfallsregister');
    expect(html).toContain('Förorenade massor');
  });

  it('escapes everything that came from an order or a user', () => {
    const evil = '<script>alert(1)</script>';
    const { html } = buildOrderConfirmation({
      job: { ...JOB, customer_name: evil, instruktioner: `"><img src=x onerror=alert(1)>`, project_name: evil },
      company: { ...COMPANY, order_terms: evil },
      message: evil,
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('greets without a name and leaves out terms and phone when not set', () => {
    const { text } = buildOrderConfirmation({ job: { ...JOB, kontaktperson: null, telefon: null }, company: { ...COMPANY, phone: null, order_terms: null } });
    expect(text).toMatch(/^Hej!/);
    expect(text).not.toContain('VILLKOR');
    expect(text).not.toContain('ring oss');
    expect(text).not.toContain('Kontakt på plats');
  });

  it('puts the personal message right after the intro', () => {
    const { text } = buildOrderConfirmation({ job: JOB, company: COMPANY, message: '  Vi kommer med två bilar.  ' });
    expect(text.indexOf('Vi kommer med två bilar.')).toBeGreaterThan(text.indexOf('Tack för beställningen'));
    expect(text.indexOf('Vi kommer med två bilar.')).toBeLessThan(text.indexOf('UPPDRAG 42'));
  });
});

describe('mail config', () => {
  it('is simulated without host and sender, and uses TLS on 465', () => {
    expect(loadConfig(TEST_ENV).mail.enabled).toBe(false);
    expect(loadConfig({ ...TEST_ENV, SMTP_HOST: 'smtp.example.se' }).mail.enabled).toBe(false);
    const c = loadConfig({ ...TEST_ENV, SMTP_HOST: 'smtp.example.se', SMTP_PORT: '465', MAIL_FROM: 'kontor@example.se' });
    expect(c.mail).toMatchObject({ enabled: true, secure: true, port: 465, from: 'kontor@example.se' });
    expect(loadConfig({ ...TEST_ENV, SMTP_HOST: 'smtp.example.se', MAIL_FROM: 'kontor@example.se' }).mail.secure).toBe(false);
    expect(() => loadConfig({ ...TEST_ENV, MAIL_FROM: 'inte en adress' })).toThrow(/MAIL_FROM/);
  });
});

describe('mail service', () => {
  const msg = { fromName: 'Lagerviks Åkeri AB', to: 'petra@example.se', subject: 'Ämne', text: 'Hej', html: '<p>Hej</p>' };

  it('simulates and logs without SMTP settings', async () => {
    const logged = [];
    const mail = createMailService({ config: testConfig(), logger: { ...silentLogger, log: (s) => logged.push(s) } });
    expect(mail.enabled).toBe(false);
    expect(await mail.send(msg)).toEqual({ status: 'simulerat' });
    expect(logged.join('')).toContain('petra@example.se');
  });

  it('sends through the transport with the company name as sender', async () => {
    const calls = [];
    const transport = { sendMail: async (m) => { calls.push(m); return { messageId: '<1@test>' }; } };
    const mail = createMailService({ config: testConfig({ MAIL_FROM: 'kontor@example.se' }), transport, logger: silentLogger });
    const r = await mail.send({ ...msg, replyTo: 'kontor@example.se', bcc: 'kopia@example.se' });
    expect(r).toEqual({ status: 'skickat', messageId: '<1@test>' });
    expect(calls[0]).toMatchObject({ from: { name: 'Lagerviks Åkeri AB', address: 'kontor@example.se' }, to: 'petra@example.se', replyTo: 'kontor@example.se', bcc: 'kopia@example.se' });
    expect(calls[0]).not.toHaveProperty('cc');
  });

  it('never throws and maps failures to a code', async () => {
    const failing = (err) => createMailService({
      config: testConfig({ MAIL_FROM: 'kontor@example.se' }), logger: silentLogger,
      transport: { sendMail: async () => { throw err; } },
    });
    expect(await failing(Object.assign(new Error('x'), { code: 'EAUTH' })).send(msg)).toEqual({ status: 'misslyckat', error: 'auth' });
    expect((await failing(Object.assign(new Error('x'), { code: 'ETIMEDOUT' })).send(msg)).error).toBe('connection');
    expect((await failing(Object.assign(new Error('x'), { responseCode: 550 })).send(msg)).error).toBe('rejected');
    expect((await failing(new Error('x')).send(msg)).error).toBe('other');
  });
});

describe('epost extraction', () => {
  it('lowercases a valid address and flags an invalid one', () => {
    const ok = postProcessOrder(orderOutput({ epost: mf(' Petra.Holm@Norrbacka-Mark.se ') }), { today: '2026-10-03' });
    expect(ok.fields.epost).toEqual({ value: 'petra.holm@norrbacka-mark.se', confidence: 'hog' });
    const bad = postProcessOrder(orderOutput({ epost: mf('petra.holm(at)norrbacka') }), { today: '2026-10-03' });
    expect(bad.fields.epost.confidence).toBe('lag');
    expect(bad.warnings).toContain('E-postadressen ser felaktig ut.');
  });
});

describe('order confirmation API', () => {
  async function setup({ fail } = {}) {
    const calls = [];
    const transport = {
      sendMail: async (m) => {
        if (fail) throw Object.assign(new Error('auth failed'), { code: 'EAUTH' });
        calls.push(m);
        return { messageId: `<${calls.length}@test>` };
      },
    };
    const configOverrides = { MAIL_FROM: 'kontor@lagerviksakeri.se' };
    const mail = createMailService({ config: testConfig(configOverrides), transport, logger: silentLogger });
    const t = await testApp({ services: { mail }, configOverrides });
    await t.as('patch', '/api/settings').send({ email: 'kontor@lagerviksakeri.se', phone: '08-465 004 00', order_terms: 'Alltrans 2007.' }).expect(200);
    const customer = (await t.as('post', '/api/customers').send({ name: 'Norrbacka Mark & Anläggning AB', org_nr: '559101-2348' })).body;
    const project = (await t.as('post', '/api/projects').send({ customer_id: customer.id, name: 'Kv. Rörstrand – schakt', customer_ref: 'NMA-2611', miljozon: 0 })).body;

    async function createJob(fields = {}) {
      const intake = (await t.as('post', '/api/intake/manual').send({ text: '' }).expect(201)).body;
      const res = await t.as('post', `/api/intake/${intake.id}/confirm`).send({
        fields: { uppdragstyp: 'schakt', datum: '2026-10-06', tid: '07:00', kontaktperson: 'Petra Holm', ...fields },
        customer: { id: customer.id }, project: { id: project.id },
      });
      return res;
    }
    return { ...t, calls, createJob };
  }

  it('stores the contact email on the job and sends the confirmation with office copy and reply-to', async () => {
    const { as, db, calls, createJob } = await setup();
    const { job_id } = (await createJob({ epost: 'petra.holm@norrbacka.example' }).then((r) => r.body));

    const info = (await as('get', `/api/jobs/${job_id}/order-confirmation`).expect(200)).body;
    expect(info).toMatchObject({ default_to: 'petra.holm@norrbacka.example', office_email: 'kontor@lagerviksakeri.se', mail_enabled: true, can_send: true, history: [] });

    const preview = (await as('post', `/api/jobs/${job_id}/order-confirmation/preview`).send({ message: 'Två bilar.' }).expect(200)).body;
    expect(preview.subject).toContain('er ref NMA-2611');
    expect(preview.html).toContain('Två bilar.');
    expect(calls).toHaveLength(0); // preview never sends

    const sent = (await as('post', `/api/jobs/${job_id}/order-confirmation`)
      .send({ to: 'petra.holm@norrbacka.example', cc: 'plats@norrbacka.example', message: 'Två bilar.' }).expect(201)).body;
    expect(sent).toMatchObject({ status: 'skickat', to_email: 'petra.holm@norrbacka.example', bcc_email: 'kontor@lagerviksakeri.se', error_message: null });
    expect(calls[0]).toMatchObject({
      from: { name: 'Test AB', address: 'kontor@lagerviksakeri.se' }, to: 'petra.holm@norrbacka.example',
      cc: 'plats@norrbacka.example', bcc: 'kontor@lagerviksakeri.se', replyTo: 'kontor@lagerviksakeri.se',
    });
    expect(calls[0].text).toContain('Två bilar.');
    expect(calls[0].text).toContain('Alltrans 2007.');

    const history = (await as('get', `/api/jobs/${job_id}/order-confirmation`).expect(200)).body.history;
    expect(history).toHaveLength(1);
    const stored = (await as('get', `/api/jobs/${job_id}/order-confirmation/${history[0].id}`).expect(200)).body;
    expect(stored.body_html).toBe(calls[0].html);

    const audit = db.prepare(`SELECT after_json FROM audit_log WHERE entity = 'job' AND action = 'order_confirmation'`).get();
    expect(JSON.parse(audit.after_json)).toMatchObject({ to: 'petra.holm@norrbacka.example', status: 'skickat' });
  });

  it('suggests the last recipient for the same project when the order had no email', async () => {
    const { as, createJob } = await setup();
    const first = (await createJob({ epost: 'petra.holm@norrbacka.example' })).body.job_id;
    await as('post', `/api/jobs/${first}/order-confirmation`).send({ to: 'petra.holm@norrbacka.example', office_copy: false }).expect(201);
    const second = (await createJob()).body.job_id;
    expect((await as('get', `/api/jobs/${second}/order-confirmation`)).body.default_to).toBe('petra.holm@norrbacka.example');
  });

  it('does not copy the office when it is the recipient or when unticked', async () => {
    const { as, calls, createJob } = await setup();
    const { job_id } = (await createJob()).body;
    await as('post', `/api/jobs/${job_id}/order-confirmation`).send({ to: 'KONTOR@lagerviksakeri.se' }).expect(201);
    await as('post', `/api/jobs/${job_id}/order-confirmation`).send({ to: 'petra@norrbacka.example', office_copy: false }).expect(201);
    expect(calls.map((c) => c.bcc)).toEqual([undefined, undefined]);
  });

  it('records a failed send with a Swedish message and keeps the job', async () => {
    const { as, createJob } = await setup({ fail: true });
    const { job_id } = (await createJob()).body;
    const sent = (await as('post', `/api/jobs/${job_id}/order-confirmation`).send({ to: 'petra@norrbacka.example' }).expect(201)).body;
    expect(sent.status).toBe('misslyckat');
    expect(sent.error_message).toMatch(/inloggningen/);
    expect((await as('get', `/api/jobs/${job_id}`)).status).toBe(200);
  });

  it('validates the recipient and refuses cancelled jobs', async () => {
    const { as, createJob } = await setup();
    const bad = await createJob({ epost: 'inte-en-adress' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields['fields.epost']).toBe('Ogiltig e-postadress.');

    const { job_id } = (await createJob()).body;
    const res = await as('post', `/api/jobs/${job_id}/order-confirmation`).send({ to: 'nope' }).expect(400);
    expect(res.body.error.fields.to).toBe('Ange en giltig e-postadress.');

    await as('post', `/api/jobs/${job_id}/cancel`).expect(200);
    expect((await as('get', `/api/jobs/${job_id}/order-confirmation`)).body.can_send).toBe(false);
    const cancelled = await as('post', `/api/jobs/${job_id}/order-confirmation`).send({ to: 'petra@norrbacka.example' }).expect(409);
    expect(cancelled.body.error.code).toBe('cancelled');
  });

  it('is simulated and stored when SMTP is not configured', async () => {
    const { as, db } = await testApp();
    await as('patch', '/api/settings').send({ email: 'kontor@lagerviksakeri.se' });
    const customer = (await as('post', '/api/customers').send({ name: 'Kund AB' })).body;
    const project = (await as('post', '/api/projects').send({ customer_id: customer.id, name: 'Projekt', miljozon: 0 })).body;
    const intake = (await as('post', '/api/intake/manual').send({ text: '' })).body;
    const { job_id } = (await as('post', `/api/intake/${intake.id}/confirm`).send({
      fields: { uppdragstyp: 'schakt', datum: '2026-10-06' }, customer: { id: customer.id }, project: { id: project.id },
    }).expect(201)).body;
    const sent = (await as('post', `/api/jobs/${job_id}/order-confirmation`).send({ to: 'kund@example.se' }).expect(201)).body;
    expect(sent.status).toBe('simulerat');
    expect(db.prepare('SELECT status FROM order_confirmations').pluck().get()).toBe('simulerat');
  });
});
