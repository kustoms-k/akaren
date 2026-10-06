import { addDays, isoWeek, isoWeekRange, isoWeekday } from './dates.js';
import { ORDER_FIELDS } from './orderExtraction.js';
import { dayText } from './replyTemplates.js';

// The DEMO_MODE order mailbox: a realistic week of email to "order@lagerviksakeri.se", already sorted, with the
// AI extraction for every order written out by hand. Customers, people, phone numbers (070-174 06 xx, a range
// PTS reserves for fiction) and .se domains are fictional and match the demo seed (seed/demo.js). Every domain was
// checked to have no DNS records (unregistered) when chosen, and senders that would be real brands (newsletters,
// suppliers) are fictional companies, so no email here is attributed to a real organisation.
// Nothing here is used outside DEMO_MODE or the demo seed; real mail is never guessed at.

export const DEMO_MAILBOX = 'order@lagerviksakeri.se';
export const INBOX_DEMO_MODEL = 'demo';
export const INBOX_DEMO_PROMPT_VERSION = 'inbox-demo-v1';

const f = (value, confidence = 'hog') => ({ value, confidence });
const output = (given) => Object.fromEntries(ORDER_FIELDS.map((k) => [k, given[k] ?? { value: null, confidence: 'lag' }]));
const nextWeekday = (from, wd) => addDays(from, ((wd - isoWeekday(from) + 7) % 7) || 7);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const PETRA = { name: 'Petra Holm', email: 'petra.holm@norrbackamark.se' };
const OSKAR = { name: 'Oskar Wiklund', email: 'oskar.wiklund@norrbackamark.se' };
const LINNEA = { name: 'Linnea Ek', email: 'linnea.ek@saltsjobyggentreprenad.se' };
const HAMPUS = { name: 'Hampus Strand', email: 'hampus.strand@ekhagensfastigheter.se' };
const ALI = { name: 'Ali Haddad', email: 'ali.haddad@vallbyschakt.se' };
const ERIK = { name: 'Erik Sandberg', email: 'erik@sandbergsmarkab.se' };

const PETRA_SIGN = 'Mvh\nPetra Holm\nPlatschef, Norrbacka Mark & Anläggning AB\n070-174 06 10';
const LINNEA_SIGN = 'Linnea Ek\nArbetsledare, Saltsjö Bygg & Entreprenad AB\n070-174 06 12';

const NEWSLETTER = 'Nyhetsbrev (mejlet har en avregistreringslänk)';
const NO_REPLY = 'Automatiskt utskick från en no-reply-adress';

/**
 * Every demo email as of `today`. `anchor` (the day the mailbox was created) keeps Message-IDs stable, so
 * threads still connect when a held-back email is fetched on a later day.
 * Fields: key, at [date, 'HH:MM'] or pool (fetched live by "Hämta ny post", in order), replyTo (key of the
 * message it answers), from, subject, body, attachments, triage, extraction (raw model output) and
 * state ('unread' | 'read' | 'handled'). `job` names a seed job; `history` and `replies` are seeded history.
 */
