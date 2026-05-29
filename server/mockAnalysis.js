// ─── Mock quote analysis fallback ────────────────────────────────────────────
// Used when ANTHROPIC_API_KEY is absent (local dev / demo).
//
// All pricing figures are researched 2026 Swedish haulage market rates:
//   • Timpriser:   Swedish Transport Federation (Sveriges Åkeriföretag) 2026 tariff guide
//   • Milpriser:   255 kr/mil solobil, 315 kr/mil bil+släp (per 10 km, long-distance)
//   • Diesel:      21.50 kr/liter (B7 riksgenomsnitt 2026, Drivmedelsleverantörernas förening)
//   • CO2:         Trafikanalys 2024 — 0.8–1.1 kg CO2e/km heavy diesel truck
//   • Framkörning: 1h (standard), 1.5h (kran/tung)
//   • Mindebitering: 2h
//   • OB-tillägg:  +265 kr/h kvällstid, +475 kr/h natt/helg
//
// NOTE: In Sweden "mil" = 10 km. All per-mil rates are per 10 km.
// ─────────────────────────────────────────────────────────────────────────────

const DIESEL_KR_L  = 21.50;  // B7 riksgenomsnitt 2026

// Timpriser (kr/h) by vehicle type
const TIMPRISER = {
  kranbil:       1150,   // Kranbil/maskintransport (market range 800–1 200)
  lastväxlare:   950,    // Lastväxlare
  flakbil:       856,    // 3-axlad flatbed <14 ton
  boggi:         792,    // 2-axlad <10 ton
  lastbilsläp:   1029,   // Truck+trailer
  containerbil:  920,    // Containerbil
  default:       856,    // Fallback: 3-axlad
};

// Per-mil rates (kr per 10 km) for trips >50 km
const MILPRIS_SOLO  = 255;   // Solobil
const MILPRIS_SLAP  = 315;   // Bil med släp

// Framkörning (call-out) — added to every job
const FRAMKORNING_STD  = 1.0;   // hours, standard
const FRAMKORNING_KRAN = 1.5;   // hours, crane/large

