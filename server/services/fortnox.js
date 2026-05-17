import { randomBytes } from 'node:crypto';
import db              from '../db.js';
import { encrypt, decrypt } from './encrypt.js';

const FX_AUTH_BASE = 'https://apps.fortnox.se/oauth-v1';
const FX_API_BASE  = 'https://api.fortnox.se/3';
const SCOPES       = 'customer invoice companyinformation';
const TOKEN_BUFFER = 300; // refresh 5 min before expiry

// ── In-memory OAuth state store (nonce → { companyId, expiresAt }) ────────────
const pendingStates = new Map();

export function createOAuthState(companyId) {
  const nonce = randomBytes(20).toString('hex');
  pendingStates.set(nonce, { companyId, expiresAt: Date.now() + 10 * 60 * 1000 });
  // Prune stale entries
  for (const [k, v] of pendingStates) {
    if (v.expiresAt < Date.now()) pendingStates.delete(k);
  }
  return nonce;
}

export function consumeOAuthState(nonce) {
  const entry = pendingStates.get(nonce);
  if (!entry) return null;
  pendingStates.delete(nonce);
  if (entry.expiresAt < Date.now()) return null;
  return entry.companyId;
}

// ── Auth URL ──────────────────────────────────────────────────────────────────
export function buildAuthUrl(companyId) {
  const clientId    = process.env.FORTNOX_CLIENT_ID;
  const redirectUri = process.env.FORTNOX_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error('FORTNOX_CLIENT_ID and FORTNOX_REDIRECT_URI must be set');
  const state = createOAuthState(companyId);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    redirect_uri:  redirectUri,
    scope:         SCOPES,
    state,
    access_type:   'offline',
  });
  return `${FX_AUTH_BASE}/auth?${params}`;
}

// ── Token HTTP call ───────────────────────────────────────────────────────────
async function postToken(params) {
  const clientId     = process.env.FORTNOX_CLIENT_ID;
  const clientSecret = process.env.FORTNOX_CLIENT_SECRET;
  const basic        = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${FX_AUTH_BASE}/token`, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fortnox token ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtSaveTokens = db.prepare(`
  UPDATE companies
  SET fortnox_token            = ?,
      fortnox_refresh_token    = ?,
      fortnox_token_expires_at = ?,
      fortnox_connected_at     = COALESCE(fortnox_connected_at, CURRENT_TIMESTAMP)
  WHERE id = ?
`);

const stmtGetRow = db.prepare(`
  SELECT fortnox_token, fortnox_refresh_token, fortnox_token_expires_at,
         fortnox_connected_at, fortnox_last_sync
  FROM companies WHERE id = ?
`);

const stmtClearTokens = db.prepare(`
  UPDATE companies
  SET fortnox_token = NULL, fortnox_refresh_token = NULL,
      fortnox_token_expires_at = NULL, fortnox_connected_at = NULL, fortnox_last_sync = NULL
  WHERE id = ?
`);

const stmtSetLastSync = db.prepare(
  `UPDATE companies SET fortnox_last_sync = CURRENT_TIMESTAMP WHERE id = ?`
);

// ── Token storage helpers ─────────────────────────────────────────────────────
function saveTokens(companyId, tokenRes) {
  const expiresAt = new Date(Date.now() + (tokenRes.expires_in ?? 3600) * 1000).toISOString();
  stmtSaveTokens.run(
    encrypt(tokenRes.access_token),
    tokenRes.refresh_token ? encrypt(tokenRes.refresh_token) : null,
    expiresAt,
    companyId,
  );
}

export function clearTokens(companyId) {
  stmtClearTokens.run(companyId);
}

export function getConnectionStatus(companyId) {
  const row = stmtGetRow.get(companyId);
  if (!row?.fortnox_token) return { connected: false };
  return {
    connected:        true,
    connected_at:     row.fortnox_connected_at,
    last_sync:        row.fortnox_last_sync,
    token_expires_at: row.fortnox_token_expires_at,
  };
}

// ── Auto-refresh and get valid token ─────────────────────────────────────────
async function getValidToken(companyId) {
  const row = stmtGetRow.get(companyId);
  if (!row?.fortnox_token) throw new Error('Fortnox not connected for this company');

  const expiresAt   = row.fortnox_token_expires_at ? new Date(row.fortnox_token_expires_at) : null;
  const needsRefresh = !expiresAt || (expiresAt.getTime() - Date.now()) < TOKEN_BUFFER * 1000;

  if (needsRefresh && row.fortnox_refresh_token) {
    const refreshToken = decrypt(row.fortnox_refresh_token);
    const tokenRes     = await postToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
    saveTokens(companyId, tokenRes);
    return tokenRes.access_token;
  }

  return decrypt(row.fortnox_token);
}

// ── Authenticated Fortnox API call ────────────────────────────────────────────
export async function fortnoxFetch(companyId, method, path, body) {
  const token = await getValidToken(companyId);
  const res   = await fetch(`${FX_API_BASE}${path}`, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fortnox API ${res.status} ${method} ${path}: ${text}`);
  }
  return res.json();
}

