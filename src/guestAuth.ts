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

// One cached session per EVENT (shore#529): `pdab_guest_token:<eventId>`. A guest invited to
// two events holds both sessions in one tab, and signing out of one leaves the other alone.
// The bare key is the single slot every event used to share; it is still READ (an entry for
// the asked-for event, written before this change, stays usable) but never written again —
// the event's first write moves it to its own key.
const TOKEN_KEY = 'pdab_guest_token';
const keyFor = (eventId: string): string => `${TOKEN_KEY}:${eventId}`;
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

/** The event most recently written in this tab, for the event-less expiry read. */
let lastEventId: string | null = null;

// Sessions storage would not keep (shore#491): with site data blocked, reading the
// `sessionStorage` global itself throws, and a session minted on a 200 would be lost the
// moment it arrived — the guest shown as signed in while every call went out without a
// token. A write that fails lands here instead, so the session serves this tab for as long
// as the page lives. An entry here is always newer than storage's (a write that persists
// removes it), so a read prefers it.
const unpersisted = new Map<string, StoredToken>();

function parseEntry(raw: string | null): StoredToken | null {
  if (!raw) return null;
  try {
    const s: unknown = JSON.parse(raw);
    return s && typeof s === 'object' ? (s as StoredToken) : null;
  } catch {
    return null;
  }
}

/** The legacy single-slot entry, only if it belongs to `eventId`. Throws if storage does. */
function readLegacy(eventId: string): StoredToken | null {
  const s = parseEntry(sessionStorage.getItem(TOKEN_KEY));
  return s && s.eventId === eventId ? s : null;
}

/** This event's cached session entry, or null when absent/corrupt. Never throws. */
function readStored(eventId: string): StoredToken | null {
  const held = unpersisted.get(eventId);
  if (held) return held;
  try {
    const raw = sessionStorage.getItem(keyFor(eventId));
    if (raw !== null) {
      const s = parseEntry(raw);
      // A corrupt entry is absent; one naming another event can only be tampering.
      return s && s.eventId === eventId ? s : null;
    }
    return readLegacy(eventId);
  } catch {
    return null;
  }
}

/** Cache `entry` as its event's session: in storage, or in memory when storage refuses
 *  it (shore#491). Never throws — a server success is never turned into a failure here. */
function writeStored(entry: StoredToken): void {
  lastEventId = entry.eventId;
  try {
    sessionStorage.setItem(keyFor(entry.eventId), JSON.stringify(entry));
  } catch {
    unpersisted.set(entry.eventId, entry);
    return;
  }
  unpersisted.delete(entry.eventId);
  // Migrated: the shared slot no longer speaks for this event.
  try {
    if (readLegacy(entry.eventId)) sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* the entry is written; an unreadable old slot is no reason to fail the write */
  }
}

function readValid(eventId: string, userId: string): string | null {
  const s = readStored(eventId);
  if (s && s.userId === userId && s.token && s.exp * 1000 - SKEW_MS > Date.now()) return s.token;
  return null;
}

// A claim supersedes any in-flight exchange (#439 review): reservations calls firing on
// mount can have an exchange for the OLD identity in flight while claimIdentity() lands
// the canonical one — a stale exchange must not clobber the freshly claimed cache entry.
// Each claim bumps the generation; an exchange only writes if its snapshot still matches.
let cacheGeneration = 0;
/** Bumped by every successful unlink (shore#395): a refresh that started before it must not
 *  write the pre-unlink linkedEmail back. */
let unlinkEpoch = 0;

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
  /** A session. `userId` is the canonical id, read from the JWT's own `sub`.
   *  `displayName` (shore#503) is the guest's name as this event knows it, present
   *  only when the server named one (a backend from before it never does). */
  | { kind: 'ok'; token: string; userId: string; displayName?: string }
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

/** The mint body's `displayName` (shore#503), as a spreadable field: `{ displayName }` when
 *  the server named the guest with a non-empty string, `{}` otherwise — so a result from a
 *  backend that sends none is exactly the shape it always was. */
function displayNameField(value: unknown): { displayName?: string } {
  return typeof value === 'string' && value ? { displayName: value } : {};
}

