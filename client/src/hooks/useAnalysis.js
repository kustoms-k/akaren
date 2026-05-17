import { useState, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';

// Fields the AI now returns as { value, confidence }
const CONFIDENCE_FIELDS = [
  'lasttyp', 'upphämtning', 'leverans', 'datum',
  'fordon_rekommenderat', 'avstand_km', 'totalpris_sek',
];

const CONF_SCORE = { high: 1.0, medium: 0.67, low: 0.33, none: 0.0 };

function calcOverall(conf) {
  const vals = Object.values(conf);
  if (vals.length === 0) return 1.0;
  return vals.reduce((sum, c) => sum + (CONF_SCORE[c] ?? 1.0), 0) / vals.length;
}

function rescalePrice(prev, realKm) {
  const oldKm    = parseFloat(prev.avstand_km)   || 0;
  const oldPrice = parseFloat(prev.totalpris_sek) || 0;
  if (oldKm <= 0 || oldPrice <= 0 || !Number.isFinite(oldKm) || !Number.isFinite(oldPrice)) return oldPrice;
  return Math.round(oldPrice * (realKm / oldKm));
}

export function useAnalysis() {
  const [status,            setStatus]            = useState('idle');
  const [rawText,           setRawText]           = useState('');
  const [parsed,            setParsed]            = useState(null);
  const [confidence,        setConfidence]        = useState({});
  const [confidenceOverall, setConfidenceOverall] = useState(1.0);
  const [originalParsed,    setOriginalParsed]    = useState(null);
  const [error,             setError]             = useState(null);
  const [routeLive,         setRouteLive]         = useState(false);
  const [extractionId,      setExtractionId]      = useState(null);
  const [extractionModel,   setExtractionModel]   = useState(null);

  const analyse = useCallback(async (inquiry, lang = 'sv') => {
    setStatus('streaming');
    setRawText('');
    setError(null);
    setConfidence({});
    setConfidenceOverall(1.0);
    setOriginalParsed(null);
    setRouteLive(false);
    setExtractionId(null);
    setExtractionModel(null);
    // Instant placeholders so field rows animate in immediately
    setParsed({
      lasttyp:              '…',
      upphämtning:          '…',
      leverans:             '…',
      datum:                '…',
      fordon_rekommenderat: '…',
      avstand_km:           '…',
      totalpris_sek:        '…',
    });

    try {
      const res = await apiFetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiry, lang }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'network');
      }

      const data = await res.json();

      // Normalise: extract { value, confidence } pairs into flat objects
      const flat = { ...data };
      const conf = {};
      for (const key of CONFIDENCE_FIELDS) {
        const field = data[key];
        if (field && typeof field === 'object' && 'value' in field) {
          const level = field.confidence ?? 'high';
          flat[key] = level === 'none' ? null : field.value;
          conf[key] = level;
        }
      }

      setParsed(flat);
      setOriginalParsed(flat);
      setConfidence(conf);
      setConfidenceOverall(calcOverall(conf));
      setStatus('done');
    } catch (err) {
      setError(err.message === 'parse' ? 'parse' : 'network');
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setRawText('');
    setParsed(null);
    setConfidence({});
    setConfidenceOverall(1.0);
    setOriginalParsed(null);
    setError(null);
    setRouteLive(false);
    setExtractionId(null);
    setExtractionModel(null);
  }, []);

  const applyRoute = useCallback((realKm) => {
    setParsed((prev) => {
      if (!prev) return null;
      return { ...prev, avstand_km: realKm, totalpris_sek: rescalePrice(prev, realKm) };
    });
    setOriginalParsed((prev) => {
      if (!prev) return null;
      return { ...prev, avstand_km: realKm, totalpris_sek: rescalePrice(prev, realKm) };
    });
    setRouteLive(true);
  }, []);

  const loadTemplate = useCallback((tpl) => {
    setStatus('done');
    setRawText('');
    setError(null);
    setConfidence({});
    setOriginalParsed(null);
    setRouteLive(false);
    setExtractionId(null);
    setExtractionModel(null);
    setParsed({
      lasttyp:              tpl.lasttyp        ?? null,
      upphämtning:          tpl.upphämtning    ?? null,
      leverans:             tpl.leverans       ?? null,
      fordon_rekommenderat: tpl.fordon_id      ?? null,
      totalpris_sek:        tpl.base_price_sek ?? null,
    });
  }, []);

  const setField = useCallback((key, value) => {
    setParsed((prev) => prev ? { ...prev, [key]: value } : null);
  }, []);

  return {
    status, rawText, parsed, confidence, confidenceOverall, originalParsed, error, routeLive,
    extractionId, extractionModel,
    analyse, reset, loadTemplate, setField, applyRoute,
  };
}
