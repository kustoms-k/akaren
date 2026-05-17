export async function generateMockQuote(inquiryText) {
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const text = inquiryText.toLowerCase();

  // ── Cargo type ────────────────────────────────────────────────────────────
  let lasttyp = 'Godstransport';
  if      (text.includes('grävmaskin') || text.includes('excavator')) lasttyp = 'Grävmaskin';
  else if (text.includes('kran')       || text.includes('crane'))     lasttyp = 'Kranlyft';
  else if (text.includes('container'))                                 lasttyp = 'Containertransport';
  else if (text.includes('betong')     || text.includes('concrete'))  lasttyp = 'Betongtransport';
  else if (text.includes('båt')        || text.includes('boat'))      lasttyp = 'Båttransport';

  // ── Weight ────────────────────────────────────────────────────────────────
  const weightMatch = inquiryText.match(/(\d+(?:[.,]\d+)?)\s*ton/i);
  const viktnr = weightMatch ? parseFloat(weightMatch[1].replace(',', '.')) : 8;
  const vikt = `${viktnr} ton`;

  // ── Pickup / delivery ─────────────────────────────────────────────────────
  let upphämtning = 'Stockholm Centrum';
  let leverans    = 'Stockholms län';
  let lez_zon     = null;

  if      (text.includes('hornsgatan'))  { upphämtning = 'Hornsgatan, Stockholm';  lez_zon = 'Södermalm';  }
  else if (text.includes('kungsholmen')) { upphämtning = 'Kungsholmen, Stockholm'; lez_zon = 'Kungsholmen'; }
  else if (text.includes('södermalm'))  { upphämtning = 'Södermalm, Stockholm';   lez_zon = 'Södermalm';  }
  else if (text.includes('norrmalm'))   { upphämtning = 'Norrmalm, Stockholm';    lez_zon = 'Norrmalm';   }
  else if (text.includes('östermalm'))  { upphämtning = 'Östermalm, Stockholm';   lez_zon = 'Östermalm';  }
  else if (text.includes('vasastan'))   { upphämtning = 'Vasastan, Stockholm';    lez_zon = 'Vasastan';   }
  else if (text.includes('gamla stan')) { upphämtning = 'Gamla Stan, Stockholm';  lez_zon = 'Gamla Stan'; }

  if      (text.includes('nacka'))       leverans = 'Nacka';
  else if (text.includes('södertälje')) leverans = 'Södertälje';
  else if (text.includes('solna'))       leverans = 'Solna';
  else if (text.includes('huddinge'))    leverans = 'Huddinge';
  else if (text.includes('järfälla'))    leverans = 'Järfälla';

  // ── LEZ warning ───────────────────────────────────────────────────────────
  const lezKeywords = ['hornsgatan', 'kungsholmen', 'södermalm', 'norrmalm', 'östermalm', 'gamla stan', 'vasastan'];
  const lez_varning = lezKeywords.some((k) => text.includes(k));
  if (!lez_varning) lez_zon = null;

  // ── Permit required ───────────────────────────────────────────────────────
  const tillstånd_krävs = viktnr > 10 || text.includes('bred') || text.includes('lång');

  // ── Vehicle recommendation ────────────────────────────────────────────────
  let fordon_rekommenderat = 'KEM-02 · Scania R 500 · Lastväxlare';
  if      (lasttyp === 'Grävmaskin' || lasttyp === 'Kranlyft') fordon_rekommenderat = 'KEM-01 · Volvo FH 540 · Kranbilar';
  else if (lasttyp === 'Containertransport')                    fordon_rekommenderat = 'KEM-06 · Scania G 410 · Containerbil';

  // ── Pricing ───────────────────────────────────────────────────────────────
  const avstand_km        = Math.floor(Math.random() * 30) + 15;
  const bränsle_kostnad   = Math.round((avstand_km * 0.45 * 18.40) / 50) * 50;
  const arbetstid_timmar  = Math.floor(Math.random() * 3) + 2;
  const arbetstid_kostnad = arbetstid_timmar * 750;
  const totalpris_sek     = Math.round((bränsle_kostnad + arbetstid_kostnad + 3500) / 100) * 100;

  // ── Date ──────────────────────────────────────────────────────────────────
  const dateMatch = inquiryText.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/);
  const datum = dateMatch ? dateMatch[0] : null;

  // ── Contact extraction ────────────────────────────────────────────────────
  const signatureMatch = inquiryText.match(/(?:Med vänliga hälsningar|Mvh)[,\s]+([^\n]+)/i);
  const kund_namn = signatureMatch ? signatureMatch[1].trim() : null;

  const emailMatch = inquiryText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const kund_email = emailMatch ? emailMatch[0] : null;

  const phoneMatch = inquiryText.match(/07[0-9][\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
  const kund_telefon = phoneMatch ? phoneMatch[0] : null;

  // ── Notes ─────────────────────────────────────────────────────────────────
  const notes = [];
  if (lez_varning)      notes.push(`Leverans inom LEZ-zon (${lez_zon}) — kontrollera fordonets utsläppsklass.`);
  if (tillstånd_krävs)  notes.push('Tungt eller brett gods — tillstånd kan krävas.');
  const noteringar = notes.join(' ') || null;

  return {
    lasttyp,
    vikt,
    upphämtning,
    leverans,
    datum,
    fordon_rekommenderat,
    avstand_km,
    bränsle_kostnad,
    arbetstid_timmar,
    arbetstid_kostnad,
    lez_varning,
    lez_zon,
    'tillstånd_krävs': tillstånd_krävs,
    totalpris_sek,
    kund_namn,
    kund_email,
    kund_telefon,
    noteringar,
    confidence: 'high',
  };
}
