import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { addCompanyWithUser, testConfig, testDb, silentLogger } from './helpers.js';
import { createApp } from '../app.js';
import { seedDemo } from '../seed/demo.js';
import { stockholmDate } from '../lib/dates.js';
import {
  buildReply, quoteOriginal, relevantDetails, replyHtml, replySubject, suggestQuestions,
} from '../lib/replyTemplates.js';
import { demoInboxEmails } from '../lib/inboxDemo.js';

const company = { name: 'Lagerviks Åkeri AB', phone: '+46846500400', email: 'kontor@lagerviksakeri.se', order_terms: null };
const email = { subject: 'Container till Vallentuna onsdag?', from_name: 'Erik Sandberg', from_email: 'erik@sandbergsmarkab.se', received_at: '2026-10-05T08:14:00.000Z', body_text: 'Hej,\n\nKan ni ställa ut en container?\n\nErik' };
const f = (value, confidence = 'hog') => ({ value, confidence });

describe('reply templates', () => {
  it('prefixes SV: once', () => {
    expect(replySubject('Beställning')).toBe('SV: Beställning');
    expect(replySubject('SV: massor')).toBe('SV: massor');
    expect(replySubject('Re: Kranbil')).toBe('Re: Kranbil');
    expect(replySubject('')).toBe('SV: (inget ämne)');
  });

  it('offers another date in plain Swedish', () => {
    const r = buildReply('nytt_datum', { email, company, fields: { datum: f('2026-10-07', 'medel') } }, { datum: '2026-10-08', tid: '07:00' });
    expect(r.subject).toBe('SV: Container till Vallentuna onsdag?');
    expect(r.text).toMatch(/^Hej Erik!/);
    expect(r.text).toContain('Tyvärr har vi inte möjlighet på onsdag 7 oktober, men vi kan erbjuda torsdag 8 oktober kl 07.00.');
    expect(r.text).toContain('Telefon 08-465 004 00 · kontor@lagerviksakeri.se');
    expect(() => buildReply('nytt_datum', { email, company }, {})).toThrow();
  });

  it('asks only the chosen questions', () => {
    const r = buildReply('mer_info', { email, company }, { questions: ['adress', 'till', 'okänd'] });
    expect(r.text).toContain('• Vilken adress gäller?');
    expect(r.text).toContain('• Vart ska massorna köras?');
    expect(r.text.match(/^• /gm)).toHaveLength(2);
  });

  it('lists the change when confirming it', () => {
    const r = buildReply('bekrafta_andring', {
      email, company, job: { project_name: 'Arenastaden kv. Lagern' },
      change: [{ label: 'Datum', from: 'Torsdag 8 oktober', to: 'Fredag 9 oktober' }],
    });
    expect(r.text).toContain('Tack, vi har noterat ändringen för Arenastaden kv. Lagern:');
    expect(r.text).toContain('• Datum: Torsdag 8 oktober → Fredag 9 oktober');
  });

  it('declines with a reason and greets without a name when there is none', () => {
    const r = buildReply('tacka_nej', { email: { ...email, from_name: null }, company }, { reason: 'fordon' });
    expect(r.text).toMatch(/^Hej!/);
    expect(r.text).toContain('Tyvärr kan vi inte ta uppdraget eftersom vi inte har rätt fordon för det.');
  });

  it('builds the order confirmation for a job, and refuses without one', () => {
    const job = {
      id: 7, uppdragstyp: 'container', datum_fran: '2026-10-08', datum_till: null, tid: '07:00', material: 'Blandat rivningsavfall',
      project_name: 'Rivning Kullbyvägen', customer_name: 'Sandbergs Mark AB', kontaktperson: 'Erik Sandberg',
    };
    const r = buildReply('bekrafta', { email, company, job }, { message: 'Vi ställer den på uppfarten.' });
    expect(r.subject).toBe('SV: Container till Vallentuna onsdag?');
    expect(r.html).toContain('Vi ställer den på uppfarten.');
    expect(r.text).toContain('ORDERBEKRÄFTELSE – UPPDRAG 7');
    expect(() => buildReply('bekrafta', { email, company })).toThrow();
  });

  it('quotes the original and renders quotes as a block', () => {
    const quote = quoteOriginal(email);
    expect(quote).toMatch(/^Den 5 okt\. 2026 10:14 skrev Erik Sandberg <erik@sandbergsmarkab\.se>:/);
    expect(quote).toContain('> Kan ni ställa ut en container?');
    const html = replyHtml(`Hej <Erik> & co\n\n${quote}`);
    expect(html).toContain('Hej &lt;Erik&gt; &amp; co');
    expect(html).toContain('<blockquote');
    expect(html).not.toContain('<Erik>');
  });

  it('suggests the questions that fit the kind of job', () => {
    const vague = suggestQuestions({ uppdragstyp: f('schakt', 'medel'), material: f('Schaktmassor, kan innehålla asfalt', 'medel'), datum: f('2026-10-12', 'lag') });
    const picked = vague.filter((q) => q.selected).map((q) => q.key);
    expect(picked).toEqual(['adress', 'datum', 'tid', 'mangd', 'till', 'klassning', 'kontakt']);
    expect(vague.map((q) => q.key)).not.toContain('fran');

    const crane = suggestQuestions({ uppdragstyp: f('kran'), datum: f('2026-10-09'), tid: f('07:00'), adress: f('Evenemangsgatan 21'), telefon: f('+46701740613') });
    expect(crane.map((q) => q.key)).toEqual(['adress', 'datum', 'tid', 'kontakt']);
    expect(crane.some((q) => q.selected)).toBe(false);
    expect(relevantDetails('container')).toMatchObject({ mangd: false, till: false, fran: false });
  });
});

