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
import { GuestEventApi, PublicApi } from './publicApi';

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

// A claim supersedes any in-flight exchange (#439 review): reservations calls firing on
// mount can have an exchange for the OLD identity in flight while claimIdentity() lands
// the canonical one — a stale exchange must not clobber the freshly claimed cache entry.
// Each claim bumps the generation; an exchange only writes if its snapshot still matches.
let cacheGeneration = 0;

// ONE legacy exchange per (event, userId) at a time, shared by EVERY caller (shore#353).
//
// Two kinds of caller want the same request on the same page load: the link resolver
// (`exchangeLegacyInvite`, which needs the `invitationToken` the silent swap hands back)
// and the reservations calls firing on mount (`ensureGuestToken`, which only needs the
// session). Before cdk#1653 the swap ROTATED, so every exchange carried a fresh token and
// two concurrent requests were merely wasteful. cdk#1653 made the swap idempotent behind a
// DynamoDB condition — correctly, a rotation was killing the link it had just handed out —
// so now exactly ONE of two racing exchanges receives the token. When the reservations call
// won that race the resolver saw no token, the guest's URL was never rewritten, and the
// host's "still on old links" count never moved (observed in the browser against testing:
// two POSTs 6 ms apart, the token on the one the resolver did not make). Dedupe is the
// fix: whichever caller asks first makes the request, every concurrent caller awaits it,
// and the swap token reaches the one that knows what to do with it.
const inFlight = new Map<string, Promise<LegacyExchange>>();

function legacyExchangeOnce(eventId: string, userId: string): Promise<LegacyExchange> {
  // JSON-encoded composite: collision-free even if an id ever contained ':'.
  const flightKey = JSON.stringify([eventId, userId]);
  let p = inFlight.get(flightKey);
  if (!p) {
    p = legacyExchange(eventId, userId).finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, p);
  }
  return p;
}

/**
 * Whether this tab already holds a live session for `(eventId, userId)` — read
 * from the cache only, never the network (cdk#1658, decision 2 on cdk#1659).
 *
 * Shore's link resolver uses it to decide whether a REMEMBERED identity (no link
 * in the URL) needs exchanging at all: a guest who signed in on their token link
 * minutes ago still holds that session, so presenting their internal id to the
 * legacy lane — closed after the cutoff — would only sign them out for nothing.
 * Absent or expired session → false, and the resolver's exchange proceeds.
 */
export function hasGuestSession(
  eventId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!eventId || !userId) return false;
  try {
    return readValid(eventId, userId) !== null;
  } catch {
    return false;
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
  // 403 (unknown / replaced) or any failure -> no token; the caller proceeds without one.
  const result = await legacyExchangeOnce(eventId, userId);
  return result.kind === 'ok' ? result.token : null;
}

// ── invitation tokens (cdk#1566, U01) ────────────────────────────────────────

/** The outcome of presenting a link's credential, for the screens to branch on. */
export type InvitationExchange =
  /** A session. `userId` is the canonical id, read from the JWT's own `sub`. */
  | { kind: 'ok'; token: string; userId: string }
  /** The legacy grace period ended: this `?invited=` link is dead (cdk#1566 Q2). */
  | { kind: 'replaced' }
  /** Unknown, revoked, or wrong-event — deliberately indistinguishable. */
  | { kind: 'unknown' }
  /** Network or server fault; the caller may retry. */
  | { kind: 'error' };

/**
 * The canonical userId a guest JWT was minted for, read from its own `sub`.
 *
 * The cdk#1566 lane deliberately does NOT echo `userId` in the response body —
 * the whole point is to stop handing the internal identifier back as a field a
 * client might store, log or build a link from. The claim is still there (the
 * authorizer reads it), so a client that legitimately needs to know who it is
 * reads it here rather than being told.
 *
 * Returns null for anything that is not a parseable JWT payload with a `sub`.
 */
export function guestSubjectFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

function cacheSession(eventId: string, userId: string, token: string, exp: number,
                      linkedEmail: string | null, generation: number): void {
  if (generation !== cacheGeneration) return;
  sessionStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ token, exp, userId, eventId, linkedEmail } as StoredToken),
  );
}

/**
 * Exchange an invitation TOKEN (the `?invite=` link's credential) for an
 * event-scoped guest session (cdk#1566).
 *
 * Unlike `ensureGuestToken`, the caller does not know its own userId yet — the
 * token is the only thing the link carries — so the cache is written after the
 * response, keyed on the `sub` the JWT itself names.
 */
export async function exchangeInvitationToken(
  eventId: string | null | undefined,
  invitationToken: string | null | undefined,
): Promise<InvitationExchange> {
  if (!eventId || !invitationToken) return { kind: 'unknown' };
  const generation = cacheGeneration;
  try {
    const res = await fetch(GuestEventApi.guestToken(eventId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: invitationToken }),
    });
    if (res.status === 403) return { kind: 'unknown' };
    if (!res.ok) return { kind: 'error' };
    const { token, exp, linkedEmail } = (await res.json()) as {
      token: string; exp: number; linkedEmail?: string | null;
    };
    const userId = guestSubjectFromToken(token);
    if (!userId) return { kind: 'error' };
    try {
      cacheSession(eventId, userId, token, exp, linkedEmail ?? null, generation);
    } catch {
      // storage unavailable — the session just won't survive a reload
    }
    return { kind: 'ok', token, userId };
  } catch {
    return { kind: 'error' };
  }
}

