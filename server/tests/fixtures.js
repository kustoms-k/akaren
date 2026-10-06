import { ORDER_FIELDS } from '../lib/orderExtraction.js';

/** A model response field. */
export const mf = (value, confidence = 'hog') => ({ value, confidence });

/** Complete model output (every key present, as structured outputs guarantees). */
export function orderOutput(overrides = {}) {
  const base = Object.fromEntries(ORDER_FIELDS.map((k) => [k, mf(null, 'lag')]));
  return { ...base, ...overrides };
}

export const ORDER_EMAIL = `Hej!

Vi behöver hjälp med bortforsling av schaktmassor från Kv. Rörstrand, Rörstrandsgatan 40 i Stockholm,
på tisdag 6/10 från kl 07.00. Ungefär 12 lass, ca 200 ton. Infart via Rörstrandsgatan, ring Petra vid ankomst.
Projektnr NMA-2611.

Mvh
Petra Holm
Norrbacka Mark & Anläggning AB
070-174 06 10
petra.holm@norrbackamark.se`;

/** What a good extraction of ORDER_EMAIL looks like (today = 2026-10-03). */
export const ORDER_EMAIL_OUTPUT = orderOutput({
  kund: mf('Norrbacka Mark & Anläggning AB'),
  kontaktperson: mf('Petra Holm'),
  telefon: mf('070-174 06 10'),
  projekt: mf('Kv. Rörstrand'),
  adress: mf('Rörstrandsgatan 40'),
  ort: mf('Stockholm'),
  datum: mf('2026-10-06', 'medel'),
  tid: mf('07:00'),
  uppdragstyp: mf('schakt'),
  material: mf('Schaktmassor'),
  uppskattad_mangd: mf(200, 'medel'),
  mangd_enhet: mf('ton'),
  antal_lass: mf(12, 'lag'),
  fran: mf('Rörstrandsgatan 40, Stockholm'),
  instruktioner: mf('Infart via Rörstrandsgatan. Ring Petra vid ankomst.'),
});

/** Fake Anthropic SDK client: records requests and returns a canned parse() response. */
export function fakeClient(respond) {
  const calls = [];
  const client = {
    calls,
    messages: {
      async parse(params) {
        calls.push(params);
        const r = typeof respond === 'function' ? await respond(params, calls.length) : respond;
        if (r instanceof Error) throw r;
        return {
          model: params.model,
          stop_reason: 'end_turn',
          usage: { input_tokens: 2400, output_tokens: 600, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          content: [],
          ...r,
        };
      },
    },
  };
  // Requests with server-side fallbacks go through client.beta.messages.parse; same canned answer.
  client.beta = { messages: { parse: (params) => client.messages.parse(params) } };
  return client;
}