describe('demo mailbox content', () => {
  it('threads replies by Message-ID and keeps ids stable per anchor day', () => {
    const a = demoInboxEmails('2026-10-06');
    const b = demoInboxEmails('2026-10-08', '2026-10-06');
    const ids = new Set(a.map((e) => e.message_id));
    expect(ids.size).toBe(a.length);
    expect(a.map((e) => e.message_id)).toEqual(b.map((e) => e.message_id));
    const fix = a.find((e) => e.key === 'vallby-rattelse');
    expect(fix.in_reply_to).toBe(a.find((e) => e.key === 'vallby-ao').message_id);
    expect(a.filter((e) => e.pool).map((e) => e.pool)).toEqual([1, 2, 3]);
  });
});

describe('order inbox API', () => {
  let app;
  let db;
  let as;
  let sent;

  async function setup({ demoMode = '1', withInbox = true } = {}) {
    db = testDb();
    seedDemo(db, { today: stockholmDate(), password: 'hemligt123', withInbox });
    sent = [];
    const mail = {
      enabled: true, from: 'order@lagerviksakeri.se',
      send: async (msg) => { sent.push(msg); return { status: 'skickat', messageId: msg.messageId }; },
    };
    app = createApp({ config: testConfig({ DEMO_MODE: demoMode }), db, services: { mail }, logger: silentLogger });
    const login = await request(app).post('/api/auth/login').send({ email: 'kontor@lagerviksakeri.se', password: 'hemligt123' });
    as = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${login.body.token}`);
  }

  const threadBySubject = async (start, flik = 'order') => (await as('get', `/api/inbox?flik=${flik}`)).body.threads.find((t) => t.subject.startsWith(start));

  beforeEach(() => setup());

  it('sorts mail into order threads and the rest', async () => {
    const res = await as('get', '/api/inbox');
    expect(res.status).toBe(200);
    expect(res.body.account.address).toBe('order@lagerviksakeri.se');
    expect(res.body.counts).toMatchObject({ att_hantera: 7, order: 10, bortsorterat: 9 });
    expect(res.body.threads.every((t) => t.order && t.status === 'ny')).toBe(true);

    const filtered = (await as('get', '/api/inbox?flik=bortsorterat')).body.threads;
    expect(filtered).toHaveLength(9);
    expect(filtered.every((t) => !t.order && t.filter_reason)).toBe(true);

    const search = (await as('get', '/api/inbox?flik=order&q=vallentuna')).body.threads;
    expect(search.map((t) => t.subject)).toEqual(['Container till Vallentuna onsdag?']);
  });

  it('matches known customers and shows history from email to job', async () => {
    const kran = await threadBySubject('Kranbilen');
    expect(kran.customer.name).toBe('Ekhagens Fastighetsutveckling AB');
    expect(kran.job_id).toBeTruthy();

    const start = await threadBySubject('Bortforsling schaktmassor Kv. Rörstrand');
    const t = (await as('get', `/api/inbox/threads/${start.id}`)).body;
    expect(t.status).toBe('besvarad');
    expect(t.messages.map((m) => m.kind)).toEqual(['in', 'out']);
    expect(t.messages[1].template).toBe('bekrafta');
    expect(t.job.project_name).toBe('Kv. Rörstrand – schakt');
    const job = (await as('get', `/api/jobs/${t.job.id}`)).body;
    expect(job.source_email.thread_id).toBe(start.id);
    expect((await as('get', `/api/jobs/${t.job.id}/order-confirmation`)).body.history).toHaveLength(1);
  });

  it('reads a thread: AI reading, missing details, questions and templates', async () => {
    const hammarby = await threadBySubject('SV: massor');
    const t = (await as('get', `/api/inbox/threads/${hammarby.id}`)).body;
    expect(t.match).toBeNull();
    expect(t.extraction.fields.kund.confidence).toBe('lag');
    expect(t.extraction.missing).toEqual(['adress', 'till', 'telefon']);
    expect(t.templates.find((x) => x.key === 'bekrafta').disabled_reason).toMatch(/Skapa uppdraget först/);
    expect(t.questions.filter((q) => q.selected).map((q) => q.key)).toContain('klassning');

    const taby = await threadBySubject('Täby Park');
    expect(taby.flags).toEqual(['farligt_avfall']);
    const td = (await as('get', `/api/inbox/threads/${taby.id}`)).body;
    expect(td.match.project.name).toBe('Täby Park etapp 3 – VA-schakt');
    expect(td.messages[0].attachments[0]).toMatchObject({ filename: 'Provsvar_TPE3.pdf', has_text: true });
    const att = (await as('get', `/api/inbox/attachments/${td.messages[0].attachments[0].id}`)).body;
    expect(att.text_content).toContain('17 05 03*');
  });

  it('marks threads read and done, and reopens them', async () => {
    const t = await threadBySubject('Makadam');
    expect(t.unread).toBe(true);
    await as('post', `/api/inbox/threads/${t.id}/read`).expect(200);
    expect((await threadBySubject('Makadam')).unread).toBe(false);

    await as('post', `/api/inbox/threads/${t.id}/status`).send({ done: true }).expect(200);
    expect((await threadBySubject('Makadam')).status).toBe('klar');
    expect((await as('get', '/api/inbox/summary')).body.att_hantera).toBe(6);
    await as('post', `/api/inbox/threads/${t.id}/status`).send({ done: false }).expect(200);
    expect((await threadBySubject('Makadam')).status).toBe('ny');
  });

  it('lets the office correct the sorting', async () => {
    const preem = await threadBySubject('Faktura 4471882', 'bortsorterat');
    const t = (await as('get', `/api/inbox/threads/${preem.id}`)).body;
    await as('post', `/api/inbox/emails/${t.focus_id}/category`).send({ category: 'bestallning' }).expect(200);
    const moved = await threadBySubject('Faktura 4471882');
    expect(moved).toMatchObject({ order: true, status: 'ny', category: 'bestallning' });
    expect((await as('get', `/api/inbox/threads/${preem.id}`)).body.triage.source).toBe('kontoret');
    await as('post', `/api/inbox/emails/${t.focus_id}/category`).send({ category: 'spam' }).expect(400);
  });

  it('turns an email into a reviewed job and confirms it in the same thread', async () => {
    const erik = await threadBySubject('Container till Vallentuna');
    const t = (await as('get', `/api/inbox/threads/${erik.id}`)).body;
    expect(t.messages.map((m) => m.kind)).toEqual(['in', 'out', 'in']);
    expect(t.triage.category).toBe('svar');

    const { intake_id: intakeId } = (await as('post', `/api/inbox/emails/${t.source_id}/intake`).expect(201)).body;
    // Asking again returns the same draft.
    expect((await as('post', `/api/inbox/emails/${t.source_id}/intake`).expect(200)).body.intake_id).toBe(intakeId);
    const intake = (await as('get', `/api/intake/${intakeId}`)).body;
    expect(intake.email.thread_id).toBe(erik.id);
    expect(intake.raw_text).toContain('Tidigare i tråden');
    expect(intake.fields.datum.confidence).toBe('hog');

    const f = intake.fields;
    const confirmed = await as('post', `/api/intake/${intakeId}/confirm`).send({
      fields: {
        uppdragstyp: f.uppdragstyp.value, datum: f.datum.value, datum_till: f.datum_till.value, tid: f.tid.value,
        material: f.material.value, fran: f.fran.value, kontaktperson: f.kontaktperson.value, telefon: f.telefon.value, epost: f.epost.value,
      },
      customer: { new: { name: 'Sandbergs Mark AB' } },
      project: { new: { name: 'Rivning Kullbyvägen', address: 'Kullbyvägen 12', ort: 'Vallentuna' } },
    }).expect(201);

    const after = (await as('get', `/api/inbox/threads/${erik.id}`)).body;
    expect(after.job.id).toBe(confirmed.body.job_id);
    expect(after.templates.find((x) => x.key === 'bekrafta').disabled_reason).toBeNull();
    await as('post', `/api/inbox/emails/${t.source_id}/intake`).expect(409);

    const preview = (await as('post', `/api/inbox/emails/${after.reply_to}/reply/preview`).send({ template: 'bekrafta', params: { message: 'Vi ställer den på uppfarten.' } })).body;
    expect(preview.html).toContain('Vi ställer den på uppfarten.');
    const reply = await as('post', `/api/inbox/emails/${after.reply_to}/reply`).send({
      template: 'bekrafta', params: { message: 'Vi ställer den på uppfarten.' }, to: erik.from_email, subject: preview.subject,
    }).expect(201);
    expect(reply.body.status).toBe('skickat');

    // Threaded with the customer's mail, from the order mailbox, and recorded as the job's confirmation.
    expect(sent).toHaveLength(1);
    const msg = sent[0];
    expect(msg.replyTo).toBe('order@lagerviksakeri.se');
    expect(msg.inReplyTo).toBe(demoInboxEmails(stockholmDate()).find((e) => e.key === 'erik-svar').message_id);
    expect(msg.references).toHaveLength(3);
    expect(msg.messageId).toMatch(/^<[0-9a-f-]+@lagerviksakeri\.se>$/);
    const final = (await as('get', `/api/inbox/threads/${erik.id}`)).body;
    expect(final.status).toBe('besvarad');
    expect(final.messages.at(-1)).toMatchObject({ kind: 'out', template: 'bekrafta', status: 'skickat' });
    const history = (await as('get', `/api/jobs/${confirmed.body.job_id}/order-confirmation`)).body.history;
    expect(history).toHaveLength(1);
  });

  it('sends an edited reply with the original quoted, and validates it', async () => {
    const hammarby = await threadBySubject('SV: massor');
    const t = (await as('get', `/api/inbox/threads/${hammarby.id}`)).body;
    const body = { template: 'mer_info', params: { questions: ['adress'] }, to: 'jonas.m@hammarbybyggtjanst.se', subject: 'SV: massor' };
    await as('post', `/api/inbox/emails/${t.reply_to}/reply`).send(body).expect(400);
    await as('post', `/api/inbox/emails/${t.reply_to}/reply`).send({ ...body, to: 'inte-en-adress', text: 'Hej' }).expect(400);
    await as('post', `/api/inbox/emails/${t.reply_to}/reply`).send({ ...body, text: 'Hej Jonas!\n\nVilken adress?' }).expect(201);
    expect(sent[0].text).toMatch(/^Hej Jonas!\n\nVilken adress\?\n\nDen .+ skrev jonas\.m@hammarbybyggtjanst\.se:\n> Hej igen,/);
    expect(sent[0].html).toContain('<blockquote');
    expect((await threadBySubject('SV: massor')).status).toBe('besvarad');
    await as('post', `/api/inbox/emails/${t.reply_to}/reply`).send({ ...body, template: 'nytt_datum', params: {}, text: 'x' }).expect(400);
    await as('post', `/api/inbox/emails/${t.reply_to}/reply`).send({ ...body, template: 'bekrafta', text: 'x' }).expect(409);
  });

  it('fetches held-back demo mail one at a time, threading the correction', async () => {
    const first = (await as('post', '/api/inbox/sync').expect(200)).body.delivered;
    expect(first).toMatchObject({ category: 'bestallning', subject: 'Två extra bilar fredag – Kv. Rörstrand' });
    expect((await as('post', '/api/inbox/sync')).body.delivered.category).toBe('ovrigt');
    const third = (await as('post', '/api/inbox/sync')).body.delivered;
    const vallby = await threadBySubject('Arbetsorder AO-2026-0412');
    expect(third.thread_id).toBe(vallby.id);
    expect(vallby.category).toBe('andring');
    expect((await as('post', '/api/inbox/sync')).body.delivered).toBeNull();
  });

  it('only fetches demo mail in demo mode', async () => {
    await setup({ demoMode: '0' });
    expect((await as('post', '/api/inbox/sync')).status).toBe(409);
    expect((await as('post', '/api/inbox/demo')).status).toBe(404);
  });

  it('can add the demo mailbox to a database without one', async () => {
    await setup({ withInbox: false });
    expect((await as('get', '/api/inbox')).body).toMatchObject({ account: null, demo_available: true });
    expect((await as('get', '/api/inbox/summary')).body.connected).toBe(false);
    const r = await as('post', '/api/inbox/demo').expect(201);
    expect(r.body).toMatchObject({ emails: 20, replies: 4, pool: 3 });
    expect((await as('get', '/api/inbox')).body.counts.order).toBe(10);
    await as('post', '/api/inbox/demo').expect(409);
  });

  it('keeps every company to its own mailbox', async () => {
    const other = addCompanyWithUser(db, { email: 'kontor@annat.se', name: 'Annat Åkeri AB' });
    const login = await request(app).post('/api/auth/login').send({ email: other.email, password: other.password });
    const them = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${login.body.token}`);
    const mine = await threadBySubject('Makadam');
    const t = (await as('get', `/api/inbox/threads/${mine.id}`)).body;

    expect((await them('get', '/api/inbox')).body.account).toBeNull();
    expect((await them('get', `/api/inbox/threads/${mine.id}`)).status).toBe(409);
    expect((await them('post', `/api/inbox/emails/${t.focus_id}/intake`)).status).toBe(404);
    expect((await them('post', `/api/inbox/emails/${t.focus_id}/category`).send({ category: 'ovrigt' })).status).toBe(404);
    expect((await them('get', `/api/inbox/attachments/1`)).status).toBe(404);
    expect((await them('post', `/api/inbox/threads/${mine.id}/read`)).body.updated).toBe(0);
  });
});