// ── Customer sync ─────────────────────────────────────────────────────────────
const stmtUpsertCustomer = db.prepare(`
  INSERT INTO customers (company_id, fortnox_customer_nr, name, address, zip_code, city, phone, email, org_nr)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(company_id, fortnox_customer_nr) DO UPDATE SET
    name      = excluded.name,
    address   = excluded.address,
    zip_code  = excluded.zip_code,
    city      = excluded.city,
    phone     = excluded.phone,
    email     = excluded.email,
    org_nr    = excluded.org_nr,
    synced_at = CURRENT_TIMESTAMP
`);

export async function syncCustomers(companyId) {
  let page    = 1;
  let fetched = 0;
  let total   = Infinity;

  while (fetched < total && page <= 50) {
    const data      = await fortnoxFetch(companyId, 'GET', `/customers?limit=100&page=${page}`);
    const customers = data.Customers ?? [];

    for (const c of customers) {
      stmtUpsertCustomer.run(
        companyId,
        c.CustomerNumber,
        c.Name              ?? null,
        c.Address1          ?? null,
        c.ZipCode           ?? null,
        c.City              ?? null,
        c.Phone1 ?? c.Phone ?? null,
        c.Email             ?? null,
        c.OrganisationNumber ?? null,
      );
    }

    fetched += customers.length;
    total    = data.MetaInformation?.['@TotalResources'] ?? fetched;
    if (customers.length < 100) break;
    page++;
  }

  stmtSetLastSync.run(companyId);
  return { synced: fetched };
}

// ── Push invoice to Fortnox ───────────────────────────────────────────────────
export async function createFortnoxInvoice(companyId, { job, quote, customerNr }) {
  const today = new Date();
  const due   = new Date(today);
  due.setDate(due.getDate() + 30);

  const description = [
    quote.lasttyp,
    quote.upphämtning && quote.leverans
      ? `${quote.upphämtning} → ${quote.leverans}`
      : (quote.upphämtning ?? quote.leverans),
    quote.avstand_km ? `${quote.avstand_km} km` : null,
    quote.datum ? `Datum: ${quote.datum}` : null,
  ].filter(Boolean).join(', ');

  // Price is stored incl. 25% VAT; Fortnox expects ex-VAT with VAT% separate
  const priceExVat = Math.round(((quote.totalpris_sek ?? 0) / 1.25) * 100) / 100;

  const payload = {
    Invoice: {
      CustomerNumber:  customerNr ?? '1',
      InvoiceDate:     today.toISOString().slice(0, 10),
      DueDate:         due.toISOString().slice(0, 10),
      TermsOfPayment:  '30',
      VATIncluded:     false,
      Remarks:         quote.noteringar ?? '',
      InvoiceRows: [
        {
          Description: description || 'Transport',
          Price:       priceExVat,
          Quantity:    1,
          VAT:         25,
          Unit:        'st',
        },
      ],
    },
  };

  const result = await fortnoxFetch(companyId, 'POST', '/invoices', payload);
  return result.Invoice?.DocumentNumber ?? null;
}

// ── First-connect helper ──────────────────────────────────────────────────────
export async function connectFortnox(companyId, code) {
  const tokenRes = await postToken({
    grant_type:   'authorization_code',
    code,
    redirect_uri: process.env.FORTNOX_REDIRECT_URI,
  });
  saveTokens(companyId, tokenRes);

  // Best-effort initial customer sync; non-fatal
  try {
    await syncCustomers(companyId);
  } catch (err) {
    console.error('[fortnox] Initial customer sync failed:', err.message);
  }
}
