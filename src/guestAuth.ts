// Guest token for the reservations API (pda-boracay-cdk #296 / #100 Phase 1).
//
// A guest arrives via a ?invited=<userId> link. This module exchanges that userId for a
// short-lived, guest-scoped JWT (POST /auth/exchange) and caches it in sessionStorage, so
// the reservations calls (RSVP / pre-check-in) can send `Authorization: Bearer <jwt>`. The
// invite link IS the credential — same trust model as the link itself.
//
// Distinct from auth.ts: that holds the Google ID token (the admin / check-in sign-in);
// this is the per-guest reservations token, keyed to the invited userId. sessionStorage is
// only touched inside functions, so importing this module in Node (e2e, the contract test)
// is safe — only calling ensureGuestToken() needs a browser.
import { ApiConstants } from './api';

const TOKEN_KEY = 'pdab_guest_token';
// Refresh a little before the real edge so an in-flight request never carries a token that
// expires mid-flight.
const SKEW_MS = 30_000;

interface StoredToken {
  token: string;
  exp: number; // unix seconds (from the exchange response)
  userId: string;
}

function readValid(userId: string): string | null {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as StoredToken;
    if (s.userId === userId && s.token && s.exp * 1000 - SKEW_MS > Date.now()) return s.token;
  } catch {
    /* corrupt entry -> treat as absent */
  }
  return null;
}

// Dedup concurrent exchanges for the same userId (several reservations calls fire on mount).
const inFlight = new Map<string, Promise<string | null>>();

async function exchange(userId: string): Promise<string | null> {
  try {
    const res = await fetch(ApiConstants.AUTH_EXCHANGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    // 403 (unknown invitation) / any failure -> no token; the caller proceeds without one
    // (today's open reservations API still accepts it — until the authorizer lands).
    if (!res.ok) return null;
    const { token, exp } = (await res.json()) as { token: string; exp: number };
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp, userId } as StoredToken));
    return token;
  } catch {
    return null;
  }
}

/**
 * Return a valid guest token for this userId, exchanging + caching if needed. Never throws;
 * returns null when there's no userId or the exchange fails.
 */
export async function ensureGuestToken(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const cached = readValid(userId);
  if (cached) return cached;
  let p = inFlight.get(userId);
  if (!p) {
    p = exchange(userId).finally(() => inFlight.delete(userId));
    inFlight.set(userId, p);
  }
  return p;
}

/** Authorization header for a reservations call, or {} when no token is available. */
export async function guestAuthHeaders(userId: string | null | undefined): Promise<Record<string, string>> {
  const token = await ensureGuestToken(userId);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Drop the cached guest token (e.g. on identity change / sign-out). */
export function clearGuestToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* no storage (SSR) -> nothing to clear */
  }
}
