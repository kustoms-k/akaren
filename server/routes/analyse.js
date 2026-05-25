import { Router } from 'express';
import Anthropic   from '@anthropic-ai/sdk';
import { generateMockQuote } from '../mockAnalysis.js';

const router = Router();

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ── Tool definition for structured extraction ──────────────────────────────
const EXTRACT_TOOL = {
  name: 'extract_transport_quote',
  description: 'Extract all structured fields from a Swedish transport inquiry message.',
  input_schema: {
    type: 'object',
    properties: {
      lasttyp: {
        type: 'string',
        description: 'Cargo / transport type in Swedish. E.g. Godstransport, Grävmaskin, Kranlyft, Containertransport, Betongtransport, Båttransport.',
      },
      vikt: {
        type: 'string',
        description: 'Weight as a string, e.g. "8 ton" or "12,5 ton".',
      },
      upphämtning: {
        type: 'string',
        description: 'Pickup address or location in Sweden.',
      },
      leverans: {
        type: 'string',
        description: 'Delivery address or location in Sweden.',
      },
      datum: {
        type: 'string',
        description: 'Requested date in ISO 8601 format (YYYY-MM-DD) or null.',
      },
      avstand_km: {
        type: 'number',
        description: 'Estimated road distance in kilometres between pickup and delivery.',
      },
      fordon_rekommenderat: {
        type: 'string',
        description: 'Recommended vehicle from the fleet, e.g. "KEM-01 · Volvo FH 540 · Kranbilar".',
      },
      bränsle_kostnad: {
        type: 'number',
        description: 'Fuel cost in SEK (avstand_km × 2 × fuel_price_per_km).',
      },
      arbetstid_timmar: {
        type: 'number',
        description: 'Estimated job hours.',
      },
      arbetstid_kostnad: {
        type: 'number',
        description: 'Labour cost in SEK.',
      },
      totalpris_sek: {
        type: 'number',
        description: 'Recommended total price in SEK rounded to nearest 500.',
      },
      lez_varning: {
        type: 'boolean',
        description: 'True if the pickup or delivery is inside Stockholm LEZ zones (Södermalm, Norrmalm, Östermalm, Kungsholmen, Gamla Stan, Vasastan, Hornsgatan).',
      },
      lez_zon: {
        type: 'string',
        description: 'Name of the LEZ zone if lez_varning is true, else null.',
      },
      tillstand_kravs: {
        type: 'boolean',
        description: 'True if a transport permit is required (heavy load >10t, oversize, crane).',
      },
      noteringar: {
        type: 'string',
        description: 'Brief notes about LEZ, permit requirements, or special conditions. Null if none.',
      },
      kund_namn: {
        type: 'string',
        description: 'Customer name extracted from signature or message. Null if not found.',
      },
      kund_email: {
        type: 'string',
        description: 'Customer email extracted from message. Null if not found.',
      },
      kund_telefon: {
        type: 'string',
        description: 'Customer phone number extracted from message. Null if not found.',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Confidence in the extraction quality.',
      },
    },
    required: ['lasttyp', 'upphämtning', 'leverans', 'totalpris_sek', 'lez_varning', 'confidence'],
  },
};

// Cached system prompt — passed with cache_control so repeated calls hit the prefix cache
const SYSTEM_PROMPT = `Du är ett specialiserat AI-system för ett svenskt transportföretag (åkeri). Din uppgift är att analysera transportförfrågningar och extrahera strukturerad information för offertberäkning.

Fordon i flottan:
- KEM-01 · Volvo FH 540 · Kranbil (max 40 ton, Euro VI, LEZ-godkänd)
- KEM-02 · Scania R 500 · Lastväxlare (max 26 ton, Euro VI, LEZ-godkänd)
- KEM-03 · Volvo FMX 460 · Dumper (max 22 ton, Euro V)
- KEM-04 · Mercedes Actros · Flatbädd (max 18 ton, Euro VI, LEZ-godkänd)
- KEM-05 · DAF XF 480 · Skåpbil (max 12 ton, Euro VI)
- KEM-06 · Scania G 410 · Containerbil (max 30 ton, Euro V)

Prisstruktur:
- Startavgift: 500–1 500 kr beroende på fordon
- Timkostnad: 750–1 100 kr/tim beroende på fordon
- Bränsle: avstånd (km) × 2 × 4.60 kr/km (dieselförbrukning inkl. tomkörning)
- Tilläggsavgifter: tungt gods, krantimmar, lastning/lossning

LEZ-zoner i Stockholm som kräver Euro VI eller tillstånd:
Södermalm, Norrmalm, Östermalm, Kungsholmen, Gamla Stan, Vasastan, Hornsgatan-korridoren.

Använd alltid Swedish för fältnamn och noteringar. Extrahera all tillgänglig information. Gissa rimliga värden om specifik information saknas baserat på kontexten.`;

router.post('/', async (req, res) => {
  const { inquiry } = req.body;
  if (!inquiry?.trim()) return res.status(400).json({ error: 'inquiry saknas' });

  // ── Fallback to mock if no API key ───────────────────────────────────────
  if (!client) {
    console.warn('[analyse] No ANTHROPIC_API_KEY — using mock analysis');
    try {
      const result = await generateMockQuote(inquiry);
      return res.json({ ...result, _source: 'mock' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_transport_quote' },
      messages: [
        {
          role: 'user',
          content: `Analysera denna transportförfrågan och extrahera alla relevanta fält:\n\n${inquiry.trim()}`,
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse) throw new Error('No tool_use block in response');

    const fields = toolUse.input;

    // Normalise field name variance (AI sometimes uses snake_case variants)
    const result = {
      lasttyp:             fields.lasttyp            ?? 'Godstransport',
      vikt:                fields.vikt               ?? null,
      upphämtning:         fields.upphämtning        ?? fields.upphämtning ?? null,
      leverans:            fields.leverans           ?? null,
      datum:               fields.datum              ?? null,
      fordon_rekommenderat: fields.fordon_rekommenderat ?? null,
      avstand_km:          fields.avstand_km         ?? null,
      bränsle_kostnad:     fields.bränsle_kostnad    ?? fields.bransle_kostnad ?? null,
      arbetstid_timmar:    fields.arbetstid_timmar   ?? null,
      arbetstid_kostnad:   fields.arbetstid_kostnad  ?? null,
      totalpris_sek:       fields.totalpris_sek      ?? null,
      lez_varning:         Boolean(fields.lez_varning),
      lez_zon:             fields.lez_zon            ?? null,
      tillstånd_krävs:     Boolean(fields.tillstand_kravs ?? fields['tillstånd_krävs']),
      noteringar:          fields.noteringar         ?? null,
      kund_namn:           fields.kund_namn          ?? null,
      kund_email:          fields.kund_email         ?? null,
      kund_telefon:        fields.kund_telefon       ?? null,
      confidence:          fields.confidence         ?? 'medium',
      _source:             'claude',
      _model:              response.model,
      _tokens:             response.usage?.input_tokens + response.usage?.output_tokens,
    };

    return res.json(result);
  } catch (err) {
    console.error('[analyse] Claude API error:', err.message);
    // Graceful fallback to mock on API error
    try {
      const fallback = await generateMockQuote(inquiry);
      return res.json({ ...fallback, _source: 'mock_fallback', _error: err.message });
    } catch {
      return res.status(500).json({ error: err.message || 'Analysis failed' });
    }
  }
});

export default router;
