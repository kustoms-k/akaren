import { jsPDF } from 'jspdf';

// ── Palette ────────────────────────────────────────────────────────────────────
const INDIGO = [99, 102, 241];
const BLACK  = [26, 26, 26];
const DARK   = [60, 60, 60];
const MID    = [110, 110, 110];
const LIGHT  = [160, 160, 160];
const PALE   = [215, 215, 215];
const WHITE  = [255, 255, 255];

const PW = 210, PH = 297, M = 20, CW = PW - M * 2;

const setf = (doc, fam, sty, sz) => { doc.setFont(fam, sty); doc.setFontSize(sz); };
const col  = (doc, a)            => doc.setTextColor(...a);
const fill = (doc, a)            => doc.setFillColor(...a);
const strk = (doc, a)            => doc.setDrawColor(...a);

function hline(doc, y, c = PALE, lw = 0.25) {
  strk(doc, c); doc.setLineWidth(lw);
  doc.line(M, y, PW - M, y);
}

function body(doc, y, text, indent = 0) {
  setf(doc, 'helvetica', 'normal', 8);
  col(doc, DARK);
  const lines = doc.splitTextToSize(text, CW - indent);
  doc.text(lines, M + indent, y);
  return y + lines.length * 4.6 + 2;
}

function clause(doc, y, num, heading, paras) {
  if (y > PH - 50) { doc.addPage(); y = M + 10; }

  setf(doc, 'helvetica', 'bold', 9);
  col(doc, BLACK);
  doc.text(`${num}.  ${heading.toUpperCase()}`, M, y);
  y += 6;

  for (const p of paras) {
    if (y > PH - 30) { doc.addPage(); y = M + 10; }
    y = body(doc, y, p, 6);
  }
  return y + 3;
}

