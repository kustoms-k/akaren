import { Router }   from 'express';
import Anthropic          from '@anthropic-ai/sdk';
import db                from '../db.js';
import { getActiveFleet } from '../lib/fleet.js';

const router = Router();
const client = new Anthropic();

const MODEL          = 'claude-sonnet-4-20250514';
const PROMPT_VERSION = '2026-05-v2';

const CONFIDENCE_FIELDS = [
  'lasttyp', 'upphämtning', 'leverans', 'datum',
  'fordon_rekommenderat', 'avstand_km', 'totalpris_sek',
];

const FALLBACK_DIESEL = 18.50;

const getLatestFuelPrice = db.prepare(
  'SELECT price_per_litre FROM fuel_price_cache ORDER BY id DESC LIMIT 1'
);
const getLatestWeather = db.prepare(
  'SELECT temp_c, condition_sv, is_winter FROM weather_cache ORDER BY id DESC LIMIT 1'
);
const stmtFleetJobs = db.prepare(`
  SELECT q.fordon_id, q.totalpris_sek, q.avstand_km
  FROM jobs j
  JOIN quotes q ON q.id = j.quote_id
  WHERE strftime('%Y-%m', j.created_at) = ?
    AND q.fordon_id IS NOT NULL
    AND j.company_id = ?
`);
const stmtSaveExtraction = db.prepare(`
  INSERT INTO ai_extractions
    (company_id, raw_inquiry, system_prompt_version, model_used, raw_response, extracted_fields, confidence_scores)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function hoursEst(km) { return (Number(km) || 0) / 70 + 1.5; }

function buildFleetStatsBlock(companyId, lang) {
  try {
    const fleet = getActiveFleet(companyId);
    const month = new Date().toISOString().slice(0, 7);
    const rows  = stmtFleetJobs.all(month, companyId);

    const revenue = {}, cost = {}, hours = {};
    for (const r of rows) {
      const v   = fleet.find((f) => f.id.toUpperCase() === String(r.fordon_id).toUpperCase());
      const key = v ? v.id : r.fordon_id;
      const km  = Number(r.avstand_km) || 0;
      const h   = hoursEst(km);
      const c   = v ? v.startavgift_sek + v.priskm_sek * km + v.timkostnad_sek * h : 0;
      revenue[key] = (revenue[key] ?? 0) + (Number(r.totalpris_sek) || 0);
      cost[key]    = (cost[key]    ?? 0) + c;
      hours[key]   = (hours[key]   ?? 0) + h;
    }

    if (lang === 'en') {
      const lines = fleet.map((v) => {
        const h   = hours[v.id];
        const pph = h ? Math.round(((revenue[v.id] ?? 0) - (cost[v.id] ?? 0)) / h) : null;
        const hrs = h ? (Math.round(h * 10) / 10) : 0;
        return pph != null
          ? `${v.id} (${v.namn}, ${v.typ}): ${pph} kr/hr profit — ${hrs} hrs this month`
          : `${v.id} (${v.namn}, ${v.typ}): no data this month`;
      }).join('\n');
      return `

Fleet profitability this month (${month}):
${lines}

Vehicle selection rule for fordon_rekommenderat: Choose the vehicle that (1) meets the load requirements (cargo type, weight, LEZ zone, permits) AND (2) has the highest profit per hour above. If a vehicle has no data, select based on suitability for the load.
In the fordon_orsak field: write exactly one line in the format "[VEHICLE-ID] valt — [reason in Swedish] / [VEHICLE-ID] chosen — [reason in English]"
Example: "KEM-05 valt — högst vinst per timme för kranlaster denna månad / KEM-05 chosen — highest profit per hour for crane loads this month"`;
    }

    const lines = fleet.map((v) => {
      const h   = hours[v.id];
      const pph = h ? Math.round(((revenue[v.id] ?? 0) - (cost[v.id] ?? 0)) / h) : null;
      const hrs = h ? (Math.round(h * 10) / 10) : 0;
      return pph != null
        ? `${v.id} (${v.namn}, ${v.typ}): ${pph} kr/tim vinst — ${hrs} tim denna månad`
        : `${v.id} (${v.namn}, ${v.typ}): inga data denna månad`;
    }).join('\n');

    return `

Flottans lönsamhet denna månad (${month}):
${lines}

Rekommendationsregel för fordon_rekommenderat: Välj det fordon som (1) uppfyller lastens krav (lasttyp, vikt, LEZ-zon, tillstånd) OCH (2) har högst vinst per timme enligt ovan. Om ett fordon saknar data, välj baserat på lämplighet för lasten.
I fältet fordon_orsak: skriv exakt en rad med formatet "[FORDON-ID] valt — [anledning på svenska] / [VEHICLE-ID] chosen — [anledning på engelska]"
Exempel: "KEM-05 valt — högst vinst per timme för kranlaster denna månad / KEM-05 chosen — highest profit per hour for crane loads this month"`;
  } catch {
    return '';
  }
}

function buildSystemPrompt(dieselPriceSek, weatherRow, companyId, lang) {
  const fleetStats = buildFleetStatsBlock(companyId, lang);

  if (lang === 'en') {
    const weatherLine = weatherRow?.is_winter
      ? `\nWeather Stockholm: ${weatherRow.temp_c}°C, ${weatherRow.condition_sv}. Winter conditions — include a weather surcharge (5–15% of base price) in the total and mention it briefly in the noteringar field.`
      : '';

    return `You are a Swedish freight transport assistant for a haulage company in Stockholm.
Current diesel price: ${dieselPriceSek.toFixed(2)} SEK/litre. Use this for fuel cost calculations.${weatherLine}${fleetStats}

Read the customer inquiry and return ONLY a valid JSON object with exactly these fields.

For seven fields return an object with "value" and "confidence".
Confidence levels:
- "high"   = information clear and complete
- "medium" = approximate or partially missing
- "low"    = AI is guessing (vague address, unclear date, unknown cargo type)
- "none"   = information entirely absent — set value to null

Rules per confidence field:
- lasttyp:              high = clearly stated, medium = described but imprecise, low = vague, none = not mentioned
- upphämtning:          high = full street address, medium = district/street without number, low = city only, none = missing entirely
- leverans:             same rules as upphämtning
- datum:                high = specific date, medium = relative ("next Monday"), low = vague ("soon"), none = not mentioned
- fordon_rekommenderat: high = cargo/weight matches clearly, medium = approximate match, low = cargo type unclear, none = impossible to determine
- avstand_km:           high = both addresses precise, medium = one address approximate, low = addresses vague, none = addresses missing
- totalpris_sek:        high = all components certain, medium = something uncertain, low = many factors unclear, none = cannot be calculated

IMPORTANT: If confidence is "none", set value to null — never return a guessed value for none fields.

Return EXACTLY this JSON format:

{
  "lasttyp": { "value": "cargo type", "confidence": "high" },
  "vikt": "weight in kg or tonnes",
  "upphämtning": { "value": "pickup address", "confidence": "high" },
  "leverans": { "value": "delivery address", "confidence": "high" },
  "datum": { "value": "transport date", "confidence": "high" },
  "fordon_rekommenderat": { "value": "recommended vehicle ID from fleet", "confidence": "high" },
  "avstand_km": { "value": 0, "confidence": "high" },
  "bränsle_kostnad": 0,
  "arbetstid_timmar": 0,
  "arbetstid_kostnad": 0,
  "lez_varning": false,
  "lez_zon": null,
  "tillstånd_krävs": false,
  "totalpris_sek": { "value": 0, "confidence": "high" },
  "noteringar": "any notes",
  "fordon_orsak": "[VEHICLE-ID] valt — [reason in Swedish] / [VEHICLE-ID] chosen — [reason in English]"
}

Rules:
- lez_varning: set to true if any address is in Södermalm, Norrmalm, Östermalm, Kungsholmen or Gamla Stan in Stockholm
- lez_zon: name of the zone (e.g. "Södermalm") if lez_varning is true, otherwise null
- tillstånd_krävs: set to true if the load is oversized or weighs over 10 tonnes
- bränsle_kostnad: calculate using ${dieselPriceSek.toFixed(2)} SEK/litre and approx 0.35–0.50 l/km for truck, 0.12–0.20 l/km for van
- No markdown, no explanations, no code blocks — only the raw JSON object`;
  }

  const weatherLine = weatherRow?.is_winter
    ? `\nVäder Stockholm: ${weatherRow.temp_c}°C, ${weatherRow.condition_sv}. Vinterförhållanden råder — inkludera ett vädertillägg (5–15% av grundpriset) i totalpriset och nämn det kortfattat i noteringar-fältet.`
    : '';

  return `Du är en svensk transportassistent för ett åkeri i Stockholm.
Aktuellt dieselpris: ${dieselPriceSek.toFixed(2)} kr/liter. Använd detta pris för bränslekostnadsberäkningar.${weatherLine}${fleetStats}

Läs kundens förfrågan och returnera ENDAST ett giltigt JSON-objekt med exakt dessa fält.

För sju av fälten returnerar du ett objekt med "value" och "confidence".
Confidence-nivåer:
- "high"   = information tydlig och fullständig
- "medium" = ungefärlig eller delvis saknas
- "low"    = AI gissar (vag adress, oklart datum, okänd lasttyp)
- "none"   = information saknas helt — sätt value till null

Regler per confidence-fält:
- lasttyp:              high = tydligt angiven, medium = beskriven men oprecis, low = vag, none = nämns ej
- upphämtning:          high = fullständig gatuadress, medium = stadsdel/gata utan nr, low = bara stad, none = saknas helt
- leverans:             samma regler som upphämtning
- datum:                high = specifikt datum, medium = relativt ("nästa måndag"), low = vagt ("snart"), none = nämns ej
- fordon_rekommenderat: high = last/vikt matchar tydligt, medium = ungefärlig matchning, low = lasttyp oklar, none = omöjlig att avgöra
- avstand_km:           high = båda adresser precisa, medium = en adress ungefärlig, low = adresser vaga, none = adresser saknas
- totalpris_sek:        high = alla komponenter säkra, medium = något osäkert, low = många faktorer oklara, none = kan inte beräknas

VIKTIGT: Om confidence är "none", sätt value till null — returnera aldrig ett gissat värde för none-fält.

Returnera EXAKT detta JSON-format:

{
  "lasttyp": { "value": "typ av gods", "confidence": "high" },
  "vikt": "vikt i kg eller ton",
  "upphämtning": { "value": "upphämtningsadress", "confidence": "high" },
  "leverans": { "value": "leveransadress", "confidence": "high" },
  "datum": { "value": "datum för transporten", "confidence": "high" },
  "fordon_rekommenderat": { "value": "rekommenderat fordon-ID från flottan", "confidence": "high" },
  "avstand_km": { "value": 0, "confidence": "high" },
  "bränsle_kostnad": 0,
  "arbetstid_timmar": 0,
  "arbetstid_kostnad": 0,
  "lez_varning": false,
  "lez_zon": null,
  "tillstånd_krävs": false,
  "totalpris_sek": { "value": 0, "confidence": "high" },
  "noteringar": "eventuella noteringar",
  "fordon_orsak": "[FORDON-ID] valt — [anledning på svenska] / [VEHICLE-ID] chosen — [reason in English]"
}

Regler:
- lez_varning: sätt till true om någon adress finns i Södermalm, Norrmalm, Östermalm, Kungsholmen eller Gamla Stan i Stockholm
- lez_zon: namnet på zonen (t.ex. "Södermalm") om lez_varning är true, annars null
- tillstånd_krävs: sätt till true om lasten är överdimensionerad eller väger över 10 ton
- bränsle_kostnad: beräkna med ${dieselPriceSek.toFixed(2)} kr/liter och ca 0.35–0.50 liter/km för lastbil, 0.12–0.20 liter/km för skåpbil
- Inga markdown, inga förklaringar, inga kodblock — bara JSON-objektet direkt`;
}

router.post('/', async (req, res) => {
  const { inquiry, lang = 'sv' } = req.body;
  if (!inquiry) return res.status(400).json({ error: 'inquiry saknas' });

  const fuelRow     = getLatestFuelPrice.get();
  const dieselPrice = fuelRow?.price_per_litre ?? FALLBACK_DIESEL;
  const weatherRow  = getLatestWeather.get() ?? null;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = client.messages.stream({
      model:      MODEL,
      max_tokens: 1024,
      system:     buildSystemPrompt(dieselPrice, weatherRow, req.companyId, lang),
      messages:   [{ role: 'user', content: inquiry }],
    });

    let full = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        full += event.delta.text;
        res.write(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`);
      }
    }

    // Parse + persist to ai_extractions
    let extractionId = null;
    try {
      const match = full.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed          = JSON.parse(match[0]);
        const extractedFields = { ...parsed };
        const confidenceScores = {};
        for (const key of CONFIDENCE_FIELDS) {
          if (parsed[key] && typeof parsed[key] === 'object' && 'value' in parsed[key]) {
            extractedFields[key] = parsed[key].value;
            confidenceScores[key] = parsed[key].confidence;
          }
        }
        const result = stmtSaveExtraction.run(
          req.companyId,
          inquiry,
          PROMPT_VERSION,
          MODEL,
          full,
          JSON.stringify(extractedFields),
          JSON.stringify(confidenceScores),
        );
        extractionId = result.lastInsertRowid;
      }
    } catch (saveErr) {
      console.error('[ai_extractions] save failed:', saveErr.message);
    }

    if (extractionId) {
      res.write(`data: ${JSON.stringify({ extraction_id: extractionId, model: MODEL })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[analyse] Anthropic API error:');
    console.error('  message:', err.message);
    console.error('  status: ', err.status ?? err.statusCode ?? 'n/a');
    console.error('  stack:  ', err.stack);
    // If headers already sent (streaming started), send error event and close
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message || 'API call failed' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message || 'API call failed' });
    }
  }
});

export default router;