export function demoInboxEmails(today, anchor = today) {
  const yesterday = addDays(today, -1);
  const thu = nextWeekday(today, 4);
  const fri = addDays(thu, 1);
  const monday = isoWeekRange(isoWeek(today).key).from;
  const firstDay = addDays(monday, -7);                // the seed jobs start on the previous Monday
  const ordered = addDays(firstDay, -4);               // ...and were ordered the Thursday before
  const lastDay = addDays(monday, 4);
  const avbokadDag = nextWeekday(yesterday, 3);
  const erikOnsdag = nextWeekday(yesterday, 3);
  const erikTorsdag = addDays(erikOnsdag, 1);
  const erikFredag = addDays(erikOnsdag, 2);
  const vallbyMandag = nextWeekday(yesterday, 1);
  const tyresoWeek = isoWeek(addDays(today, 14));
  const tyresoMonday = isoWeekRange(tyresoWeek.key).from;
  const prevWeek = isoWeek(addDays(today, -7)).week;
  const stamp = anchor.replace(/-/g, '');
  const id = (key, domain) => `<${key}.${stamp}@${domain}>`;

  const emails = [
    // ── History: the two running jobs were ordered by email, confirmed from the inbox ──
    {
      key: 'rorstrand-start', at: [ordered, '14:22'], from: PETRA, state: 'handled', job: 'rorstrand',
      subject: 'Bortforsling schaktmassor Kv. Rörstrand – start måndag',
      body: `Hej!

Nu drar vi igång schakten för garaget på Kv. Rörstrand, Rörstrandsgatan 40. Vi behöver en bil från ${dayText(firstDay)} och två veckor framåt, start kl 07.00 varje dag. Totalt räknar vi med ca 1 400 ton schaktmassor (lera/morän) som ska till Ekbacka i Upplands Väsby. Vår ref: NMA-2611.

Arbetsplatsen ligger i miljözon klass 1, så bara Euro VI-bilar. Infart från Rörstrandsgatan.

${PETRA_SIGN.replace('070', 'Org.nr 559101-2348\n070')}`,
      triage: { category: 'bestallning', source: 'ai', summary: `Ny beställning: schakt Kv. Rörstrand i två veckor från ${dayText(firstDay)}, ca 1 400 ton till Ekbacka.` },
      extraction: output({
        kund: f('Norrbacka Mark & Anläggning AB'), kund_orgnr: f('559101-2348'), kontaktperson: f('Petra Holm'),
        telefon: f('070-174 06 10'), epost: f(PETRA.email), projekt: f('Kv. Rörstrand'), adress: f('Rörstrandsgatan 40'),
        ort: f('Stockholm', 'medel'), datum: f(firstDay, 'medel'), datum_till: f(lastDay, 'medel'), tid: f('07:00'),
        uppdragstyp: f('schakt'), material: f('Schaktmassor (lera/morän)'), uppskattad_mangd: f(1400, 'medel'),
        mangd_enhet: f('ton'), fran: f('Rörstrandsgatan 40, Stockholm'), till: f('Ekbacka massmottagning, Upplands Väsby'),
        instruktioner: f('Miljözon klass 1, endast Euro VI. Infart från Rörstrandsgatan. Ref NMA-2611.'),
      }),
      history: { intake: [addDays(ordered, 1), '09:05'], confirmed: [addDays(ordered, 1), '09:15'] },
      replies: [{ key: 'rorstrand-start-ok', at: [addDays(ordered, 1), '09:16'], template: 'bekrafta', params: { message: 'Mikael Lund kör med TKA412 (Euro VI) varje dag.' } }],
    },
    {
      key: 'orminge-start', at: [ordered, '09:03'], from: LINNEA, state: 'handled', job: 'orminge',
      subject: 'Bergkross 0–32 Orminge centrum – två veckor från måndag',
      body: `Hej,

Vi behöver bergkross 0–32 till grundläggningen på Orminge centrum, Kanholmsvägen 2 i Saltsjö-Boo. Ca 600 ton fördelat på två veckor med start ${dayText(firstDay)}, 4–5 lass om dagen från kl 07.00.

Hämtas från Lindhovs bergtäkt. Märk vågsedlarna med SBE-118.

Tack!
${LINNEA_SIGN}`,
      triage: { category: 'bestallning', source: 'ai', summary: `Ny beställning: ca 600 ton bergkross 0–32 från Lindhov till Orminge centrum i två veckor från ${dayText(firstDay)}.` },
      extraction: output({
        kund: f('Saltsjö Bygg & Entreprenad AB'), kontaktperson: f('Linnea Ek'), telefon: f('070-174 06 12'), epost: f(LINNEA.email),
        projekt: f('Orminge centrum – grundläggning'), adress: f('Kanholmsvägen 2'), ort: f('Saltsjö-Boo'),
        datum: f(firstDay, 'medel'), datum_till: f(lastDay, 'medel'), tid: f('07:00'), uppdragstyp: f('grus_leverans'),
        material: f('Bergkross 0–32'), uppskattad_mangd: f(600, 'medel'), mangd_enhet: f('ton'), fran: f('Lindhovs bergtäkt'),
        till: f('Orminge centrum, Kanholmsvägen 2'), instruktioner: f('4–5 lass om dagen. Märk vågsedlarna med SBE-118.'),
      }),
      history: { intake: [addDays(ordered, 1), '08:50'], confirmed: [addDays(ordered, 1), '09:14'] },
      replies: [{ key: 'orminge-start-ok', at: [addDays(ordered, 1), '09:15'], template: 'bekrafta', params: { message: null } }],
    },

    // ── Filtered out: what a real order mailbox also receives ──
    {
      key: 'ms365', at: [addDays(today, -3), '08:05'], from: { name: 'Haninge IT-partner', email: 'no-reply@haningeitpartner.se' }, state: 'read',
      subject: 'Din postlåda är nästan full',
      body: 'Postlådan order@lagerviksakeri.se använder 46,2 GB av 50 GB. Rensa gamla mejl eller uppgradera lagringen för att fortsätta ta emot e-post.',
      triage: { category: 'ovrigt', source: 'regel', summary: 'Systemmeddelande om lagringsutrymme.', filter_reason: NO_REPLY },
    },
    {
      key: 'vianor', at: [addDays(today, -2), '12:40'], from: { name: 'Däckcentralen Haninge', email: 'bokning@dackcentralenhaninge.se' }, state: 'read',
      subject: 'Bokningsbekräftelse: däckbyte TKA418',
      body: `Hej!

Tack för din bokning. Välkommen till Däckcentralen Haninge ${dayText(thu)} kl 07.30 för byte till vinterdäck på TKA418. Räkna med ungefär en timme.

Adress: Kilowattvägen 6, Haninge

Vänliga hälsningar
Däckcentralen Haninge`,
      triage: { category: 'ovrigt', source: 'ai', summary: 'Verkstadsbokning för er egen bil TKA418.', filter_reason: 'Bekräftelse från verkstad som gäller er egen bil, inte en kundorder' },
    },
    {
      key: 'tfcenter', at: [addDays(today, -2), '21:14'], from: { name: 'Truck & Flak Center', email: 'kampanj@truckflakcenter.se' }, state: 'read',
      subject: 'Höstkampanj: begagnade tippflak från 89 000 kr',
      body: 'Just nu har vi 14 begagnade tippflak i lager, alla besiktade och klara för leverans. Boka en visning i Arlandastad redan i dag!\n\nVill du inte ha fler erbjudanden? Avregistrera dig här.',
      triage: { category: 'ovrigt', source: 'regel', summary: 'Reklam för begagnade tippflak.', filter_reason: NEWSLETTER },
    },
    {
      key: 'akeri-inbjudan', at: [yesterday, '07:12'], from: { name: 'Åkerinätverket Stockholm', email: 'evenemang@akerinatverket.se' }, state: 'read',
      subject: 'Inbjudan: Branschdag Anläggning 12 november',
      body: 'Välkommen till Branschdag Anläggning! Ta del av nyheter om massahantering, nya regler för avfallsrapportering och hur fler åkerier får betalt i tid.\n\nAnmäl dig senast 1 november.\n\nAvregistrera dig från utskicken.',
      triage: { category: 'ovrigt', source: 'regel', summary: 'Inbjudan till branschdag.', filter_reason: NEWSLETTER },
    },
    {
      key: 'ekbacka-kvitto', at: [yesterday, '15:47'], from: { name: 'Ekbacka Massmottagning', email: 'noreply@ekbackamassmottagning.se' }, state: 'read',
      subject: 'Mottagningskvitto – Lagerviks Åkeri AB',
      body: `Sammanställning av mottagna lass från Lagerviks Åkeri AB, ${dayText(yesterday)}:

Antal lass: 9
Mottagen mängd: 152,36 ton
Avfallskod: 17 05 04

Detta är ett automatiskt utskick. Svara inte på det här mejlet.`,
      triage: { category: 'ovrigt', source: 'regel', summary: 'Dagskvitto från Ekbacka massmottagning.', filter_reason: `${NO_REPLY}. Lassen registreras redan via förarnas vågsedlar` },
    },
    {
      key: 'ansokan', at: [yesterday, '19:30'], from: { name: 'Ahmed Yusuf', email: 'ahmed.yusuf@bredbandshuset.se' }, state: 'read',
      subject: 'Ansökan: CE-chaufför',
      body: 'Hej!\n\nJag har CE-körkort, YKB och fem års erfarenhet av tippbil i Stockholmsområdet. Jag undrar om ni behöver fler förare. CV bifogas.\n\nMvh\nAhmed',
      attachments: [{ filename: 'CV_Ahmed_Yusuf.pdf', content_type: 'application/pdf', size_bytes: 88412, text_content: null }],
      triage: { category: 'ovrigt', source: 'ai', summary: 'Jobbansökan som CE-chaufför.', filter_reason: 'Jobbansökan. Vidarebefordra till den som anställer' },
    },
    {
      key: 'volvo', at: [today, '05:58'], from: { name: 'Lastvagnsdepån Södertörn', email: 'nyhetsbrev@lastvagnsdepan.se' }, state: 'unread',
      subject: 'Nyheter i oktober: eldrivna tippbilar för anläggningsjobb',
      body: 'Hej Lagerviks Åkeri AB!\n\nI oktobernumret: så klarar en eldriven tippbil en heldag i Stockholmstrafik, nya serviceavtal för anläggningsfordon och höstens kurser för förare.\n\nDu får det här mejlet eftersom du prenumererar på Lastvagnsdepåns nyhetsbrev. Avregistrera dig här.',
      triage: { category: 'ovrigt', source: 'regel', summary: 'Nyhetsbrev från en lastbilsåterförsäljare.', filter_reason: NEWSLETTER },
    },
    {
      key: 'preem', at: [today, '06:30'], from: { name: 'Nordbränsle Företagskort', email: 'faktura@nordbransle.se' }, state: 'unread',
      subject: 'Faktura 4471882 – drivmedel september',
      body: 'Hej,\n\nBifogat finns faktura 4471882 för drivmedel under september.\n\nBelopp att betala: 84 316,00 kr\nFörfallodag: 30 oktober\n\nMed vänlig hälsning\nNordbränsle Företagskort',
      attachments: [{ filename: 'Faktura_4471882.pdf', content_type: 'application/pdf', size_bytes: 61240, text_content: 'FAKTURA 4471882\nNordbränsle Företagskort\nKund: Lagerviks Åkeri AB\nPeriod: september\nDiesel MK1 HVO-inblandning 4 211 liter\nAtt betala: 84 316,00 kr\nFörfallodag: 30 oktober' }],
      triage: { category: 'ovrigt', source: 'ai', summary: 'Leverantörsfaktura för drivmedel, 84 316 kr.', filter_reason: 'Leverantörsfaktura. Hör till bokföringen, inte en order' },
    },
    {
      key: 'tachoweb', at: [today, '07:02'], from: { name: 'Färdskrivarportalen', email: 'rapport@fardskrivarportalen.se' }, state: 'unread',
      subject: `Veckorapport färdskrivare v. ${prevWeek}`,
      body: `Veckorapporten för vecka ${prevWeek} är klar. 5 fordon, 4 förare, inga avvikelser.\n\nLogga in på Färdskrivarportalen för att se hela rapporten.`,
      triage: { category: 'ovrigt', source: 'regel', summary: 'Veckorapport från färdskrivarsystemet.', filter_reason: NO_REPLY },
    },

    // ── Order mail, oldest first ──
    {
      key: 'erik-container', at: [yesterday, '10:14'], from: ERIK, state: 'handled',
      subject: 'Container till Vallentuna onsdag?',
      body: `Hej,

Vi river ett gammalt garage på Kullbyvägen 12 i Vallentuna och behöver en container (lastväxlare) för blandat rivningsavfall. Kan ni ställa ut en på onsdag förmiddag och hämta på fredag?

Erik Sandberg
Sandbergs Mark AB
070-174 06 31`,
      triage: { category: 'bestallning', source: 'ai', summary: `Ny kund: container för rivningsavfall på Kullbyvägen 12, Vallentuna. Utställning ${dayText(erikOnsdag)}, hämtning fredag.` },
      extraction: output({
        kund: f('Sandbergs Mark AB'), kontaktperson: f('Erik Sandberg'), telefon: f('070-174 06 31'), epost: f(ERIK.email),
        projekt: f('Rivning garage Kullbyvägen', 'medel'), adress: f('Kullbyvägen 12'), ort: f('Vallentuna'),
        datum: f(erikOnsdag, 'medel'), datum_till: f(erikFredag, 'medel'), uppdragstyp: f('container'),
        material: f('Blandat rivningsavfall'), fran: f('Kullbyvägen 12, Vallentuna'),
        instruktioner: f('Ställs ut onsdag förmiddag, hämtas fredag.'),
      }),
      replies: [{
        key: 'erik-nytt-datum', at: [yesterday, '11:02'], template: 'nytt_datum',
        params: { datum: erikTorsdag, tid: '07:00', note: 'Hämtningen på fredag går bra som ni önskar.' },
      }],
    },
    {
      key: 'avbokning-rorstrand', at: [yesterday, '17:42'], from: PETRA, state: 'handled', job: 'rorstrand',
      subject: `Inga lass ${dayText(avbokadDag).split(' ')[0]} – Kv. Rörstrand`,
      body: `Hej!

Vi gjuter bottenplattan på ${dayText(avbokadDag).split(' ')[0]} så det blir inga lass från Rörstrand den dagen. Dagen efter kör vi som vanligt från 07.00.

Kan ni meddela Mikael?

${PETRA_SIGN}`,
      triage: {
        category: 'avbokning', source: 'ai',
        summary: `Avbokar lassen på Kv. Rörstrand ${dayText(avbokadDag)} (gjutning). Dagen efter som vanligt.`,
        change: [{ label: cap(dayText(avbokadDag)), from: 'Lass enligt plan', to: 'Inga lass (gjutning)' }],
      },
      replies: [{
        key: 'avbokning-ok', at: [yesterday, '17:58'], template: 'bekrafta_avbokning',
        params: { note: 'Mikael är meddelad. Vi kör som vanligt dagen efter från kl 07.00.' },
      }],
    },
    {
      key: 'tyreso', at: [yesterday, '13:37'], from: { name: 'Karin Ström', email: 'karin.strom@tyresomarkbyggnad.se' }, state: 'read',
      subject: `Förfrågan: 2 tippbilar v. ${tyresoWeek.week}, VA-jobb Tyresö`,
      body: `Hej,

Vi startar ett VA-jobb på Bollmoravägen i Tyresö vecka ${tyresoWeek.week} och söker åkeri för bortforsling av schaktmassor. Uppskattningsvis 40–50 lass under veckan, 2 bilar per dag.

Har ni kapacitet den veckan? Skicka gärna ert pris per lass eller per ton, inklusive tipp på närmaste mottagning.

Vänliga hälsningar
Karin Ström
Inköpare, Tyresö Markbyggarna AB
070-174 06 34`,
      triage: { category: 'fraga', source: 'ai', summary: `Förfrågan, inte en beställning än: kapacitet och pris för 2 tippbilar vecka ${tyresoWeek.week}, 40–50 lass schaktmassor i Tyresö.` },
      extraction: output({
        kund: f('Tyresö Markbyggarna AB'), kontaktperson: f('Karin Ström'), telefon: f('070-174 06 34'),
        epost: f('karin.strom@tyresomarkbyggnad.se'), projekt: f('VA-jobb Bollmoravägen', 'medel'), adress: f('Bollmoravägen', 'lag'),
        ort: f('Tyresö'), datum: f(tyresoMonday, 'medel'), datum_till: f(addDays(tyresoMonday, 4), 'medel'),
        uppdragstyp: f('schakt'), material: f('Schaktmassor'), antal_lass: f(45, 'lag'),
        instruktioner: f(`2 bilar per dag under vecka ${tyresoWeek.week}. Kunden vill ha pris per lass eller ton inklusive tipp.`, 'medel'),
      }),
    },
    {
      key: 'vallby-ao', at: [yesterday, '16:05'], from: ALI, state: 'read',
      subject: 'Arbetsorder AO-2026-0412 – maskintransport Lidingö',
      body: `Hej,

Vi har fått ert nummer av Petra på Norrbacka. Bifogar en arbetsorder för flytt av vår bandgrävare till ett jobb på Lidingö på måndag morgon.

Går det bra? Hör av er om ni behöver något mer.

Med vänlig hälsning
Ali Haddad
Arbetsledare, Vallby Schakt & Väg AB
070-174 06 21`,
      attachments: [{
        filename: 'AO-2026-0412.pdf', content_type: 'application/pdf', size_bytes: 48213,
        text_content: `ARBETSORDER                                   AO-2026-0412
Vallby Schakt & Väg AB · Org.nr 559415-3727
Box 118, 181 21 Lidingö · order@vallbyschakt.se

Beställare:      Vallby Schakt & Väg AB
Kontaktperson:   Ali Haddad, tel 070-174 06 21
Projekt:         Brf Sjöglimten – ny dagvattenledning
Arbetsplats:     Sjöglimtsvägen 9, 181 62 Lidingö

Uppdrag:         Maskintransport
Beskrivning:     Flytt av bandgrävare Volvo EC220 (ca 23 ton) från vårt
                 förråd, Stockby Verkstadsväg 4, Lidingö, till arbetsplatsen.
Önskat datum:    ${vallbyMandag} kl 06:00
Övrigt:          Smal infart – ring Ali 30 min före ankomst. Maskinen är
                 tankad och klar för lastning.

Betalningsvillkor 30 dagar netto.                          Sida 1 av 1`,
      }],
      triage: { category: 'bestallning', source: 'ai', summary: `Ny kund, arbetsorder i PDF: flytt av bandgrävare Volvo EC220 (ca 23 ton) till Sjöglimtsvägen 9, Lidingö, ${dayText(vallbyMandag)} kl 06:00.` },
      extraction: output({
        kund: f('Vallby Schakt & Väg AB'), kund_orgnr: f('559415-3727'), kontaktperson: f('Ali Haddad'), telefon: f('070-174 06 21'),
        epost: f(ALI.email), projekt: f('Brf Sjöglimten – ny dagvattenledning'), adress: f('Sjöglimtsvägen 9'), postnr: f('181 62'),
        ort: f('Lidingö'), datum: f(vallbyMandag), tid: f('06:00'), uppdragstyp: f('maskintransport'),
        material: f('Bandgrävare Volvo EC220 (ca 23 ton)'), fran: f('Stockby Verkstadsväg 4, Lidingö'),
        till: f('Sjöglimtsvägen 9, Lidingö'), instruktioner: f('Smal infart – ring Ali 30 min före ankomst. Maskinen är tankad och klar för lastning.'),
      }),
    },
    {
      key: 'hammarby', at: [today, '06:52'], from: { name: null, email: 'jonas.m@hammarbybyggtjanst.se' }, state: 'unread',
      subject: 'SV: massor',
      body: `Hej igen,

Som sagt på telefon – vi har en del massor som behöver bort från gården i Hammarby sjöstad nästa vecka, kanske 8–10 lass, beror lite på hur mycket som kommer upp. Helst tidigt, typ 7 eller 8. Det kan finnas lite asfalt i det också.

Återkommer med exakt adress.

/Jonas

Skickat från min iPhone`,
      triage: { category: 'bestallning', source: 'ai', summary: 'Oklar beställning: 8–10 lass massor från en gård i Hammarby sjöstad nästa vecka. Adress, dag och mottagning saknas, och massorna kan innehålla asfalt.' },
      extraction: output({
        kund: f('Hammarby Bygg', 'lag'), kontaktperson: f('Jonas', 'medel'), epost: f('jonas.m@hammarbybyggtjanst.se'),
        projekt: f('Gården i Hammarby sjöstad', 'lag'), ort: f('Stockholm', 'lag'), datum: f(nextWeekday(today, 1), 'lag'),
        tid: f('07:00', 'lag'), uppdragstyp: f('schakt', 'medel'), material: f('Schaktmassor, kan innehålla asfalt', 'medel'),
        antal_lass: f(10, 'lag'), fran: f('Hammarby sjöstad', 'lag'),
        instruktioner: f('Exakt adress kommer senare. Massorna kan innehålla asfalt.', 'medel'),
      }),
    },
    {
      key: 'erik-svar', at: [today, '07:15'], from: ERIK, state: 'unread', replyTo: 'erik-nytt-datum',
      subject: 'SV: Container till Vallentuna onsdag?',
      body: `Torsdag funkar fint! Containern kan stå på uppfarten, jag flyttar bilen. Hämtning fredag eftermiddag om det går.

/Erik`,
      quote: 'erik-nytt-datum',
      triage: { category: 'svar', source: 'ai', summary: `Accepterar ert förslag: utställning ${dayText(erikTorsdag)} kl 07:00 på uppfarten, hämtning fredag eftermiddag. Klart att boka.` },
      extraction: output({
        kund: f('Sandbergs Mark AB'), kontaktperson: f('Erik Sandberg'), telefon: f('070-174 06 31'), epost: f(ERIK.email),
        projekt: f('Rivning garage Kullbyvägen', 'medel'), adress: f('Kullbyvägen 12'), ort: f('Vallentuna'),
        datum: f(erikTorsdag), datum_till: f(erikFredag, 'medel'), tid: f('07:00'), uppdragstyp: f('container'),
        material: f('Blandat rivningsavfall'), fran: f('Kullbyvägen 12, Vallentuna'),
        instruktioner: f('Containern ställs på uppfarten. Hämtning fredag eftermiddag.'),
      }),
    },
    {
      key: 'orminge-makadam', at: [today, '07:48'], from: LINNEA, state: 'unread', job: null,
      subject: 'Makadam till Orminge – torsdag',
      body: `Hej!

Vi behöver 4 lass makadam 16–32 till Orminge centrum på torsdag. Samma ställe som bergkrossen, Kanholmsvägen 2. Första lasset kl 07.00, sedan ett i timmen ungefär.

Hämtas från Lindhov som vanligt. Tippa vid västra sidan den här gången, vi har börjat med dräneringen där. Märk vågsedlarna med SBE-118.

Tack!
${LINNEA_SIGN}`,
      triage: { category: 'bestallning', source: 'ai', summary: `Ny beställning: 4 lass makadam 16–32 från Lindhov till Orminge centrum, ${dayText(thu)} från kl 07:00.` },
      extraction: output({
        kund: f('Saltsjö Bygg & Entreprenad AB'), kontaktperson: f('Linnea Ek'), telefon: f('070-174 06 12'), epost: f(LINNEA.email),
        projekt: f('Orminge centrum – grundläggning', 'medel'), adress: f('Kanholmsvägen 2'), ort: f('Saltsjö-Boo', 'medel'),
        datum: f(thu, 'medel'), tid: f('07:00'), uppdragstyp: f('grus_leverans'), material: f('Makadam 16–32'),
        antal_lass: f(4), fran: f('Lindhovs bergtäkt', 'medel'), till: f('Orminge centrum, Kanholmsvägen 2'),
        instruktioner: f('Ett lass i timmen ungefär. Tippa vid västra sidan (dräneringen). Märk vågsedlarna med SBE-118.'),
      }),
    },
    {
      key: 'kran-flytt', at: [today, '08:31'], from: HAMPUS, state: 'unread', job: 'kran',
      subject: `Kranbilen ${dayText(thu).split(' ')[0]} – kan vi flytta till fredag?`,
      body: `Hej,

Prefableveransen till Lagern är försenad en dag, så vi behöver flytta kranbilen från ${dayText(thu).split(' ')[0]} till fredag. Samma tid, kl 07.00, och samma upplägg i övrigt.

Säg till om det inte går så löser vi något annat.

Hälsningar
Hampus Strand
Projektledare, Ekhagens Fastighetsutveckling AB
Tel 070-174 06 13`,
      triage: {
        category: 'andring', source: 'ai',
        summary: `Vill flytta kranbilen på Arenastaden från ${dayText(thu)} till ${dayText(fri)}, samma tid (kl 07:00).`,
        change: [{ label: 'Datum', from: cap(dayText(thu)), to: cap(dayText(fri)) }, { label: 'Tid', from: null, to: 'kl 07.00 som tidigare' }],
      },
    },
    {
      key: 'taby-fa', at: [today, '09:10'], from: OSKAR, state: 'unread',
      subject: `Täby Park – förorenade massor ${dayText(thu).split(' ')[0]}`,
      body: `Hej,

Vi har fått provsvaren för etapp 3 och en del av massorna ligger över MKM (PAH). Kan ni ta 3 bilar på ${dayText(thu).split(' ')[0]} från kl 06.30? Ca 180 ton som ska till Ekbacka, de har gett oss mottagningsbesked.

Avfallskod 17 05 03*. Provsvaret bifogas.

Grindkod 4471 som vanligt.

/Oskar
Skickat från min iPhone`,
      attachments: [{
        filename: 'Provsvar_TPE3.pdf', content_type: 'application/pdf', size_bytes: 132870,
        text_content: `ANALYSRAPPORT                               Rapport nr 2026-41-0877
Provtagning: Täby Park etapp 3, schakt för VA (0–1 m)
Beställare: Norrbacka Mark & Anläggning AB, ref NMA-2604

Parameter        Halt (mg/kg TS)    KM     MKM
PAH-H            12                 1,0    10
PAH-M            18                 3,5    20
Bly              41                 50     400
Kvicksilver      0,08               0,25   2,5

Bedömning: halten PAH-H överskrider MKM. Massorna klassas som farligt avfall
(avfallskod 17 05 03*). Mottagning: Ekbacka massmottagning, mottagningsbesked
EKB-MB-2211.`,
      }],
      triage: {
        category: 'bestallning', source: 'ai', flags: ['farligt_avfall'],
        summary: `Ny beställning: 3 bilar, ca 180 ton förorenade massor (farligt avfall 17 05 03*) från Täby Park till Ekbacka, ${dayText(thu)} kl 06:30.`,
      },
      extraction: output({
        kund: f('Norrbacka Mark & Anläggning AB', 'medel'), kontaktperson: f('Oskar Wiklund'), epost: f(OSKAR.email),
        projekt: f('Täby Park etapp 3'), datum: f(thu, 'medel'), tid: f('06:30'), uppdragstyp: f('schakt'),
        material: f('Förorenade massor (PAH över MKM), 17 05 03*'), uppskattad_mangd: f(180, 'medel'), mangd_enhet: f('ton'),
        fran: f('Täby Park etapp 3'), till: f('Ekbacka massmottagning', 'medel'),
        instruktioner: f('3 bilar. Grindkod 4471. Farligt avfall 17 05 03*, mottagningsbesked EKB-MB-2211 från Ekbacka.'),
      }),
    },

    // ── Held back: fetched live with "Hämta ny post", one per click ──
    {
      key: 'rorstrand-extra', pool: 1, from: PETRA,
      subject: 'Två extra bilar fredag – Kv. Rörstrand',
      body: `Hej igen!

Vi ligger lite efter med schakten och skulle behöva två extra bilar på fredag, utöver Mikael. Från kl 06.30 till ca 15. Samma tipp som vanligt, Ekbacka.

Går det att lösa?

/Petra
070-174 06 10`,
      triage: { category: 'bestallning', source: 'ai', summary: `Ny beställning: 2 extra bilar till Kv. Rörstrand ${dayText(fri)} kl 06:30–15, tipp Ekbacka.` },
      extraction: output({
        kund: f('Norrbacka Mark & Anläggning AB', 'medel'), kontaktperson: f('Petra Holm', 'medel'), telefon: f('070-174 06 10'),
        epost: f(PETRA.email), projekt: f('Kv. Rörstrand'), datum: f(fri, 'medel'), tid: f('06:30'), uppdragstyp: f('schakt'),
        material: f('Schaktmassor', 'medel'), fran: f('Kv. Rörstrand', 'medel'), till: f('Ekbacka massmottagning', 'medel'),
        instruktioner: f('2 extra bilar utöver Mikael, ca 06:30–15:00.'),
      }),
    },
    {
      key: 'transportforetagen', pool: 2, from: { name: 'Transportbranschen Nytt', email: 'nyheter@transportbranschnytt.se' },
      subject: 'Veckobrev: skärpta miljözonsregler i Stockholm 2027',
      body: 'Veckans nyheter: nytt förslag om att utöka miljözon klass 2 i Stockholms innerstad, nya krav på elektroniska vägsedlar och kurser i lastsäkring under november.\n\nDu får det här veckobrevet som prenumerant. Avregistrera dig här.',
      triage: { category: 'ovrigt', source: 'regel', summary: 'Veckobrev om transportbranschen.', filter_reason: NEWSLETTER },
    },
    {
      key: 'vallby-rattelse', pool: 3, from: ALI, replyTo: 'vallby-ao',
      subject: 'SV: Arbetsorder AO-2026-0412 – maskintransport Lidingö',
      body: `Hej igen,

En rättelse: det är vår EC250 som ska flyttas, inte EC220. Den väger ca 26 ton med skopa. Allt annat är som i arbetsordern.

/Ali`,
      triage: {
        category: 'andring', source: 'ai',
        summary: 'Rättelse till arbetsordern: maskinen är en Volvo EC250 (ca 26 ton), inte EC220. Allt annat som tidigare.',
        change: [{ label: 'Maskin', from: 'Volvo EC220 (ca 23 ton)', to: 'Volvo EC250 (ca 26 ton)' }],
      },
    },
  ];

  const domain = (e) => e.from.email.split('@')[1];
  const messageIds = Object.fromEntries(emails.map((e) => [e.key, id(e.key, domain(e))]));
  for (const e of emails) for (const r of e.replies ?? []) messageIds[r.key] = id(r.key, DEMO_MAILBOX.split('@')[1]);
  return emails.map((e) => ({
    ...e,
    message_id: messageIds[e.key],
    in_reply_to: e.replyTo ? messageIds[e.replyTo] : null,
    replies: (e.replies ?? []).map((r) => ({ ...r, message_id: messageIds[r.key] })),
  }));
}

/** The arguments for inbox.ingest() for one demo email. jobIds maps a seed job key to its id. */
export function demoIngestArgs(def, { receivedAt, today, jobIds = {}, body = def.body }) {
  return {
    message: {
      message_id: def.message_id, in_reply_to: def.in_reply_to, from_name: def.from.name, from_email: def.from.email,
      to_email: DEMO_MAILBOX, subject: def.subject, body_text: body, received_at: receivedAt,
      attachments: def.attachments ?? [],
    },
    triage: {
      ...def.triage,
      job_id: def.job ? jobIds[def.job] ?? null : null,
      extraction: def.extraction
        ? { raw: def.extraction, model: INBOX_DEMO_MODEL, prompt_version: INBOX_DEMO_PROMPT_VERSION, today, latency_ms: 2100 + (def.key.length * 97) % 1900 }
        : null,
    },
  };
}