function cacheSession(eventId: string, userId: string, token: string, exp: number,
                      linkedEmail: string | null, generation: number): void {
  if (generation !== cacheGeneration) return;
  writeStored({ token, exp, userId, eventId, linkedEmail });
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
    const { token, exp, linkedEmail, displayName } = (await res.json()) as {
      token: string; exp: number; linkedEmail?: string | null; displayName?: unknown;
    };
    const userId = guestSubjectFromToken(token);
    if (!userId) return { kind: 'error' };
    cacheSession(eventId, userId, token, exp, linkedEmail ?? null, generation);
    return { kind: 'ok', token, userId, ...displayNameField(displayName) };
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
    const { token, exp, linkedEmail, invitationToken, displayName } = (await res.json()) as {
      token: string; exp: number; linkedEmail?: string | null; invitationToken?: string;
      displayName?: unknown;
    };
    // The mint's own `sub` is authoritative: a tombstoned link resolves to a
    // DIFFERENT canonical id than the one in the URL (#373 D3a).
    const canonical = guestSubjectFromToken(token) ?? userId;
    cacheSession(eventId, canonical, token, exp, linkedEmail ?? null, generation);
    return { kind: 'ok', token, userId: canonical, invitationToken, ...displayNameField(displayName) };
  } catch {
    return { kind: 'error' };
  }
}

/**
 * Seconds until the cached guest token expires, or undefined when none is
 * cached / it is corrupt (cdk#1495): Shore's auth-state field on a client
 * error report. Exposes the expiry ONLY — never the token, userId or event.
 *
 * Sessions are cached per event (shore#529): pass `eventId` for that event's.
 * Without one it reads the session this tab cached most recently (before any,
 * the pre-#529 single slot) — what the event-less call has always meant.
 */
export function guestTokenExpiresInSeconds(eventId?: string | null): number | undefined {
  const event = eventId || lastEventId;
  let s: StoredToken | null;
  if (event) {
    s = readStored(event);
  } else {
    try {
      s = parseEntry(sessionStorage.getItem(TOKEN_KEY));
    } catch {
      s = null;
    }
  }
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
  if (!token || !eventId) return null;
  const stored = readStored(eventId);
  return stored && stored.userId === userId
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
//
// cdk#1763: the userId lane PROVES the invite session. A bare userId is a public
// identifier (cdk#1566), so the claim carries this guest's own session as
// `Authorization: Bearer <guest JWT>` — the same header the reservations calls send.
// And it never REPLACES a bound Google any more (the #1566 B2 decision): an identity
// already linked to a different account answers 409 with no `candidates`, which is
// "unlink first" (`unlinkIdentity`, then claim again), not a chooser.

/** One chooser option (cdk#452): label is event-scoped — this event's guest name or a generic fallback. */
export interface ClaimCandidate {
  userId: string;
  label: string;
}

export type ClaimResult =
  /** Token minted + cached; `userId` is the canonical identity to remember, and
   *  `linkedEmail` is the account now linked to it (cdk#637). `displayName` (shore#503)
   *  is the guest's name as this event knows it, present only when the server named one. */
  | { kind: 'ok'; userId: string; claimed: boolean; linkedEmail: string | null; displayName?: string }
  /** #373 D5 zero-match: no invitation for this email — guide to the invite link. */
  | { kind: 'none' }
  /** #373 D4 multi-match: present the chooser, then re-call with `chooseUserId`. */
  | { kind: 'chooser'; candidates: ClaimCandidate[] }
  /** cdk#1763 (the #1566 B2 decision): this invitation is already linked to a DIFFERENT
   *  Google account, and a claim never replaces it. Switching accounts is unlink-then-link:
   *  `unlinkIdentity`, then claim again. Nothing was bound and no token was minted.
   *  Only the invite-session lane (`userId` set) answers this. */
  | { kind: 'unlinkFirst' }
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
      headers: { 'Content-Type': 'application/json', ...(await claimProof(eventId, params.userId)) },
      body: JSON.stringify(body),
    });
    if (res.status === 200) {
      // The response's userId is the CANONICAL identity — after a merge it differs
      // from params.userId (the invite link's provisional id); never conflate them.
      const { token, exp, userId: canonicalUserId, claimed, linkedEmail, displayName } = (await res.json()) as {
        token: string;
        exp: number;
        userId: string;
        claimed?: boolean;
        linkedEmail?: string | null;
        displayName?: unknown;
      };
      cacheGeneration += 1; // invalidate any in-flight exchange for the old identity
      writeStored({ token, exp, userId: canonicalUserId, eventId, linkedEmail: linkedEmail ?? null });
      return {
        kind: 'ok', userId: canonicalUserId, claimed: claimed === true, linkedEmail: linkedEmail ?? null,
        ...displayNameField(displayName),
      };
    }
    if (res.status === 404) return { kind: 'none' };
    if (res.status === 401) return { kind: 'invalid' };
    if (res.status === 409) {
      // Any body that is not an object (unparseable, `null`, a bare value) has no candidates.
      const parsed: unknown = await res.json().catch(() => null);
      const candidates = parsed && typeof parsed === 'object'
        ? (parsed as { candidates?: unknown }).candidates
        : undefined;
      if (Array.isArray(candidates) && candidates.length > 0) {
        return { kind: 'chooser', candidates: candidates as ClaimCandidate[] };
      }
      // No one to choose between: the B2 refusal (cdk#1763). It is only ever the answer
      // to an invite-session claim; on the login lane a candidate-less 409 is not a state
      // the guest can act on, so it is a retryable error rather than an empty chooser.
      return params.userId ? { kind: 'unlinkFirst' } : { kind: 'error' };
    }
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

