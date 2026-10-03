// Errors returned to clients have the shape { error: { code, message, fields? } }.
// `message` is Swedish and safe to show; internal details are only logged.

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new HttpError(400, 'invalid_input', message, extra);
export const notFound = (message = 'Hittades inte.') => new HttpError(404, 'not_found', message);
export const conflict = (code, message, extra) => new HttpError(409, code, message, extra);

/**
 * Parse `data` with a zod schema or throw a 400 listing the invalid fields.
 * Top-level keys whose value is undefined are dropped (SQLite can't bind undefined,
 * and an omitted field in a PATCH means "leave unchanged").
 */
export function validate(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) {
    const out = result.data;
    if (out && typeof out === 'object' && !Array.isArray(out)) {
      for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    }
    return out;
  }
  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw badRequest('Kontrollera de markerade fälten.', { fields });
}

/** Wrap an async route handler so rejections reach the error middleware (Express 4). */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parse a positive integer route param or throw 404. */
export function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}

export function errorMiddleware(logger = console) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'too_large', message: 'Förfrågan är för stor.' } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'Ogiltig JSON.' } });
    }
    if (err?.name === 'MulterError') {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: { code: tooBig ? 'too_large' : 'invalid_upload', message: tooBig ? 'Bilden är för stor (max 15 MB).' : 'Uppladdningen misslyckades.' },
      });
    }
    if (err?.message?.startsWith('CORS:')) {
      return res.status(403).json({ error: { code: 'cors', message: 'Åtkomst nekad.' } });
    }
    logger.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: { code: 'internal', message: 'Något gick fel. Försök igen.' } });
  };
}