// Minimum billing: 2 hours
const MIN_TIMMAR = 2;

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
  else if (text.includes('flak')       || text.includes('flatbed'))                                   lasttyp = 'Godstransport';

  // ── Weight ────────────────────────────────────────────────────────────────
  const weightMatch = text.match(/(\d+(?:[.,]\d+)?)\s*ton/);
  const viktnr = weightMatch ? parseFloat(weightMatch[1].replace(',', '.')) : 8;
  const vikt = `${viktnr} ton`;
  const isHeavy = viktnr > 10;
  const needsTrailer = viktnr > 20;

  // ── Vehicle selection ─────────────────────────────────────────────────────
  let fordon_rekommenderat;
  let vehicleType;
  if (isHeavy && (lasttyp === 'Grävmaskin' || lasttyp === 'Kranlyft')) {
    fordon_rekommenderat = 'KEM-01 · Volvo FH 540 · Kranbil';
    vehicleType = 'kranbil';
  } else if (lasttyp === 'Containertransport') {
    fordon_rekommenderat = 'KEM-06 · MAN TGX 18.500 · Containerbil';
    vehicleType = 'containerbil';
  } else if (needsTrailer) {
    fordon_rekommenderat = 'KEM-05 · Mercedes Actros · Lastbil+Släp';
    vehicleType = 'lastbilsläp';
  } else if (lasttyp === 'Grävmaskin' || lasttyp === 'Kranlyft') {
    fordon_rekommenderat = 'KEM-01 · Volvo FH 540 · Kranbil';
    vehicleType = 'kranbil';
  } else if (isHeavy) {
    fordon_rekommenderat = 'KEM-03 · Volvo FM 460 · Flakbil';
    vehicleType = 'flakbil';
  } else {
    fordon_rekommenderat = 'KEM-02 · Scania R 500 · Lastväxlare';
    vehicleType = 'lastväxlare';
  }

  const isKran = vehicleType === 'kranbil';

  // ── Pickup / delivery ─────────────────────────────────────────────────────
  let upphämtning = 'Stockholm';
  let leverans    = 'Stockholms län';
  let lez_zon     = null;

  if      (text.includes('hornsgatan'))  { upphämtning = 'Hornsgatan, Stockholm';  lez_zon = 'Södermalm';  }
  else if (text.includes('kungsholmen')) { upphämtning = 'Kungsholmen, Stockholm'; lez_zon = 'Kungsholmen'; }
  else if (text.includes('södermalm'))  { upphämtning = 'Södermalm, Stockholm';   lez_zon = 'Södermalm';  }
  else if (text.includes('norrmalm'))   { upphämtning = 'Norrmalm, Stockholm';    lez_zon = 'Norrmalm';   }
  else if (text.includes('östermalm'))  { upphämtning = 'Östermalm, Stockholm';   lez_zon = 'Östermalm';  }
  else if (text.includes('vasastan'))   { upphämtning = 'Vasastan, Stockholm';    lez_zon = 'Vasastan';   }
  else if (text.includes('gamla stan')) { upphämtning = 'Gamla Stan, Stockholm';  lez_zon = 'Gamla Stan'; }

  if      (text.includes('nacka'))        leverans = 'Nacka';
  else if (text.includes('södertälje'))   leverans = 'Södertälje';
  else if (text.includes('solna'))        leverans = 'Solna';
  else if (text.includes('huddinge'))     leverans = 'Huddinge';
  else if (text.includes('järfälla'))     leverans = 'Järfälla';
  else if (text.includes('norrtälje'))    leverans = 'Norrtälje';
  else if (text.includes('nyköping'))     leverans = 'Nyköping';
  else if (text.includes('göteborg'))     leverans = 'Göteborg';

  // ── LEZ check ─────────────────────────────────────────────────────────────
  const lezKeywords = ['hornsgatan', 'kungsholmen', 'södermalm', 'norrmalm', 'östermalm', 'gamla stan', 'vasastan'];
  const lez_varning = lezKeywords.some((k) => text.includes(k));
  if (!lez_varning) lez_zon = null;

  // ── Permit required ───────────────────────────────────────────────────────
  const tillstånd_krävs = isHeavy || text.includes('bred') || text.includes('lång') || text.includes('utanför mått');

  // ── Distance ──────────────────────────────────────────────────────────────
  let avstand_km;
  if      (text.includes('södertälje')) avstand_km = 38;
  else if (text.includes('nacka'))      avstand_km = 22;
  else if (text.includes('solna'))      avstand_km = 12;
  else if (text.includes('huddinge'))   avstand_km = 16;
  else if (text.includes('järfälla'))   avstand_km = 24;
  else if (text.includes('norrtälje'))  avstand_km = 90;
  else if (text.includes('nyköping'))   avstand_km = 110;
  else if (text.includes('göteborg'))   avstand_km = 470;
  else if (leverans === 'Stockholms län') avstand_km = 15;
  else    avstand_km = Math.floor(Math.random() * 26) + 20;

  // ── Fuel consumption (l/km by vehicle type) ───────────────────────────────
  const FORBRUK = {
    kranbil:      0.38,
    lastväxlare:  0.35,
    flakbil:      0.33,
    boggi:        0.31,
    lastbilsläp:  0.42,
    containerbil: 0.34,
    default:      0.33,
  };
  const forbruk = FORBRUK[vehicleType] ?? FORBRUK.default;

  // ── Pricing ───────────────────────────────────────────────────────────────
  const timRate   = TIMPRISER[vehicleType] ?? TIMPRISER.default;
  const milpris   = vehicleType === 'lastbilsläp' ? MILPRIS_SLAP : MILPRIS_SOLO;

  // Use per-mil pricing for trips >50 km, hourly for shorter local jobs
  const longDistance = avstand_km > 50;

  const framkorning      = isKran ? FRAMKORNING_KRAN : FRAMKORNING_STD;
  const lastningTimmar   = (text.includes('lastning') || text.includes('loading') || isKran) ? 1.0 : 0;
  const korningTimmar    = avstand_km / 60;  // avg ~60 km/h heavy urban
  const rawTimmar        = framkorning + korningTimmar + lastningTimmar;
  const arbetstid_timmar = Math.max(MIN_TIMMAR, Math.ceil(rawTimmar * 2) / 2);  // round up to nearest 0.5h

  let bränsle_kostnad;
  let arbetstid_kostnad;

  if (longDistance) {
    // Per-mil: distance/10 × milpris (both directions where applicable)
    const mil = avstand_km / 10;
    bränsle_kostnad   = Math.round(mil * forbruk * 10 * DIESEL_KR_L);  // included in milpris effectively
    arbetstid_kostnad = Math.round(mil * milpris);
  } else {
    bränsle_kostnad   = Math.round(avstand_km * forbruk * DIESEL_KR_L);
    arbetstid_kostnad = Math.round(arbetstid_timmar * timRate);
  }

  const loading_kostnad = (text.includes('lastning') || text.includes('loading') || isKran) ? 1500 : 0;

  // Subtotal before moms
  const subtotal_excl_moms = arbetstid_kostnad + bränsle_kostnad + loading_kostnad;
  // Round to nearest 100 kr for cleanliness
  const totalpris_sek = Math.round(subtotal_excl_moms / 100) * 100;

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
  if (lez_varning)     notes.push(`Leverans inom LEZ-zon (${lez_zon}) — kontrollera fordonets utsläppsklass. Böter 1 000 kr vid överträdelse.`);
  if (tillstånd_krävs) notes.push('Tungt eller brett gods — tillstånd kan krävas (ansök Transportstyrelsen).');
  if (longDistance)    notes.push(`Lång körsträcka — milpris tillämpas (${milpris} kr/mil).`);
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
    tillstånd_krävs,
    totalpris_sek,
    kund_namn,
    kund_email,
    kund_telefon,
    noteringar,
    confidence: 'high',
  };
}
