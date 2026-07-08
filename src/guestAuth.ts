// Guest token for the reservations API (pda-boracay-cdk #296 / #100 Phase 1).
//
// A guest arrives via a /e/<eventId>/?invited=<userId> link. This module exchanges that
// userId for a short-lived, guest-scoped JWT (POST /events/{eventId}/auth/exchange,
// cdk#427: the exchange is event-scoped — the path names the event whose membership
// authorizes the mint) and caches it in sessionStorage, so the reservations calls
// (RSVP / pre-check-in) can send `Authorization: Bearer <jwt>`. The invite link IS the
// credential — same trust model as the link itself.
//
// Distinct from auth.ts: that holds the Google ID token (the admin / check-in sign-in);
// this is the per-guest reservations token, keyed to the invited userId. sessionStorage is
// only touched inside functions, so importing this module in Node (e2e, the contract test)
// is safe — only calling ensureGuestToken() needs a browser.
import { ApiConstants, GuestEventApi } from './api';

const TOKEN_KEY = 'pdab_guest_token';
// Refresh a little before the real edge so an in-flight request never carries a token that
// expires mid-flight.
const SKEW_MS = 30_000;

interface StoredToken {
  token: string;
  exp: number; // unix seconds (from the exchange response)
  userId: string;
  /** The event the token was minted against (cdk#427): tokens are event-scoped —
   *  a cached one must never satisfy a DIFFERENT event's calls, or a stale entry
   *  would suppress the fresh (membership-validating) exchange for that event. */
  eventId: string;
  /** The identity's single linked Google, or null if none (cdk#637). The auth
   *  responses (exchange / claim / login) echo it so the gated screens can toggle
   *  Link vs Unlink without an extra round-trip; unlink clears it in place. */
  linkedEmail?: string | null;
}