export function generateTos(company, user) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const acceptedDate = user?.tos_accepted_at
    ? new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
        .format(new Date(user.tos_accepted_at))
    : new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
        .format(new Date());

  let y = M;

  // ── Header bar ────────────────────────────────────────────────────────────────
  fill(doc, INDIGO);
  doc.rect(0, 0, PW, 14, 'F');
  setf(doc, 'helvetica', 'bold', 7);
  col(doc, WHITE);
  doc.text('ÅKAREN  ·  JURIDISKA DOKUMENT', M, 9);
  doc.text('ALLMÄNNA VILLKOR', PW - M, 9, { align: 'right' });

  y = 24;

  // ── Title ─────────────────────────────────────────────────────────────────────
  setf(doc, 'times', 'bold', 18);
  col(doc, BLACK);
  doc.text('Allmänna Villkor', M, y);
  y += 6;
  setf(doc, 'helvetica', 'normal', 8);
  col(doc, MID);
  doc.text('Åkaren Sverige AB  ·  Version 2026-05-17  ·  Gäller från och med 2026-05-17', M, y);
  y += 8;
  strk(doc, INDIGO); doc.setLineWidth(0.6); doc.line(M, y, M + 60, y);
  y += 10;

  // ── Preamble ──────────────────────────────────────────────────────────────────
  y = body(doc, y,
    'Dessa Allmänna Villkor ("Villkoren") gäller för användning av mjukvaruplattformen ' +
    'Åkaren ("Tjänsten") som tillhandahålls av Åkaren Sverige AB, org.nr 559100-0001, ' +
    'Sveavägen 1, 111 57 Stockholm ("Åkaren", "vi"). Genom att registrera ett konto och ' +
    'acceptera dessa Villkor ingår Kunden ett bindande avtal med Åkaren.',
    0,
  );
  y += 4;

  // ── Clauses ───────────────────────────────────────────────────────────────────
  y = clause(doc, y, 1, 'Tjänstebeskrivning', [
    '1.1  Åkaren tillhandahåller en webbaserad plattform för transportföretag med funktioner ' +
    'för: automatisk offerthantering, kundportaler och offertdelning via unika länkar, ' +
    'flotta- och förarhantering, prisintelligens och lönsamhetsanalys samt PDF-export av offerter.',
    '1.2  Automatisk offertberäkning är ett beslutsstöd och inte ett bindande erbjudande. Kunden ansvarar ' +
    'ensamt för att verifiera och godkänna alla offerter innan de kommuniceras till slutkund.',
    '1.3  Åkaren förbehåller sig rätten att uppdatera och förbättra Tjänsten löpande. ' +
    'Väsentliga förändringar kommuniceras med minst 14 dagars varsel.',
  ]);

  y = clause(doc, y, 2, 'Registrering och konto', [
    '2.1  Kunden måste registrera ett företagskonto med korrekta uppgifter inklusive ' +
    'organisationsnummer och kontaktinformation.',
    '2.2  Kunden ansvarar för att hålla inloggningsuppgifter konfidentiella och för all ' +
    'aktivitet som sker via kontot.',
    '2.3  Kunden ska omedelbart meddela Åkaren vid misstänkt obehörig åtkomst.',
  ]);

  y = clause(doc, y, 3, 'Prissättning och betalning', [
    '3.1  Abonnemangspriset framgår av Kundens orderbekräftelse. Aktuella priser publiceras ' +
    'på Åkarens webbplats.',
    '3.2  Betalning sker månadsvis i förskott via faktura eller automatisk kortdebitering. ' +
    'Faktura förfaller till betalning 30 dagar från fakturadatum.',
    '3.3  Vid försenad betalning utgår dröjsmålsränta med tillämplig referensränta + ' +
    '8 procentenheter per år (räntelagen 1975:635), samt en påminnelseavgift om 60 kr.',
    '3.4  Åkaren förbehåller sig rätten att justera abonnemangspriset. ' +
    'Prisjustering meddelas Kunden med minst 30 dagars varsel per e-post. ' +
    'Om Kunden inte accepterar prishöjningen kan Kunden säga upp avtalet med omedelbar ' +
    'verkan inom 30-dagarsperioden.',
  ]);

  y = clause(doc, y, 4, 'Nyttjanderätt och begränsningar', [
    '4.1  Åkaren beviljar Kunden en icke-exklusiv, icke-överlåtbar rätt att använda ' +
    'Tjänsten under avtalstiden för Kundens interna affärsändamål.',
    '4.2  Det är inte tillåtet att: (a) vidareförsälja eller underlicensiera Tjänsten; ' +
    '(b) reverse-engineera eller kopiera plattformens källkod; ' +
    '(c) använda Tjänsten för att bygga konkurrerande produkter; ' +
    '(d) missbruka Tjänstens funktioner för att generera skadligt eller vilseledande innehåll.',
  ]);

  y = clause(doc, y, 5, 'Immateriella rättigheter', [
    '5.1  Åkaren och dess licensgivare äger samtliga immateriella rättigheter till ' +
    'plattformen, dess design, kod och underliggande teknologi.',
    '5.2  Kunden äger alla data som Kunden matar in i Tjänsten ("Kunddata"). ' +
    'Åkaren beviljas en begränsad licens att behandla Kunddata uteslutande i syfte att ' +
    'tillhandahålla Tjänsten.',
    '5.3  Åkaren kan använda aggregerade, anonymiserade data för att förbättra Tjänsten, ' +
    'exempelvis för att kalibriera prisintelligensmodeller.',
  ]);

  y = clause(doc, y, 6, 'Sekretess', [
    '6.1  Vardera parten förbinder sig att hålla den andra partens konfidentiella ' +
    'information hemlig och att inte utan motpartens skriftliga samtycke röja sådan ' +
    'information till tredje part.',
    '6.2  Konfidentialitetsskyldigheten gäller inte information som: (a) är allmänt känd ' +
    'utan att mottagarens part orsakat detta; (b) mottagarparten kände till innan ' +
    'avtalets ingående; (c) mottagarparten mottagit lagligen från tredje part utan ' +
    'sekretessåtagande; (d) krävs att lämnas ut enligt lag eller myndighets beslut.',
  ]);

  y = clause(doc, y, 7, 'Personuppgifter', [
    '7.1  Behandling av personuppgifter regleras i Personuppgiftsbiträdesavtalet (PBA) ' +
    'som utgör en integrerad del av detta avtal och ingicks samtidigt med dessa Villkor.',
    '7.2  Kunden är Personuppgiftsansvarig för de personuppgifter som Kunden tillhandahåller ' +
    'via Tjänsten. Åkaren agerar Personuppgiftsbiträde.',
  ]);

  y = clause(doc, y, 8, 'Tillgänglighet och support', [
    '8.1  Åkaren eftersträvar en tjänstetillgänglighet om 99,5 % mätt per kalendermånad, ' +
    'exklusive planerat underhåll som aviseras i förväg.',
    '8.2  Support tillhandahålls via e-post (support@akaren.se) med svarstid om 1 arbetsdag ' +
    'under kontorstid måndag–fredag 08:00–17:00 (svenska helgdagar undantagna).',
  ]);

  y = clause(doc, y, 9, 'Ansvarsbegränsning', [
    '9.1  Åkarens totala skadeståndsansvar gentemot Kunden, oavsett grunden för anspråket, ' +
    'är begränsat till det belopp Kunden faktiskt erlagt i abonnemangsavgift under de ' +
    'senaste tre (3) kalendermånaderna före den händelse som gav upphov till anspråket.',
    '9.2  Åkaren ansvarar inte för indirekta skador, följdskador, utebliven vinst, ' +
    'produktionsbortfall, förlust av data eller driftsavbrott som Kunden lider, ' +
    'oavsett om Åkaren informerats om risken för sådana skador.',
    '9.3  Ansvarsbegränsningarna gäller inte vid grov vårdslöshet eller uppsåt från Åkarens sida.',
  ]);

  y = clause(doc, y, 10, 'Avtalstid och uppsägning', [
    '10.1  Avtalet löper tillsvidare med en (1) månads ömsesidig uppsägningstid, räknat ' +
    'från och med den dag uppsägning mottas av motparten.',
    '10.2  Åkaren kan säga upp avtalet med omedelbar verkan om Kunden: (a) väsentligt ' +
    'bryter mot dessa Villkor och inte vidtar rättelse inom 14 dagar efter skriftlig ' +
    'anmodan; (b) försätts i konkurs eller träder i likvidation; ' +
    '(c) underlåter att betala förfallen faktura inom 14 dagar efter påminnelse.',
    '10.3  Vid avtalets upphörande upphör Kundens rätt att använda Tjänsten. ' +
    'Kunddata hålls tillgänglig för export i 30 dagar varefter data raderas.',
  ]);

  y = clause(doc, y, 11, 'Ändringar av villkoren', [
    'Åkaren kan ändra dessa Villkor med minst 30 dagars varsel per e-post. ' +
    'Om Kunden inte accepterar de ändrade villkoren kan Kunden säga upp avtalet ' +
    'med omedelbar verkan inom 30-dagarsperioden. Fortsatt användning av Tjänsten ' +
    'efter ikraftträdandedatumet innebär att Kunden accepterar de nya villkoren.',
  ]);

  y = clause(doc, y, 12, 'Tillämplig lag och tvistlösning', [
    '12.1  Svensk rätt tillämpas på detta avtal, utan hänsyn till lagvalsregler.',
    '12.2  Tvister som uppstår i anledning av detta avtal ska i första hand lösas ' +
    'genom förhandling. Om parterna inte kan komma överens ska tvisten avgöras ' +
    'slutligt av Stockholms tingsrätt som första instans.',
  ]);

  // ── Acceptance confirmation ────────────────────────────────────────────────────
  if (y > PH - 40) { doc.addPage(); y = M + 10; }

  y += 4;
  hline(doc, y);
  y += 8;

  setf(doc, 'helvetica', 'bold', 7);
  col(doc, MID);
  doc.text('GODKÄNNANDE', M, y);
  y += 5;

  setf(doc, 'helvetica', 'normal', 7.5);
  col(doc, DARK);
  doc.text(
    `Dessa Allmänna Villkor godkändes digitalt den ${acceptedDate}` +
    (company?.name ? ` av ${company.name}` : '') +
    (user?.name    ? `, representerat av ${user.name}` : '') + '.',
    M, y, { maxWidth: CW },
  );

  // ── Footer on each page ───────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    strk(doc, PALE); doc.setLineWidth(0.25);
    doc.line(M, PH - 14, PW - M, PH - 14);
    setf(doc, 'helvetica', 'normal', 5.5); col(doc, LIGHT);
    doc.text(
      'Åkaren Sverige AB  ·  Org.nr 559100-0001  ·  info@akaren.se  ·  support@akaren.se',
      M, PH - 9,
    );
    doc.text(`Sida ${p} av ${totalPages}`, PW - M, PH - 9, { align: 'right' });
  }

  doc.save('Allmanna-Villkor-Akaren.pdf');
}