/**
 * The invite-session proof for the claim's userId lane (cdk#1763): this guest's own
 * session as a bearer header, ensured the way every reservations call ensures it.
 * The login lane (no userId) has no session to prove and sends none.
 *
 * Backward compatible both ways. A backend from before cdk#1763 reads no header on
 * this route (the gateway's CORS preflight already allows `Authorization`, which
 * `/auth/unlink` relies on), so the header is inert there. And this never throws or
 * fails the claim: no session (storage unavailable, the legacy lane closed, a failed
 * exchange) sends no header — the request every client sent before — which a cdk#1763
 * backend still accepts through the legacy grace period.
 */
async function claimProof(
  eventId: string,
  userId: string | undefined,
): Promise<Record<string, string>> {
  if (!userId) return {};
  try {
    return await guestAuthHeaders(eventId, userId);
  } catch {
    return {};
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
  /** Exactly one member event: token minted + cached; redirect the guest into `eventId`.
   *  `displayName` (shore#503) is present only when the server named the guest. */
  | { kind: 'ok'; userId: string; eventId: string; displayName?: string }
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
      const { token, exp, userId, eventId, linkedEmail, displayName } = (await res.json()) as {
        token: string;
        exp: number;
        userId: string;
        eventId: string;
        linkedEmail?: string | null;
        displayName?: unknown;
      };
      cacheGeneration += 1; // invalidate any in-flight exchange for a prior identity
      writeStored({ token, exp, userId, eventId, linkedEmail: linkedEmail ?? null });
      return { kind: 'ok', userId, eventId, ...displayNameField(displayName) };
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
  const stored = readStored(eventId);
  // The token must be THIS event's (auth is event-scoped, cdk#427) and unexpired-ish;
  // the server re-verifies, so this is only a fast local guard against a pointless call.
  if (!stored || !stored.token) return { kind: 'unauthenticated' };
  try {
    const res = await fetch(GuestEventApi.unlink(eventId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stored.token}` },
    });
    if (res.status === 200) {
      // Keep the session token — the guest stays signed in via their invite link; only
      // the linked-Google marker is cleared so the toggle flips back to "Link".
      // shore#395: clear it on the entry cached NOW, not the one read before the call — a
      // refresh that landed meanwhile renewed the token, and writing `stored` back would
      // restore the old, soon-expiring one. `unlinkEpoch` tells a refresh still in flight
      // that its linkedEmail predates this unlink.
      unlinkEpoch += 1;
      const current = readStored(eventId);
      if (current && current.userId === stored.userId) {
        writeStored({ ...current, linkedEmail: null });
      }
      return { kind: 'ok' };
    }
    if (res.status === 401) return { kind: 'unauthenticated' };
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

// ---- guest-session renewal (shore#395) ----------------------------------------------
//
// POST /events/{eventId}/auth/refresh — re-mint the LIVE guest session this tab holds for
// the event. Sessions live an hour; one minted from an invitation token renews by
// re-exchanging it, but one from a Google claim or login holds nothing to re-exchange, and
// its only other re-mint (the legacy /auth/exchange) closes after the grace period. This
// lane's credential is the session itself: the cached guest JWT as a bearer header, which
// the server takes only while it is unexpired (it extends a session, it never revives
// one), only for its own event, and only while the identity is still a member and its link
// has not been revoked by the host.
//
// The write follows the same supersession rule as the exchange lanes, and one more: the
// renewed token replaces the cache only if no claim/login bumped `cacheGeneration` while
// the request was in flight AND the cache still holds the very token that was renewed. A
// sign-out, a claim, or any other lane that wrote a different session in the meantime wins,
// and the renewal is reported as `superseded` with nothing written.

export type GuestSessionRefresh =
  /** Renewed and cached. `userId` is the canonical id from the new JWT's own `sub` (a merged
   *  identity renews as its canonical id); `linkedEmail` is the identity's linked Google or
   *  null; `displayName` is present only when the server named the guest. */
  | { kind: 'ok'; token: string; userId: string; linkedEmail: string | null; displayName?: string }
  /** No session cached for this event: nothing was sent. Not a failure — there is nothing
   *  to renew, and the guest's ordinary sign-in lanes apply. */
  | { kind: 'noSession' }
  /** 401: the session was missing, invalid or already expired. It cannot be renewed; send
   *  the guest back through their invite link or sign-in (as `UnlinkResult`'s arm). */
  | { kind: 'unauthenticated' }
  /** 403: the identity is no longer on this event's list, or the host revoked its link —
   *  deliberately indistinguishable, as `InvitationExchange`'s `unknown`. */
  | { kind: 'unknown' }
  /** The cached session changed while the renewal was in flight (a claim, a login, a
   *  sign-out or another exchange won). Nothing was written; the current cache stands. */
  | { kind: 'superseded' }
  /** Network or server fault (5xx, an unreadable 200, any other status); retryable. */
  | { kind: 'error' };

// ONE renewal per cached session at a time: concurrent callers (several requests noticing
// the edge at once) share the request, so a session is never renewed twice and the second
// renewal never reads as `superseded` by the first.
const refreshInFlight = new Map<string, Promise<GuestSessionRefresh>>();

/**
 * Renew this tab's live guest session for `eventId` (shore#395), returning the new session
 * or why there is none. Never throws. See `GuestSessionRefresh` for the outcomes.
 */
export async function refreshGuestSession(
  eventId: string | null | undefined,
): Promise<GuestSessionRefresh> {
  if (!eventId) return { kind: 'noSession' };
  const stored = readStored(eventId);
  // The cache entry must be THIS event's (auth is event-scoped, cdk#427): a session for
  // another event is not one to renew here, and the server would refuse it anyway.
  if (!stored || typeof stored.token !== 'string' || !stored.token) {
    return { kind: 'noSession' };
  }
  const flightKey = JSON.stringify([eventId, stored.token]);
  let p = refreshInFlight.get(flightKey);
  if (!p) {
    p = refresh(eventId, stored.token).finally(() => refreshInFlight.delete(flightKey));
    refreshInFlight.set(flightKey, p);
  }
  return p;
}

/** The one network call behind `refreshGuestSession`; `refreshInFlight` dedupes callers. */
async function refresh(eventId: string, sessionToken: string): Promise<GuestSessionRefresh> {
  const generation = cacheGeneration;
  const unlinks = unlinkEpoch;
  try {
    const res = await fetch(GuestEventApi.refresh(eventId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
    });
    if (res.status === 401) return { kind: 'unauthenticated' };
    if (res.status === 403) return { kind: 'unknown' };
    if (res.status !== 200) return { kind: 'error' };
    const body: unknown = await res.json();
    if (!body || typeof body !== 'object') return { kind: 'error' };
    const { token, exp, linkedEmail, displayName } = body as {
      token?: unknown; exp?: unknown; linkedEmail?: unknown; displayName?: unknown;
    };
    if (typeof token !== 'string' || typeof exp !== 'number' || !Number.isFinite(exp)) {
      return { kind: 'error' };
    }
    // The body carries no userId (cdk#1566): the new JWT's own `sub` names the identity.
    const userId = guestSubjectFromToken(token);
    if (!userId) return { kind: 'error' };
    // An unlink that completed while this request was out wins: the server may have read
    // the binding before it was removed.
    const email = unlinks === unlinkEpoch && typeof linkedEmail === 'string' && linkedEmail
      ? linkedEmail : null;
    // Supersession: an identity change (claim/login) bumped the generation, or the cache no
    // longer holds the session that was renewed (sign-out, another lane's mint).
    const current = readStored(eventId);
    if (generation !== cacheGeneration || !current || current.token !== sessionToken) {
      return { kind: 'superseded' };
    }
    writeStored({ token, exp, userId, eventId, linkedEmail: email });
    return { kind: 'ok', token, userId, linkedEmail: email, ...displayNameField(displayName) };
  } catch {
    return { kind: 'error' };
  }
}

/**
 * Drop the cached guest session (e.g. on identity change / sign-out).
 *
 * With `eventId`, only THAT event's session goes (shore#529): signing out of one event
 * must not sign the guest out of another they hold a session for in this tab. Without
 * one, every event's session goes — a sign-out everywhere, as the single slot used to.
 */
export function clearGuestToken(eventId?: string | null): void {
  if (eventId) unpersisted.delete(eventId);
  else unpersisted.clear();
  try {
    if (eventId) {
      sessionStorage.removeItem(keyFor(eventId));
      if (readLegacy(eventId)) sessionStorage.removeItem(TOKEN_KEY);
      return;
    }
    sessionStorage.removeItem(TOKEN_KEY);
    const prefix = keyFor('');
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {
    /* no storage (SSR) -> nothing to clear */
  }
}