/** The cached guest token entry, or null when absent/corrupt. */
function readStored(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

function readValid(eventId: string, userId: string): string | null {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as StoredToken;
    if (s.eventId === eventId && s.userId === userId && s.token
        && s.exp * 1000 - SKEW_MS > Date.now()) return s.token;
  } catch {
    /* corrupt entry -> treat as absent (a pre-#427 entry without eventId parses
       fine and is rejected by the eventId equality check above instead) */
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

async function exchange(eventId: string, userId: string): Promise<string | null> {
  const generation = cacheGeneration;
  try {
    const res = await fetch(GuestEventApi.exchange(eventId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    // 403 (unknown invitation) / any failure -> no token; the caller proceeds without one
    // (today's open reservations API still accepts it — until the authorizer lands).
    if (!res.ok) return null;
    const { token, exp, linkedEmail } = (await res.json()) as {
      token: string; exp: number; linkedEmail?: string | null;
    };
    if (generation === cacheGeneration) {
      sessionStorage.setItem(
        TOKEN_KEY,
        JSON.stringify({ token, exp, userId, eventId, linkedEmail: linkedEmail ?? null } as StoredToken),
      );
    }
    return token; // still valid for THIS caller's request even when superseded
  } catch {
    return null;
  }
}

/**
 * Return a valid guest token for this userId, exchanging + caching if needed. The exchange
 * is event-scoped (cdk#427): `eventId` is the SPA's path tenant, and the mint succeeds only
 * if the userId resolves to an invitation in THAT event. Never throws; returns null when
 * either id is missing or the exchange fails.
 */
export async function ensureGuestToken(
  eventId: string | null | undefined,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!eventId || !userId) return null;
  const cached = readValid(eventId, userId);
  if (cached) return cached;
  // JSON-encoded composite: collision-free even if an id ever contained ':'.
  const flightKey = JSON.stringify([eventId, userId]);
  let p = inFlight.get(flightKey);
  if (!p) {
    p = exchange(eventId, userId).finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, p);
  }
  return p;
}

/** Authorization header for a reservations call, or {} when no token is available. */
export async function guestAuthHeaders(
  eventId: string | null | undefined,
  userId: string | null | undefined,
): Promise<Record<string, string>> {
  const token = await ensureGuestToken(eventId, userId);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The identity's single linked Google for this (event, userId), or null if none (cdk#637).
 * Ensures a token first (the exchange response carries `linkedEmail`), so the gated screens
 * can render the Link vs Unlink toggle off one call. Null when no token can be minted.
 */
export async function guestLinkedEmail(
  eventId: string | null | undefined,
  userId: string | null | undefined,
): Promise<string | null> {
  const token = await ensureGuestToken(eventId, userId);
  if (!token) return null;
  const stored = readStored();
  return stored && stored.eventId === eventId && stored.userId === userId
    ? stored.linkedEmail ?? null
    : null;
}

// ---- identity claim / Google-first login (cdk#438 + cdk#439, #373 D2–D5) -------------
//
// POST /events/{eventId}/auth/claim, two lanes on one route (event-scoped, cdk#427):
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
  /** Token minted + cached; `userId` is the canonical identity to remember, and
   *  `linkedEmail` is the account now linked to it (cdk#637). */
  | { kind: 'ok'; userId: string; claimed: boolean; linkedEmail: string | null }
  /** #373 D5 zero-match: no invitation for this email — guide to the invite link. */
  | { kind: 'none' }
  /** #373 D4 multi-match: present the chooser, then re-call with `chooseUserId`. */
  | { kind: 'chooser'; candidates: ClaimCandidate[] }
  /** The Google credential was rejected (401). */
  | { kind: 'invalid' }
  /** Anything else (network failure, 4xx/5xx) — safe to offer a retry. */
  | { kind: 'error' };

export async function claimIdentity(params: {
  /** The SPA's path tenant (cdk#427): candidates/labels are scoped to this event (cdk#452). */
  eventId: string;
  credential: string;
  userId?: string;
  chooseUserId?: string;
}): Promise<ClaimResult> {
  try {
    const { eventId, ...body } = params;
    const res = await fetch(GuestEventApi.claim(eventId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 200) {
      // The response's userId is the CANONICAL identity — after a merge it differs
      // from params.userId (the invite link's provisional id); never conflate them.
      const { token, exp, userId: canonicalUserId, claimed, linkedEmail } = (await res.json()) as {
        token: string;
        exp: number;
        userId: string;
        claimed?: boolean;
        linkedEmail?: string | null;
      };
      cacheGeneration += 1; // invalidate any in-flight exchange for the old identity
      sessionStorage.setItem(
        TOKEN_KEY,
        JSON.stringify({
          token, exp, userId: canonicalUserId, eventId, linkedEmail: linkedEmail ?? null,
        } as StoredToken),
      );
      return { kind: 'ok', userId: canonicalUserId, claimed: claimed === true, linkedEmail: linkedEmail ?? null };
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

// ---- no-event Google login (cdk#623, Option D) --------------------------------------
//
// POST /auth/login (UNSCOPED — no eventId): a verified Google credential arriving with no
// event in the URL. The backend recovers the event(s) the email is a member of and, when
// there is EXACTLY ONE, mints a guest token for it and returns the resolved eventId; zero
// or many events → 404 (the "open your invite link" guidance, #373 D5). Read-only: like
// the login lane of /auth/claim it never binds or writes an identity — it only RECOVERS the
// single event the caller is already on. On success the minted token is cached here (same
// shape the reservations calls read) keyed to the resolved event, and the caller is handed
// the eventId to redirect into (`/e/<eventId>/`).

export type NoEventLoginResult =
  /** Exactly one member event: token minted + cached; redirect the guest into `eventId`. */
  | { kind: 'ok'; userId: string; eventId: string }
  /** Zero OR many member events (#373 D5): guide to the personal invite link. No list is
   *  returned to the browser — the no-event lane defers the cross-event chooser. */
  | { kind: 'none' }
  /** The Google credential was rejected (401). */
  | { kind: 'invalid' }
  /** Anything else (network failure, 4xx/5xx) — safe to offer a retry. */
  | { kind: 'error' };

export async function loginNoEvent(credential: string): Promise<NoEventLoginResult> {
  try {
    const res = await fetch(ApiConstants.GUEST_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    if (res.status === 200) {
      const { token, exp, userId, eventId, linkedEmail } = (await res.json()) as {
        token: string;
        exp: number;
        userId: string;
        eventId: string;
        linkedEmail?: string | null;
      };
      cacheGeneration += 1; // invalidate any in-flight exchange for a prior identity
      sessionStorage.setItem(
        TOKEN_KEY,
        JSON.stringify({ token, exp, userId, eventId, linkedEmail: linkedEmail ?? null } as StoredToken),
      );
      return { kind: 'ok', userId, eventId };
    }
    // Zero AND many both surface as 404 here (the backend never returns a cross-event
    // chooser on this lane) — one guided outcome for the SPA.
    if (res.status === 404) return { kind: 'none' };
    if (res.status === 401) return { kind: 'invalid' };
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

// ---- in-UI unlink (cdk#637) ---------------------------------------------------------
//
// POST /events/{eventId}/auth/unlink — remove the caller's single primary Google. AUTH:
// the cached guest JWT is the credential (there is no APIGW authorizer on the auth lanes;
// the token's own `sub` scopes the unlink server-side, so a caller can only unlink their
// own identity). The guest KEEPS their session — only the linked-Google marker is cleared,
// so the gated-screen toggle flips back to "Link"; sign-in-with-Google stops resolving to
// them until they link again, but their invite link still works.

export type UnlinkResult =
  /** The binding was removed (or was already absent) — the identity is now unlinked. */
  | { kind: 'ok' }
  /** No cached token, or the server rejected it (401): the SPA should send the guest back
   *  through their invite link. */
  | { kind: 'unauthenticated' }
  /** Anything else (network failure, 4xx/5xx) — safe to offer a retry. */
  | { kind: 'error' };

export async function unlinkIdentity(eventId: string): Promise<UnlinkResult> {
  const stored = readStored();
  // The token must be THIS event's (auth is event-scoped, cdk#427) and unexpired-ish;
  // the server re-verifies, so this is only a fast local guard against a pointless call.
  if (!stored || !stored.token || stored.eventId !== eventId) return { kind: 'unauthenticated' };
  try {
    const res = await fetch(GuestEventApi.unlink(eventId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stored.token}` },
    });
    if (res.status === 200) {
      // Keep the session token — the guest stays signed in via their invite link; only
      // the linked-Google marker is cleared so the toggle flips back to "Link".
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ ...stored, linkedEmail: null } as StoredToken));
      return { kind: 'ok' };
    }
    if (res.status === 401) return { kind: 'unauthenticated' };
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
