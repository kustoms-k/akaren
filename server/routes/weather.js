import { Router } from 'express';
import db from '../db.js';

const router = Router();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const LAT = 59.3293;
const LON = 18.0686;

const getCached   = db.prepare('SELECT * FROM weather_cache ORDER BY id DESC LIMIT 1');
const insertCache = db.prepare(
  'INSERT INTO weather_cache (temp_c, weather_code, condition, condition_sv, is_winter, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
);

const WINTER_CODES = new Set([56, 57, 66, 67, 71, 73, 75, 77, 85, 86]);

function describe(code, tempC) {
  let condition, conditionSv, icon;
  if      (code === 0)                    { condition = 'clear';            conditionSv = 'klar';               icon = '☀';  }
  else if (code <= 3)                     { condition = 'partly cloudy';    conditionSv = 'delvis molnigt';     icon = '⛅'; }
  else if (code === 45 || code === 48)    { condition = 'fog';              conditionSv = 'dimma';              icon = '🌫'; }
  else if (code >= 51 && code <= 55)      { condition = 'drizzle';          conditionSv = 'duggregn';           icon = '🌦'; }
  else if (code === 56 || code === 57)    { condition = 'freezing drizzle'; conditionSv = 'frysande duggregn';  icon = '❄';  }
  else if (code >= 61 && code <= 65)      { condition = 'rain';             conditionSv = 'regn';               icon = '🌧'; }
  else if (code === 66 || code === 67)    { condition = 'freezing rain';    conditionSv = 'frysande regn';      icon = '❄';  }
  else if (code >= 71 && code <= 77)      { condition = 'snow';             conditionSv = 'snö';                icon = '❄';  }
  else if (code >= 80 && code <= 82)      { condition = 'showers';          conditionSv = 'skurar';             icon = '🌦'; }
  else if (code === 85 || code === 86)    { condition = 'snow showers';     conditionSv = 'snöbyar';            icon = '❄';  }
  else if (code >= 95)                    { condition = 'thunderstorm';     conditionSv = 'åska';               icon = '⛈'; }
  else                                    { condition = 'cloudy';           conditionSv = 'molnigt';            icon = '☁';  }

  const isWinter = WINTER_CODES.has(code) || tempC <= 0;
  return { condition, conditionSv, icon, isWinter };
}

function rowToResponse(row, source) {
  const { icon } = describe(row.weather_code, row.temp_c);
  return {
    temp_c:       row.temp_c,
    weather_code: row.weather_code,
    condition:    row.condition,
    condition_sv: row.condition_sv,
    icon,
    is_winter:    Boolean(row.is_winter),
    updated_at:   row.updated_at,
    source,
  };
}

router.get('/', async (_req, res) => {
  const cached = getCached.get();
  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return res.json(rowToResponse(cached, 'cache'));
    }
  }

  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&timezone=Europe/Stockholm`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    const tempC = Math.round(data.current.temperature_2m * 10) / 10;
    const code  = data.current.weather_code;
    const { condition, conditionSv, isWinter } = describe(code, tempC);

    const updatedAt = new Date().toISOString();
    insertCache.run(tempC, code, condition, conditionSv, isWinter ? 1 : 0, updatedAt);

    const { icon } = describe(code, tempC);
    return res.json({ temp_c: tempC, weather_code: code, condition, condition_sv: conditionSv, icon, is_winter: isWinter, updated_at: updatedAt, source: 'open-meteo' });
  } catch (err) {
    if (cached) return res.json(rowToResponse(cached, 'stale-cache'));
    res.status(503).json({ error: err.message });
  }
});

export default router;
