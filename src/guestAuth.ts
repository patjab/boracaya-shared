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

// A claim supersedes any in-flight exchange (#439 review): reservations calls firing on
// mount can have an exchange for the OLD identity in flight while claimIdentity() lands
// the canonical one — a stale exchange must not clobber the freshly claimed cache entry.
// Each claim bumps the generation; an exchange only writes if its snapshot still matches.
let cacheGeneration = 0;

async function exchange(userId: string): Promise<string | null> {
  const generation = cacheGeneration;
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
    if (generation === cacheGeneration) {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp, userId } as StoredToken));
    }
    return token; // still valid for THIS caller's request even when superseded
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

// ---- identity claim / Google-first login (cdk#438 + cdk#439, #373 D2–D5) -------------
//
// POST /auth/claim, two lanes on one route:
//   * WITH userId (an invite session): bind/merge the Google email onto the invite's
//     canonical identity — the "link my Google account" affordance.
//   * WITHOUT userId: Google-first login — the verified email resolves to this event's
//     matching guest identities (guided zero-match, mint, or a labelled chooser 409).
// Either lane retries with chooseUserId after the guest picks from the chooser.
// On success the minted guest token is cached here (same shape the reservations calls
// read), and the caller is handed the CANONICAL userId to remember as the session
// identity (it may differ from the invite link's id after a merge).

/** One chooser option (cdk#452): label is event-scoped — this event's guest name or a generic fallback. */
export interface ClaimCandidate {
  userId: string;
  label: string;
}

export type ClaimResult =
  /** Token minted + cached; `userId` is the canonical identity to remember. */
  | { kind: 'ok'; userId: string; claimed: boolean }
  /** #373 D5 zero-match: no invitation for this email — guide to the invite link. */
  | { kind: 'none' }
  /** #373 D4 multi-match: present the chooser, then re-call with `chooseUserId`. */
  | { kind: 'chooser'; candidates: ClaimCandidate[] }
  /** The Google credential was rejected (401). */
  | { kind: 'invalid' }
  /** Anything else (network failure, 4xx/5xx) — safe to offer a retry. */
  | { kind: 'error' };

export async function claimIdentity(params: {
  credential: string;
  userId?: string;
  chooseUserId?: string;
}): Promise<ClaimResult> {
  try {
    const res = await fetch(ApiConstants.AUTH_CLAIM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.status === 200) {
      // The response's userId is the CANONICAL identity — after a merge it differs
      // from params.userId (the invite link's provisional id); never conflate them.
      const { token, exp, userId: canonicalUserId, claimed } = (await res.json()) as {
        token: string;
        exp: number;
        userId: string;
        claimed?: boolean;
      };
      cacheGeneration += 1; // invalidate any in-flight exchange for the old identity
      sessionStorage.setItem(
        TOKEN_KEY,
        JSON.stringify({ token, exp, userId: canonicalUserId } as StoredToken),
      );
      return { kind: 'ok', userId: canonicalUserId, claimed: claimed === true };
    }
    if (res.status === 404) return { kind: 'none' };
    if (res.status === 401) return { kind: 'invalid' };
    if (res.status === 409) {
      const { candidates } = (await res.json()) as { candidates?: ClaimCandidate[] };
      return { kind: 'chooser', candidates: Array.isArray(candidates) ? candidates : [] };
    }
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

/** Drop the cached guest token (e.g. on identity change / sign-out). */
export function clearGuestToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* no storage (SSR) -> nothing to clear */
  }
}