/**
 * Exchange a LEGACY `?invited={userId}` link during the grace period
 * (cdk#1566 B1/Q2).
 *
 * Distinguishes the two 403s the old lane can now produce, which
 * `ensureGuestToken` cannot: `replaced` means the four weeks are up and this
 * link is permanently dead (the screens show "Find my invitation"), while
 * `unknown` is the pre-existing "no such invitation".
 *
 * On success the server also hands back a freshly minted `invitationToken` —
 * the silent swap — which the caller puts in the URL in place of the userId.
 */
export async function exchangeLegacyInvite(
  eventId: string | null | undefined,
  userId: string | null | undefined,
): Promise<LegacyExchange> {
  if (!eventId || !userId) return { kind: 'unknown' };
  return legacyExchangeOnce(eventId, userId);
}

/** The legacy exchange's wire shape: a session plus, on a first use, the swapped-in token. */
type LegacyExchange = InvitationExchange & { invitationToken?: string };

/** The one network call behind `exchangeLegacyInvite` AND `ensureGuestToken`; never call it
 *  directly — `legacyExchangeOnce` is what keeps concurrent callers on a single request. */
async function legacyExchange(eventId: string, userId: string): Promise<LegacyExchange> {
  const generation = cacheGeneration;
  try {
    const res = await fetch(GuestEventApi.exchange(eventId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return body.error === 'invitation link replaced'
        ? { kind: 'replaced' }
        : { kind: 'unknown' };
    }
    if (!res.ok) return { kind: 'error' };
    const { token, exp, linkedEmail, invitationToken } = (await res.json()) as {
      token: string; exp: number; linkedEmail?: string | null; invitationToken?: string;
    };
    // The mint's own `sub` is authoritative: a tombstoned link resolves to a
    // DIFFERENT canonical id than the one in the URL (#373 D3a).
    const canonical = guestSubjectFromToken(token) ?? userId;
    try {
      cacheSession(eventId, canonical, token, exp, linkedEmail ?? null, generation);
    } catch {
      // storage unavailable
    }
    return { kind: 'ok', token, userId: canonical, invitationToken };
  } catch {
    return { kind: 'error' };
  }
}

/**
 * Seconds until the cached guest token expires, or undefined when none is
 * cached / it is corrupt (cdk#1495): Shore's auth-state field on a client
 * error report. Exposes the expiry ONLY — never the token, userId or event.
 */
export function guestTokenExpiresInSeconds(): number | undefined {
  const s = readStored();
  if (!s || typeof s.exp !== 'number') return undefined;
  return Math.max(0, Math.round(s.exp - Date.now() / 1000));
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
// events → 404 (the "open your invite link" guidance, #373 D5); SEVERAL events → 300 with
// the caller's own membership list, no token (owner decision G5, register U68, cdk#1617 —
// the cross-event chooser Option D had deferred). Read-only: like the login lane of
// /auth/claim it never binds or writes an identity — it only RECOVERS the event(s) the
// caller is already on. On a 200 the minted token is cached here (same shape the
// reservations calls read) keyed to the resolved event, and the caller is handed the
// eventId to redirect into (`/e/<eventId>/`). On a 300 nothing is cached: the guest picks
// an event and goes through that event's ordinary lane.

/** One row of the cross-event chooser (U68): the id the guest picks with, plus whatever
 *  context the event row can describe it by. `name` and `date` are best-effort per row —
 *  an event whose display data could not be read is still offered, by id. There is no
 *  `place`: the event row carries no venue attribute (cdk#1617 decision, 2026-09-12); if
 *  one is ever added it arrives here as another optional field, not a new arm. */
export interface NoEventLoginChoice {
  eventId: string;
  name?: string;
  date?: string;
}

export type NoEventLoginResult =
  /** Exactly one member event: token minted + cached; redirect the guest into `eventId`. */
  | { kind: 'ok'; userId: string; eventId: string }
  /** Zero member events (#373 D5): guide to the personal invite link. */
  | { kind: 'none' }
  /** Several member events (G5 / U68): the caller's own memberships, to choose from. No
   *  token is minted; the guest picks and enters that event's lane. Never fewer than two. */
  | { kind: 'choose'; events: NoEventLoginChoice[] }
  /** The Google credential was rejected (401). */
  | { kind: 'invalid' }
  /** Anything else (network failure, 4xx/5xx) — safe to offer a retry. */
  | { kind: 'error' };

const isChoice = (row: unknown): row is NoEventLoginChoice => {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return typeof r.eventId === 'string' && r.eventId.length > 0
    && (r.name === undefined || typeof r.name === 'string')
    && (r.date === undefined || typeof r.date === 'string');
};

export async function loginNoEvent(credential: string): Promise<NoEventLoginResult> {
  try {
    const res = await fetch(PublicApi.GUEST_LOGIN, {
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
    // 300 Multiple Choices (cdk#1617 step 1): the caller's own memberships, nothing minted.
    // A 300 whose body does not carry a usable list is an error, not a chooser with no
    // rows — the backend only answers 300 for two or more events.
    if (res.status === 300) {
      const body = (await res.json().catch(() => null)) as { events?: unknown } | null;
      const events = Array.isArray(body?.events)
        ? body.events.filter(isChoice).map(({ eventId, name, date }) => ({ eventId, ...(name === undefined ? {} : { name }), ...(date === undefined ? {} : { date }) }))
        : [];
      return events.length >= 2 ? { kind: 'choose', events } : { kind: 'error' };
    }
    // Zero events is the D5 404: the guided "open your invite link".
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
