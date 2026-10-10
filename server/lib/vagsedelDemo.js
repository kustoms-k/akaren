// DEMO_MODE only: the reading of the demo vågsedel that the demo playbook shows for the driver step (EKB419901 from
// Ekbacka, truck TKA412 on Kv. Rörstrand), so the step can be shown without an Anthropic key. It never looks at the
// photo: the driver page offers it as a labelled demo button after an upload, and says the values come from the demo
// slip. The time is printed small next to the date, so it comes back uncertain and the driver has to check it.

export const DEMO_VAGSEDEL_PROMPT_VERSION = 'vagsedel-demo-v1';
export const DEMO_VAGSEDEL_NR = 'EKB419901';

const f = (value, confidence = 'hog') => ({ value, confidence });

/** The model-shaped reading (VagsedelSchema) of the demo slip, weighed today at 09:42. */
export function demoVagsedelOutput(today) {
  return {
    vagsedel_nr: f(DEMO_VAGSEDEL_NR),
    datum: f(today),
    tid: f('09:42', 'lag'),
    regnr: f('TKA 412'),
    material: f('Schaktmassor'),
    avfallskod: f('17 05 04'),
    farligt_avfall: f(false),
    netto_kg: f(17640),
    brutto_kg: f(31880),
    tara_kg: f(14240),
    lastplats: f(null, 'lag'),
    mottagare: f('Ekbacka massmottagning'),
    mottagare_orgnr: f('559404-1236'),
    mottagare_adress: f('Ekbackavägen 3, Upplands Väsby'),
    kund: f('Lagerviks Åkeri AB'),
    projekt: f('NMA-2611'),
  };
}
