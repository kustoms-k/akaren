export async function generateMockQuote(inquiryText) {
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const text = inquiryText.toLowerCase();

  // ── Cargo type ────────────────────────────────────────────────────────────
  let lasttyp = 'Godstransport';
  if      (text.includes('grävmaskin') || text.includes('bandgrävare') || text.includes('excavator')) lasttyp = 'Grävmaskin';
  else if (text.includes('kran')       || text.includes('crane'))                                     lasttyp = 'Kranlyft';
  else if (text.includes('container'))                                                                 lasttyp = 'Containertransport';
  else if (text.includes('betong')     || text.includes('concrete'))                                  lasttyp = 'Betongtransport';
  else if (text.includes('båt')        || text.includes('boat'))                                      lasttyp = 'Båttransport';

  // ── Weight ────────────────────────────────────────────────────────────────
  const weightMatch = text.match(/(\d+(?:[.,]\d+)?)\s*ton/);
  const viktnr = weightMatch ? parseFloat(weightMatch[1].replace(',', '.')) : 8;
  const vikt = `${viktnr} ton`;
  const isHeavy = viktnr > 10;

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

  if      (text.includes('nacka'))      leverans = 'Nacka';
  else if (text.includes('södertälje')) leverans = 'Södertälje';
  else if (text.includes('solna'))      leverans = 'Solna';
  else if (text.includes('huddinge'))   leverans = 'Huddinge';
  else if (text.includes('järfälla'))   leverans = 'Järfälla';

  // ── LEZ warning ───────────────────────────────────────────────────────────
  const lezKeywords = ['hornsgatan', 'kungsholmen', 'södermalm', 'norrmalm', 'östermalm', 'gamla stan', 'vasastan'];
  const lez_varning = lezKeywords.some((k) => text.includes(k));
  if (!lez_varning) lez_zon = null;

  // ── Permit required ───────────────────────────────────────────────────────
  const tillstånd_krävs = isHeavy || text.includes('bred') || text.includes('lång');

  // ── Vehicle recommendation — heavy load always gets KEM-01 ────────────────
  let fordon_rekommenderat;
  if (isHeavy || lasttyp === 'Grävmaskin' || lasttyp === 'Kranlyft') {
    fordon_rekommenderat = 'KEM-01 · Volvo FH 540 · Kranbilar';
  } else if (lasttyp === 'Containertransport') {
    fordon_rekommenderat = 'KEM-06 · Scania G 410 · Containerbil';
  } else {
    fordon_rekommenderat = 'KEM-02 · Scania R 500 · Lastväxlare';
  }

  const usingKEM01 = fordon_rekommenderat.includes('KEM-01');

  // ── Distance ──────────────────────────────────────────────────────────────
  let avstand_km;
  if      (text.includes('södertälje')) avstand_km = 38;
  else if (text.includes('nacka'))      avstand_km = 22;
  else if (leverans === 'Stockholms län') avstand_km = 15;
  else    avstand_km = Math.floor(Math.random() * 26) + 20;

  // ── Pricing ───────────────────────────────────────────────────────────────
  const base_rate         = isHeavy ? 8500 : 2500;
  const bränsle_kostnad   = Math.round((avstand_km * 2.8 * 18.40) / 100) * 100;
  const arbetstid_timmar  = isHeavy ? 4 : Math.floor(Math.random() * 3) + 2;
  const timRate           = usingKEM01 ? 850 : 750;
  const arbetstid_kostnad = arbetstid_timmar * timRate;
  const loading_kostnad   = (text.includes('lastning') || text.includes('loading')) ? 1500 : 0;
  const totalpris_sek     = Math.round((base_rate + bränsle_kostnad + arbetstid_kostnad + loading_kostnad) / 500) * 500;

  // ── Date ──────────────────────────────────────────────────────────────────
  const dateMatch = text.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/);
  const datum = dateMatch ? dateMatch[0] : null;

  // ── Contact extraction ────────────────────────────────────────────────────
  const signatureMatch = inquiryText.match(/(?:Med vänliga hälsningar|Mvh)[,\s]+([^\n]+)/i);
  const kund_namn = signatureMatch ? signatureMatch[1].trim() : null;

  const emailMatch = inquiryText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const kund_email = emailMatch ? emailMatch[0] : null;

  const phoneMatch = text.match(/07[0-9][\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/);
  const kund_telefon = phoneMatch ? phoneMatch[0] : null;

  // ── Notes ─────────────────────────────────────────────────────────────────
  const notes = [];
  if (lez_varning)     notes.push(`Leverans inom LEZ-zon (${lez_zon}) — kontrollera fordonets utsläppsklass.`);
  if (tillstånd_krävs) notes.push('Tungt eller brett gods — tillstånd kan krävas.');
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
    loading_kostnad: loading_kostnad || undefined,
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
