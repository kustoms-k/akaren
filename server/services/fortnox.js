import { randomBytes } from 'node:crypto';
import { createCrypto } from './encrypt.js';
import { normalizeOrgNr, normalizePhone } from '../lib/normalize.js';

const SCOPES = 'customer invoice companyinformation';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

export class FortnoxNotConfiguredError extends Error {
  constructor() { super('Fortnox is not configured'); this.code = 'fortnox_not_configured'; }
}
export class FortnoxReconnectError extends Error {
  constructor(detail) { super(`Fortnox needs to be reconnected: ${detail}`); this.code = 'fortnox_reconnect_required'; }
}
export class FortnoxApiError extends Error {
  constructor(status, method, path, body) {
    super(`Fortnox API ${status} ${method} ${path}`);
    this.code = 'fortnox_api_error';
    this.status = status;
    this.body = body;
  }
}

/**
 * Fortnox OAuth + API client.
 * Refresh tokens rotate on every use (the old one dies immediately) and expire after
 * 45 days unused, so refreshes are serialised per company and an invalid_grant marks
 * the company as 'reconnect_required' instead of failing silently.
 */
export function createFortnoxService({ db, config, fetch = globalThis.fetch, now = () => Date.now() }) {
  const fx = config.fortnox;
  const { encrypt, decrypt } = createCrypto(config.encryptionKey);
  const pendingStates = new Map();   // nonce -> { companyId, expiresAt }
  const refreshLocks = new Map();    // companyId -> Promise<string>

  const stmtRow = db.prepare(`
    SELECT fortnox_status, fortnox_access_token_enc, fortnox_refresh_token_enc,
           fortnox_token_expires_at, fortnox_connected_at, fortnox_last_sync_at
    FROM companies WHERE id = ?
  `);
  const stmtSaveTokens = db.prepare(`
    UPDATE companies
    SET fortnox_status = 'connected',
        fortnox_access_token_enc = ?, fortnox_refresh_token_enc = ?, fortnox_token_expires_at = ?,
        fortnox_connected_at = COALESCE(fortnox_connected_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    WHERE id = ?
  `);
  const stmtSetStatus = db.prepare('UPDATE companies SET fortnox_status = ? WHERE id = ?');
  const stmtClear = db.prepare(`
    UPDATE companies
    SET fortnox_status = 'disconnected', fortnox_access_token_enc = NULL, fortnox_refresh_token_enc = NULL,
        fortnox_token_expires_at = NULL, fortnox_connected_at = NULL, fortnox_last_sync_at = NULL
    WHERE id = ?
  `);
  const stmtTouchSync = db.prepare(
    `UPDATE companies SET fortnox_last_sync_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
  );

  function assertConfigured() {
    if (!fx.configured) throw new FortnoxNotConfiguredError();
  }

  function buildAuthUrl(companyId) {
    assertConfigured();
    for (const [k, v] of pendingStates) if (v.expiresAt < now()) pendingStates.delete(k);
    const state = randomBytes(20).toString('hex');
    pendingStates.set(state, { companyId, expiresAt: now() + STATE_TTL_MS });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: fx.clientId,
      redirect_uri: fx.redirectUri,
      scope: SCOPES,
      state,
      access_type: 'offline',
    });
    return `${fx.authBase}/auth?${params}`;
  }

  function consumeState(state) {
    const entry = pendingStates.get(state);
    pendingStates.delete(state);
    if (!entry || entry.expiresAt < now()) return null;
    return entry.companyId;
  }

  async function postToken(params) {
    const basic = Buffer.from(`${fx.clientId}:${fx.clientSecret}`).toString('base64');
    const res = await fetch(`${fx.authBase}/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return { ok: res.ok, status: res.status, body };
  }

  function saveTokens(companyId, tokens) {
    const expiresAt = new Date(now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    stmtSaveTokens.run(
      encrypt(tokens.access_token),
      tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      expiresAt,
      companyId,
    );
  }

  async function connect(companyId, code) {
    assertConfigured();
    const r = await postToken({ grant_type: 'authorization_code', code, redirect_uri: fx.redirectUri });
    if (!r.ok) throw new FortnoxApiError(r.status, 'POST', '/token', r.body);
    saveTokens(companyId, r.body);
  }

  function getStatus(companyId) {
    const row = stmtRow.get(companyId);
    return {
      configured: fx.configured,
      status: row?.fortnox_status ?? 'disconnected',
      connected_at: row?.fortnox_connected_at ?? null,
      last_sync_at: row?.fortnox_last_sync_at ?? null,
    };
  }

  function disconnect(companyId) {
    stmtClear.run(companyId);
  }

  async function refresh(companyId) {
    const row = stmtRow.get(companyId);
    const refreshToken = decrypt(row?.fortnox_refresh_token_enc);
    if (!refreshToken) {
      stmtSetStatus.run('reconnect_required', companyId);
      throw new FortnoxReconnectError('no refresh token');
    }
    const r = await postToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
    if (!r.ok) {
      // 400/401 from the token endpoint means the refresh token is expired, used or revoked.
      if (r.status === 400 || r.status === 401) {
        stmtSetStatus.run('reconnect_required', companyId);
        throw new FortnoxReconnectError(r.body?.error ?? `status ${r.status}`);
      }
      throw new FortnoxApiError(r.status, 'POST', '/token', r.body);
    }
    saveTokens(companyId, r.body);
    return r.body.access_token;
  }

  async function getAccessToken(companyId) {
    const row = stmtRow.get(companyId);
    if (!row || row.fortnox_status === 'disconnected') throw new FortnoxReconnectError('not connected');
    if (row.fortnox_status === 'reconnect_required') throw new FortnoxReconnectError('reconnect required');

    const expiresAt = row.fortnox_token_expires_at ? Date.parse(row.fortnox_token_expires_at) : 0;
    if (expiresAt - now() > REFRESH_MARGIN_MS) {
      const token = decrypt(row.fortnox_access_token_enc);
      if (token) return token;
    }

    // Serialise refreshes: a second concurrent refresh would invalidate the first token.
    if (!refreshLocks.has(companyId)) {
      refreshLocks.set(companyId, refresh(companyId).finally(() => refreshLocks.delete(companyId)));
    }
    return refreshLocks.get(companyId);
  }

  async function request(companyId, method, path, body) {
    assertConfigured();
    const token = await getAccessToken(companyId);
    const res = await fetch(`${fx.apiBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (res.status === 401) {
      stmtSetStatus.run('reconnect_required', companyId);
      throw new FortnoxReconnectError('access token rejected');
    }
    if (!res.ok) throw new FortnoxApiError(res.status, method, path, data);
    return data;
  }

  /**
   * Pull Fortnox customers into the local customer register.
   * Match order: fortnox_customer_nr, then org nr (links an existing local customer), else insert.
   */
  async function syncCustomers(companyId) {
    const byFortnoxNr = db.prepare('SELECT id FROM customers WHERE company_id = ? AND fortnox_customer_nr = ?');
    const byOrgNr = db.prepare('SELECT id, fortnox_customer_nr FROM customers WHERE company_id = ? AND org_nr = ?');
    const update = db.prepare(`
      UPDATE customers SET fortnox_customer_nr = @nr, name = @name, address = COALESCE(@address, address),
        postnr = COALESCE(@postnr, postnr), ort = COALESCE(@ort, ort), email = COALESCE(@email, email),
        phone = COALESCE(@phone, phone), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = @id
    `);
    const insert = db.prepare(`
      INSERT INTO customers (company_id, fortnox_customer_nr, name, org_nr, address, postnr, ort, email, phone)
      VALUES (@companyId, @nr, @name, @orgNr, @address, @postnr, @ort, @email, @phone)
    `);

    const counts = { created: 0, linked: 0, updated: 0 };
    for (let page = 1; page <= 50; page++) {
      const data = await request(companyId, 'GET', `/customers?limit=100&page=${page}`);
      const list = data.Customers ?? [];
      db.transaction(() => {
        for (const c of list) {
          const rec = {
            companyId,
            nr: String(c.CustomerNumber),
            name: c.Name || `Kund ${c.CustomerNumber}`,
            orgNr: normalizeOrgNr(c.OrganisationNumber),
            address: c.Address1 || null,
            postnr: c.ZipCode || null,
            ort: c.City || null,
            email: c.Email || null,
            phone: normalizePhone(c.Phone1 ?? c.Phone) ?? null,
          };
          const existing = byFortnoxNr.get(companyId, rec.nr);
          if (existing) {
            update.run({ ...rec, id: existing.id });
            counts.updated++;
            continue;
          }
          const byOrg = rec.orgNr ? byOrgNr.get(companyId, rec.orgNr) : null;
          if (byOrg && !byOrg.fortnox_customer_nr) {
            update.run({ ...rec, id: byOrg.id });
            counts.linked++;
          } else if (!byOrg) {
            insert.run(rec);
            counts.created++;
          }
        }
      })();
      const totalPages = Number(data.MetaInformation?.['@TotalPages'] ?? page);
      if (list.length < 100 || page >= totalPages) break;
    }
    stmtTouchSync.run(companyId);
    return counts;
  }

  /** Create an unbooked (draft) invoice. Returns the Fortnox Invoice object. Never books or sends it. */
  async function createInvoice(companyId, payload) {
    const data = await request(companyId, 'POST', '/invoices', payload);
    return data.Invoice ?? null;
  }

  /**
   * A draft we may already have created, found by its ExternalInvoiceReference1. Used when a create call
   * failed without a clear answer (timeout, 5xx), so a retry never makes a second invoice.
   * The filter parameter is to be verified against a Fortnox sandbox (pivot plan §7).
   */
  async function findInvoiceByExternalRef(companyId, externalRef) {
    const data = await request(companyId, 'GET', `/invoices?externalinvoicereference1=${encodeURIComponent(externalRef)}`);
    return (data.Invoices ?? []).find((i) => i.ExternalInvoiceReference1 === externalRef) ?? null;
  }

  /** Create a customer in Fortnox from a local one; returns the new CustomerNumber. */
  async function createCustomer(companyId, c) {
    const data = await request(companyId, 'POST', '/customers', {
      Customer: {
        Name: c.name,
        ...(c.org_nr ? { OrganisationNumber: c.org_nr } : {}),
        ...(c.address ? { Address1: c.address } : {}),
        ...(c.postnr ? { ZipCode: c.postnr } : {}),
        ...(c.ort ? { City: c.ort } : {}),
        ...(c.email ? { Email: c.email, EmailInvoice: c.email } : {}),
        ...(c.vat_mode === 'omvand_bygg' ? { VATType: 'SEREVERSEDVAT' } : {}),
      },
    });
    return data.Customer?.CustomerNumber ? String(data.Customer.CustomerNumber) : null;
  }

  return {
    buildAuthUrl, consumeState, connect, getStatus, disconnect, request, syncCustomers,
    createInvoice, findInvoiceByExternalRef, createCustomer,
  };
}
