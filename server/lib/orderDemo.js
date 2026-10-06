import { addDays, isoWeekday } from './dates.js';
import { ORDER_FIELDS } from './orderExtraction.js';

// DEMO_MODE only: sample orders with pre-written extractions, so order intake can be shown without an
// Anthropic key. Only these exact texts produce a result; any other text is rejected, never guessed.
// Customers, projects and phone numbers match the demo seed (seed/demo.js) and are fictional.

export const DEMO_MODEL = 'demo';
export const DEMO_PROMPT_VERSION = 'order-demo-v1';

const f = (value, confidence = 'hog') => ({ value, confidence });

/** A complete extraction in OrderExtractionSchema shape; unlisted fields are "not found". */
const output = (given) => Object.fromEntries(ORDER_FIELDS.map((k) => [k, given[k] ?? { value: null, confidence: 'lag' }]));

/** First date strictly after `today` that falls on ISO weekday `wd` (1 = Monday). */
function nextWeekday(today, wd) {
  return addDays(today, ((wd - isoWeekday(today) + 7) % 7) || 7);
}

const SAMPLES = [
  {
    id: 'rorstrand',
    kind: 'mejl',
    label: 'Norrbacka · schakt Kv. Rörstrand',
    text: () => `Från: Petra Holm <petra.holm@norrbackamark.se>
Ämne: Bortforsling schaktmassor Kv. Rörstrand – tisdag

Hej!

Vi behöver hjälp att köra bort schaktmassor från Kv. Rörstrand, Rörstrandsgatan 40, 113 40 Stockholm på tisdag. Start kl 07.00.

Det är ca 12 lass rena schaktmassor (lera/morän) som ska till Ekbacka massmottagning i Upplands Väsby. Vår ref: NMA-2611.

Infart via Birkagatan, grinden står öppen från 06.45. Ring mig när första bilen är på plats så visar jag var ni lastar. Grävaren står vid norra gaveln.

Mvh
Petra Holm
Platschef, Norrbacka Mark & Anläggning AB
Org.nr 559101-2348
070-174 06 10`,
    output: (today) => output({
      kund: f('Norrbacka Mark & Anläggning AB'),
      kund_orgnr: f('559101-2348'),
      kontaktperson: f('Petra Holm'),
      telefon: f('070-174 06 10'),
      epost: f('petra.holm@norrbackamark.se'),
      projekt: f('Kv. Rörstrand'),
      adress: f('Rörstrandsgatan 40'),
      postnr: f('113 40'),
      ort: f('Stockholm'),
      datum: f(nextWeekday(today, 2), 'medel'),
      tid: f('07:00'),
      uppdragstyp: f('schakt'),
      material: f('Schaktmassor (lera/morän)'),
      antal_lass: f(12, 'medel'),
      fran: f('Kv. Rörstrand, Rörstrandsgatan 40'),
      till: f('Ekbacka massmottagning, Upplands Väsby'),
      instruktioner: f('Infart via Birkagatan, grinden öppen från 06:45. Ring Petra när första bilen är på plats. Grävaren står vid norra gaveln. Ref NMA-2611.'),
    }),
  },
  {
    id: 'taby',
    kind: 'sms',
    label: 'SMS från Oskar · förorenade massor',
    text: () => 'Hej! Oskar på Norrbacka här. Behöver 3 bilar imorgon kl 6.30 till Täby Park etapp 3, Stora Marknadsvägen. Förorenade massor (KM) ca 180 ton ska till Skogsås. Grindkod 4471. Mottagningsbesked finns på plats. /Oskar 0701740611',
    output: (today) => output({
      kund: f('Norrbacka', 'medel'),
      kontaktperson: f('Oskar', 'medel'),
      telefon: f('0701740611'),
      projekt: f('Täby Park etapp 3'),
      adress: f('Stora Marknadsvägen', 'medel'),
      ort: f('Täby', 'medel'),
      datum: f(addDays(today, 1), 'medel'),
      tid: f('06:30'),
      uppdragstyp: f('schakt'),
      material: f('Förorenade massor (KM)'),
      uppskattad_mangd: f(180, 'medel'),
      mangd_enhet: f('ton'),
      fran: f('Täby Park etapp 3, Stora Marknadsvägen'),
      till: f('Skogsås', 'medel'),
      instruktioner: f('3 bilar. Grindkod 4471. Mottagningsbesked finns på plats.'),
    }),
  },
  {
    id: 'orminge',
    kind: 'mejl',
    label: 'Saltsjö Bygg · bergkross 2 dagar',
    text: () => `Från: Linnea Ek <linnea.ek@saltsjobyggentreprenad.se>
Ämne: Beställning bergkross – Orminge centrum

Hej,

Vi behöver bergkross 0–32 till Orminge centrum (grundläggning), Kanholmsvägen 2, 132 30 Saltsjö-Boo. Totalt ca 240 ton som ska levereras onsdag och torsdag.

Hämtas från Lindhovs bergtäkt. Första lasset på plats kl 07.30, sedan löpande under dagen. Tippa vid den östra slänten, jag möter upp vid första lasset. Märk vågsedlarna med SBE-118.

Tack på förhand!
Linnea Ek
Arbetsledare, Saltsjö Bygg & Entreprenad AB
070-174 06 12`,
    output: (today) => {
      const datum = nextWeekday(today, 3);
      return output({
        kund: f('Saltsjö Bygg & Entreprenad AB'),
        kontaktperson: f('Linnea Ek'),
        telefon: f('070-174 06 12'),
      epost: f('linnea.ek@saltsjobyggentreprenad.se'),
        projekt: f('Orminge centrum – grundläggning'),
        adress: f('Kanholmsvägen 2'),
        postnr: f('132 30'),
        ort: f('Saltsjö-Boo'),
        datum: f(datum, 'medel'),
        datum_till: f(addDays(datum, 1), 'medel'),
        tid: f('07:30'),
        uppdragstyp: f('grus_leverans'),
        material: f('Bergkross 0–32'),
        uppskattad_mangd: f(240, 'medel'),
        mangd_enhet: f('ton'),
        fran: f('Lindhovs bergtäkt'),
        till: f('Orminge centrum, Kanholmsvägen 2'),
        instruktioner: f('Löpande leveranser under dagen. Tippa vid östra slänten, Linnea möter upp vid första lasset. Märk vågsedlarna med SBE-118.'),
      });
    },
  },
  {
    id: 'arenastaden',
    kind: 'mejl',
    label: 'Ekhagen · kranbil Arenastaden',
    text: () => `Från: Hampus Strand <hampus.strand@ekhagensfastigheter.se>
Ämne: Kranbil fredag – Arenastaden kv. Lagern

Hej Lagerviks Åkeri,

Kan ni ställa en kranbil hos oss på Arenastaden kv. Lagern, Evenemangsgatan 21 i Solna, på fredag kl 09.00? Det gäller lyft av 6 st prefab-trappor (ca 1,8 ton/st) från bil upp till bjälklaget på plan 2. Räkna med 3–4 timmar.

Lastzon finns på Evenemangsgatan, anmäl er i bodetableringen vid ankomst. Hjälm, väst och skyddsskor krävs. Lyftplan bifogas.

Hälsningar
Hampus Strand
Projektledare, Ekhagens Fastighetsutveckling AB
Org.nr 559303-4563
Tel 070-174 06 13`,
    output: (today) => output({
      kund: f('Ekhagens Fastighetsutveckling AB'),
      kund_orgnr: f('559303-4563'),
      kontaktperson: f('Hampus Strand'),
      telefon: f('070-174 06 13'),
      epost: f('hampus.strand@ekhagensfastigheter.se'),
      projekt: f('Arenastaden kv. Lagern'),
      adress: f('Evenemangsgatan 21'),
      ort: f('Solna'),
      datum: f(nextWeekday(today, 5), 'medel'),
      tid: f('09:00'),
      uppdragstyp: f('kran'),
      material: f('Prefab-trappor, 6 st à ca 1,8 ton', 'medel'),
      fran: f('Arenastaden kv. Lagern, Evenemangsgatan 21', 'medel'),
      instruktioner: f('Lyft av 6 prefab-trappor till bjälklaget plan 2, räkna med 3–4 timmar. Lastzon på Evenemangsgatan, anmäl er i bodetableringen. Hjälm, väst och skyddsskor krävs.'),
    }),
  },
  {
    id: 'lidingo',
    kind: 'pdf',
    label: 'Ny kund · arbetsorder maskintransport',
    text: (today) => `ARBETSORDER                                   AO-2026-0412
Vallby Schakt & Väg AB · Org.nr 559415-3727
Box 118, 181 21 Lidingö · order@vallbyschakt.se

Beställare:      Vallby Schakt & Väg AB
Kontaktperson:   Ali Haddad, tel 070-174 06 21
Projekt:         Brf Sjöglimten – ny dagvattenledning
Arbetsplats:     Sjöglimtsvägen 9, 181 62 Lidingö

Uppdrag:         Maskintransport
Beskrivning:     Flytt av bandgrävare Volvo EC220 (ca 23 ton) från vårt
                 förråd, Stockby Verkstadsväg 4, Lidingö, till arbetsplatsen.
Önskat datum:    ${nextWeekday(today, 1)} kl 06:00
Övrigt:          Smal infart – ring Ali 30 min före ankomst. Maskinen är
                 tankad och klar för lastning.

Betalningsvillkor 30 dagar netto.                          Sida 1 av 1`,
    output: (today) => output({
      kund: f('Vallby Schakt & Väg AB'),
      kund_orgnr: f('559415-3727'),
      kontaktperson: f('Ali Haddad'),
      telefon: f('070-174 06 21'),
      epost: f('order@vallbyschakt.se', 'medel'),
      projekt: f('Brf Sjöglimten – ny dagvattenledning'),
      adress: f('Sjöglimtsvägen 9'),
      postnr: f('181 62'),
      ort: f('Lidingö'),
      datum: f(nextWeekday(today, 1)),
      tid: f('06:00'),
      uppdragstyp: f('maskintransport'),
      material: f('Bandgrävare Volvo EC220 (ca 23 ton)'),
      fran: f('Stockby Verkstadsväg 4, Lidingö'),
      till: f('Sjöglimtsvägen 9, Lidingö'),
      instruktioner: f('Smal infart – ring Ali 30 min före ankomst. Maskinen är tankad och klar för lastning.'),
    }),
  },
  {
    id: 'hammarby',
    kind: 'mejl',
    label: 'Otydligt mejl · massor nästa vecka',
    text: () => `Från: jonas.m@hammarbybyggtjanst.se
Ämne: SV: massor

Hej igen,

Som sagt på telefon – vi har en del massor som behöver bort från gården i Hammarby sjöstad nästa vecka, kanske 8–10 lass, beror lite på hur mycket som kommer upp. Helst tidigt, typ 7 eller 8. Det kan finnas lite asfalt i det också.

Återkommer med exakt adress.

/Jonas

Skickat från min iPhone`,
    output: (today) => output({
      kund: f('Hammarby Bygg', 'lag'),
      kontaktperson: f('Jonas', 'medel'),
      epost: f('jonas.m@hammarbybyggtjanst.se'),
      projekt: f('Gården i Hammarby sjöstad', 'lag'),
      ort: f('Stockholm', 'lag'),
      datum: f(nextWeekday(today, 1), 'lag'),
      tid: f('07:00', 'lag'),
      uppdragstyp: f('schakt', 'medel'),
      material: f('Schaktmassor, kan innehålla asfalt', 'medel'),
      antal_lass: f(10, 'lag'),
      fran: f('Hammarby sjöstad', 'lag'),
      instruktioner: f('Exakt adress kommer senare. Massorna kan innehålla asfalt.', 'medel'),
    }),
  },
];

const normalize = (text) => String(text).toLowerCase().replace(/\s+/g, ' ').trim();

/** The sample texts as of `today`, for the order inbox. */
export function demoOrderSamples(today) {
  return SAMPLES.map(({ id, kind, label, text }) => ({ id, kind, label, text: text(today) }));
}

/** The canned model output for a sample text (whitespace and case ignored), or null. */
export function findDemoOrder(text, today) {
  const key = normalize(text);
  const sample = SAMPLES.find((s) => normalize(s.text(today)) === key);
  return sample ? { id: sample.id, output: sample.output(today) } : null;
}
