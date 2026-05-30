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
  // Check page overflow
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

export function generateDpa(company, user) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const acceptedDate = user?.tos_accepted_at
    ? new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
        .format(new Date(user.tos_accepted_at))
    : new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
        .format(new Date());

  const controllerName = company?.name ?? 'Kund AB';
  const controllerOrg  = company?.org_nr ? `Org.nr ${company.org_nr}` : '';
  const controllerAddr = company?.address ?? '';

  let y = M;

  // ── Header bar ────────────────────────────────────────────────────────────────
  fill(doc, INDIGO);
  doc.rect(0, 0, PW, 14, 'F');
  setf(doc, 'helvetica', 'bold', 7);
  col(doc, WHITE);
  doc.text('ÅKAREN  ·  JURIDISKA DOKUMENT  ·  KONFIDENTIELLT', M, 9);
  doc.text('PERSONUPPGIFTSBITRÄDESAVTAL', PW - M, 9, { align: 'right' });

  y = 24;

  // ── Title ─────────────────────────────────────────────────────────────────────
  setf(doc, 'times', 'bold', 18);
  col(doc, BLACK);
  doc.text('Personuppgiftsbiträdesavtal', M, y);
  y += 6;
  setf(doc, 'helvetica', 'normal', 8);
  col(doc, MID);
  doc.text(`Ingånget ${acceptedDate}  ·  Version 2026-05-17`, M, y);
  y += 8;
  strk(doc, INDIGO); doc.setLineWidth(0.6); doc.line(M, y, M + 60, y);
  y += 10;

  // ── Party table ───────────────────────────────────────────────────────────────
  const halfW = (CW - 6) / 2;

  // Box A — controller
  fill(doc, [247, 247, 252]);
  strk(doc, PALE);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, halfW, 36, 2, 2, 'FD');

  setf(doc, 'helvetica', 'bold', 6);
  col(doc, INDIGO);
  doc.text('PERSONUPPGIFTSANSVARIG (CONTROLLER)', M + 4, y + 6);
  setf(doc, 'helvetica', 'bold', 9);
  col(doc, BLACK);
  doc.text(controllerName, M + 4, y + 13, { maxWidth: halfW - 8 });
  setf(doc, 'helvetica', 'normal', 7);
  col(doc, DARK);
  if (controllerOrg)  doc.text(controllerOrg,  M + 4, y + 20);
  if (controllerAddr) doc.text(String(controllerAddr).split(',')[0], M + 4, y + 26);
  doc.text('(nedan "Personuppgiftsansvarig")', M + 4, y + 32);

  // Box B — processor
  const bx = M + halfW + 6;
  fill(doc, [247, 247, 252]);
  strk(doc, PALE);
  doc.roundedRect(bx, y, halfW, 36, 2, 2, 'FD');

  setf(doc, 'helvetica', 'bold', 6);
  col(doc, INDIGO);
  doc.text('PERSONUPPGIFTSBITRÄDE (PROCESSOR)', bx + 4, y + 6);
  setf(doc, 'helvetica', 'bold', 9);
  col(doc, BLACK);
  doc.text('Åkaren Sverige AB', bx + 4, y + 13);
  setf(doc, 'helvetica', 'normal', 7);
  col(doc, DARK);
  doc.text('Org.nr 559100-0001', bx + 4, y + 20);
  doc.text('Sveavägen 1, 111 57 Stockholm', bx + 4, y + 26);
  doc.text('(nedan "Personuppgiftsbiträdet")', bx + 4, y + 32);

  y += 42;
  hline(doc, y);
  y += 8;

  // ── Recital ───────────────────────────────────────────────────────────────────
  y = body(doc, y,
    'Parterna har ingått ett avtal om användning av Åkarens plattform för transporthantering ' +
    '("Huvudavtalet"). I samband med detta behandlar Personuppgiftsbiträdet personuppgifter ' +
    'för Personuppgiftsansvariges räkning. Detta avtal ("PBA") reglerar nämnda behandling ' +
    'i enlighet med artikel 28 i Europaparlamentets och rådets förordning (EU) 2016/679 (GDPR).',
    0,
  );
  y += 4;

  // ── Clauses ───────────────────────────────────────────────────────────────────
  y = clause(doc, y, 1, 'Behandlingens föremål och varaktighet', [
    '1.1  Personuppgiftsbiträdet behandlar personuppgifter under den tid Personuppgiftsansvarig ' +
    'innehar ett aktivt konto på plattformen.',
    '1.2  Vid avtalets upphörande raderas personuppgifter inom 30 dagar, om inte lagstiftning ' +
    '(t.ex. bokföringslagen) kräver längre lagringstid.',
  ]);

  y = clause(doc, y, 2, 'Behandlingens art och ändamål', [
    'Behandlingen sker uteslutande i syfte att tillhandahålla plattformens tjänster, däribland: ' +
    '(a) hantering av offerter och transportuppdrag; (b) kundkommunikation och offertdelning; ' +
    '(c) flotta- och förarhantering; (d) automatisk tolkning av offerttext; ' +
    '(e) prisanalys och rapportering; (f) faktura- och PDF-export.',
  ]);

  y = clause(doc, y, 3, 'Kategorier av registrerade och personuppgifter', [
    'Registrerade: Slutkunder, kontaktpersoner, förare och andra anställda hos ' +
    'Personuppgiftsansvarig.',
    'Kategorier av personuppgifter: Namn, e-postadress, telefonnummer, adressuppgifter, ' +
    'fordonsinformation (registreringsnummer), ekonomiska uppgifter kopplade till ' +
    'transporttjänster samt kommunikationshistorik.',
  ]);

  y = clause(doc, y, 4, 'Instruktioner och dokumentation', [
    '4.1  Personuppgiftsbiträdet behandlar personuppgifter enbart i enlighet med ' +
    'Personuppgiftsansvariges dokumenterade instruktioner, inklusive vad som anges i detta avtal.',
    '4.2  Om Personuppgiftsbiträdet anser att en instruktion strider mot tillämplig ' +
    'dataskyddslagstiftning ska detta omedelbart meddelas Personuppgiftsansvarig.',
  ]);

  y = clause(doc, y, 5, 'Säkerhetsåtgärder', [
    'Personuppgiftsbiträdet tillämpar följande tekniska och organisatoriska säkerhetsåtgärder ' +
    'i enlighet med artikel 32 GDPR: (a) TLS 1.3-kryptering för all datatransport; ' +
    '(b) kryptering av data i vila (AES-256); (c) lösenordshasning med bcrypt (kostnadsfaktor ≥ 10); ' +
    '(d) rollbaserad åtkomstkontroll (RBAC); (e) automatisk daglig säkerhetskopiering; ' +
    '(f) loggning och övervakning av systemhändelser.',
  ]);

  y = clause(doc, y, 6, 'Underbiträden', [
    '6.1  Följande underbiträden är godkända per avtalsdatum:',
    '   Hetzner Online GmbH — serverhosting inom EU/EES (Nürnberg, Deutschland).',
    '   Underleverantör för textbearbetning (USA). Dataöverföring sker under ' +
    'EU-kommissionens standardavtalsklausuler (SCC, 2021).',
    '6.2  Personuppgiftsbiträdet ska meddela planerade förändringar av underbiträden ' +
    'minst 30 dagar i förväg. Personuppgiftsansvarig har rätt att invända mot förändringar.',
  ]);

  y = clause(doc, y, 7, 'De registrerades rättigheter', [
    'Personuppgiftsbiträdet ska bistå Personuppgiftsansvarig med att uppfylla skyldigheten ' +
    'att besvara förfrågningar från registrerade om utövande av deras rättigheter enligt ' +
    'kapitel III GDPR (rätt till tillgång, rättelse, radering, begränsning, dataportabilitet ' +
    'och invändning), med beaktande av behandlingens art.',
  ]);

  y = clause(doc, y, 8, 'Incidenthantering', [
    'Personuppgiftsbiträdet ska utan onödigt dröjsmål, och om möjligt senast inom 48 timmar ' +
    'efter att ha fått kännedom om en personuppgiftsincident, underrätta ' +
    'Personuppgiftsansvarig. Underrättelsen ska innehålla de uppgifter som anges i ' +
    'artikel 33.3 GDPR i den mån de är tillgängliga.',
  ]);

  y = clause(doc, y, 9, 'Granskning och revision', [
    '9.1  Personuppgiftsbiträdet ska tillhandahålla all information som är nödvändig för ' +
    'att visa att skyldigheterna i artikel 28 GDPR uppfylls.',
    '9.2  Personuppgiftsbiträdet ska möjliggöra revisioner som utförs av ' +
    'Personuppgiftsansvarig eller av denne utsedd revisor, dock med skälig förvarning ' +
    'och med beaktande av konfidentialitetsåtaganden gentemot andra kunder.',
  ]);

  y = clause(doc, y, 10, 'Konfidentialitet', [
    'Personuppgiftsbiträdet säkerställer att de personer som är behöriga att behandla ' +
    'personuppgifter har åtagit sig att iaktta konfidentialitet eller omfattas av ' +
    'lämpliga lagstadgade sekretessåtaganden.',
  ]);

  y = clause(doc, y, 11, 'Tillämplig lag och tvistlösning', [
    'Svensk rätt tillämpas på detta avtal. Tvister som uppstår i anledning av detta avtal ' +
    'ska slutligt avgöras av Stockholms tingsrätt som första instans.',
  ]);

  // ── Signature block ───────────────────────────────────────────────────────────
  if (y > PH - 60) { doc.addPage(); y = M + 10; }

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
    `Personuppgiftsansvarig godkände detta avtal digitalt den ${acceptedDate}` +
    (user?.name ? ` av ${user.name}` : '') + '.',
    M, y,
  );
  y += 5;
  doc.text(
    'Personuppgiftsbiträdet undertecknar genom tillgängliggörandet av plattformen och ' +
    'dess tjänster enligt Huvudavtalet.',
    M, y,
  );
  y += 12;

  const sigW = (CW - 10) / 2;

  // PA sig line
  strk(doc, PALE); doc.setLineWidth(0.3); doc.line(M, y, M + sigW, y);
  y += 4;
  setf(doc, 'helvetica', 'normal', 6.5); col(doc, MID);
  doc.text(controllerName, M, y);
  y += 3.5;
  doc.text(acceptedDate + (user?.name ? `  ·  ${user.name}` : ''), M, y);

  // PB sig line
  const sx = M + sigW + 10;
  strk(doc, PALE); doc.setLineWidth(0.3); doc.line(sx, y - 7.5, sx + sigW, y - 7.5);
  setf(doc, 'helvetica', 'normal', 6.5); col(doc, MID);
  doc.text('Åkaren Sverige AB', sx, y - 3.5);
  doc.text('Digitalt signerat via plattform', sx, y);

  // ── Footer on each page ───────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    strk(doc, PALE); doc.setLineWidth(0.25);
    doc.line(M, PH - 14, PW - M, PH - 14);
    setf(doc, 'helvetica', 'normal', 5.5); col(doc, LIGHT);
    doc.text(
      'Åkaren Sverige AB  ·  Org.nr 559100-0001  ·  info@akaren.se  ·  Konfidentiellt',
      M, PH - 9,
    );
    doc.text(`Sida ${p} av ${totalPages}`, PW - M, PH - 9, { align: 'right' });
  }

  doc.save('Personuppgiftsbitradesavtal-Akaren.pdf');
}
