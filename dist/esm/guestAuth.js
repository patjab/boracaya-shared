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
import { GuestEventApi, PublicApi } from './publicApi.js';
// One cached session per EVENT (shore#529): `pdab_guest_token:<eventId>`. A guest invited to
// two events holds both sessions in one tab, and signing out of one leaves the other alone.
// The bare key is the single slot every event used to share; it is still READ (an entry for
// the asked-for event, written before this change, stays usable) but never written again —
// the event's first write moves it to its own key.
const TOKEN_KEY = 'pdab_guest_token';
const keyFor = (eventId) => `${TOKEN_KEY}:${eventId}`;
// Refresh a little before the real edge so an in-flight request never carries a token that
// expires mid-flight.
const SKEW_MS = 30000;
/** The entry's expiry on this device's clock, in epoch ms (see `expiresAt`). */
const expiryMs = (s) => typeof s.expiresAt === 'number' ? s.expiresAt : s.exp * 1000;
/** The event most recently written in this tab, for the event-less expiry read. */
let lastEventId = null;
// Sessions storage would not keep (shore#491): with site data blocked, reading the
// `sessionStorage` global itself throws, and a session minted on a 200 would be lost the
// moment it arrived — the guest shown as signed in while every call went out without a
// token. A write that fails lands here instead, so the session serves this tab for as long
// as the page lives. An entry here is always newer than storage's (a write that persists
// removes it), so a read prefers it.
const unpersisted = new Map();
function parseEntry(raw) {
    if (!raw)
        return null;
    try {
        const s = JSON.parse(raw);
        return s && typeof s === 'object' ? s : null;
    }
    catch (_a) {
        return null;
    }
}
/** The legacy single-slot entry, only if it belongs to `eventId`. Throws if storage does. */
function readLegacy(eventId) {
    const s = parseEntry(sessionStorage.getItem(TOKEN_KEY));
    return s && s.eventId === eventId ? s : null;
}
/** This event's cached session entry, or null when absent/corrupt. Never throws. */
function readStored(eventId) {
    const held = unpersisted.get(eventId);
    if (held)
        return held;
    try {
        const raw = sessionStorage.getItem(keyFor(eventId));
        if (raw !== null) {
            const s = parseEntry(raw);
            // A corrupt entry is absent; one naming another event can only be tampering.
            return s && s.eventId === eventId ? s : null;
        }
        return readLegacy(eventId);
    }
    catch (_a) {
        return null;
    }
}
/** Cache `entry` as its event's session: in storage, or in memory when storage refuses
 *  it (shore#491). Never throws — a server success is never turned into a failure here. */
function writeStored(entry) {
    lastEventId = entry.eventId;
    try {
        sessionStorage.setItem(keyFor(entry.eventId), JSON.stringify(entry));
    }
    catch (_a) {
        unpersisted.set(entry.eventId, entry);
        return;
    }
    unpersisted.delete(entry.eventId);
    // Migrated: the shared slot no longer speaks for this event.
    try {
        if (readLegacy(entry.eventId))
            sessionStorage.removeItem(TOKEN_KEY);
    }
    catch (_b) {
        /* the entry is written; an unreadable old slot is no reason to fail the write */
    }
}
function readValid(eventId, userId) {
    const s = readStored(eventId);
    if (s && s.userId === userId && s.token && expiryMs(s) - SKEW_MS > Date.now())
        return s.token;
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
const inFlight = new Map();
function legacyExchangeOnce(eventId, userId) {
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
export function hasGuestSession(eventId, userId) {
    if (!eventId || !userId)
        return false;
    try {
        return readValid(eventId, userId) !== null;
    }
    catch (_a) {
        return false;
    }
}
/**
 * Return a valid guest token for this userId, exchanging + caching if needed. The exchange
 * is event-scoped (cdk#427): `eventId` is the SPA's path tenant, and the mint succeeds only
 * if the userId resolves to an invitation in THAT event. Never throws; returns null when
 * either id is missing or the exchange fails.
 */
export async function ensureGuestToken(eventId, userId) {
    if (!eventId || !userId)
        return null;
    const cached = readValid(eventId, userId);
    if (cached)
        return cached;
    // 403 (unknown / replaced) or any failure -> no token; the caller proceeds without one.
    const result = await legacyExchangeOnce(eventId, userId);
    return result.kind === 'ok' ? result.token : null;
}
/**
 * The auth service's own 403 refusal, read from its body (shore#401), or null for any other
 * 403. The perimeter answers 403 too — the WAF's /auth/ rate limit blocks with a default
 * body that is not JSON — and that is transient: reading it as a refusal would sign out a
 * guest holding a perfectly good session. Only the service's two bodies are refusals.
 */
async function refusal(res) {
    const body = await res.json().catch(() => null);
    const error = body && typeof body === 'object' ? body.error : undefined;
    if (error === 'invitation link replaced')
        return 'replaced';
    if (error === 'unknown invitation')
        return 'unknown';
    return null;
}
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
export function guestSubjectFromToken(token) {
    var _a;
    const sub = (_a = tokenClaims(token)) === null || _a === void 0 ? void 0 : _a.sub;
    return typeof sub === 'string' && sub ? sub : null;
}
/** A JWT's payload claims, unverified (the server verifies), or null when unreadable. */
function tokenClaims(token) {
    if (!token)
        return null;
    try {
        const payload = token.split('.')[1];
        if (!payload)
            return null;
        const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        return claims && typeof claims === 'object' ? claims : null;
    }
    catch (_a) {
        return null;
    }
}
/** The cache entry for a session just received (shore#530): `expiresAt` is the token's own
 *  lifetime from its `iat` to the `exp` the server sent, counted from now, so the device's
 *  clock offset from the server's cancels out. Without a usable `iat` it is left off. */
function received(entry) {
    var _a;
    const iat = (_a = tokenClaims(entry.token)) === null || _a === void 0 ? void 0 : _a.iat;
    return typeof iat === 'number' && Number.isFinite(iat) && Number.isFinite(entry.exp) && entry.exp > iat
        ? { ...entry, expiresAt: Date.now() + (entry.exp - iat) * 1000 }
        : entry;
}
/** The mint body's `displayName` (shore#503), as a spreadable field: `{ displayName }` when
 *  the server named the guest with a non-empty string, `{}` otherwise — so a result from a
 *  backend that sends none is exactly the shape it always was. */
function displayNameField(value) {
    return typeof value === 'string' && value ? { displayName: value } : {};
}
function cacheSession(eventId, userId, token, exp, linkedEmail, generation) {
    if (generation !== cacheGeneration)
        return;
    writeStored(received({ token, exp, userId, eventId, linkedEmail }));
}
/**
 * Exchange an invitation TOKEN (the `?invite=` link's credential) for an
 * event-scoped guest session (cdk#1566).
 *
 * Unlike `ensureGuestToken`, the caller does not know its own userId yet — the
 * token is the only thing the link carries — so the cache is written after the
 * response, keyed on the `sub` the JWT itself names.
 */
export async function exchangeInvitationToken(eventId, invitationToken) {
    if (!eventId || !invitationToken)
        return { kind: 'unknown' };
    const generation = cacheGeneration;
    try {
        const res = await fetch(GuestEventApi.guestToken(eventId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: invitationToken }),
        });
        // Either refusal is "no such invitation" here: `replaced` is a legacy-link answer.
        if (res.status === 403)
            return (await refusal(res)) ? { kind: 'unknown' } : { kind: 'error' };
        if (!res.ok)
            return { kind: 'error' };
        const { token, exp, linkedEmail, displayName } = (await res.json());
        const userId = guestSubjectFromToken(token);
        if (!userId)
            return { kind: 'error' };
        cacheSession(eventId, userId, token, exp, linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null, generation);
        return { kind: 'ok', token, userId, ...displayNameField(displayName) };
    }
    catch (_a) {
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
 * `unknown` is the pre-existing "no such invitation". Both are the server's
 * definite answer; a 403 with any other body (a WAF block) is `error`.
 *
 * On success the server also hands back a freshly minted `invitationToken` —
 * the silent swap — which the caller puts in the URL in place of the userId.
 */
export async function exchangeLegacyInvite(eventId, userId) {
    if (!eventId || !userId)
        return { kind: 'unknown' };
    return legacyExchangeOnce(eventId, userId);
}
/** The one network call behind `exchangeLegacyInvite` AND `ensureGuestToken`; never call it
 *  directly — `legacyExchangeOnce` is what keeps concurrent callers on a single request. */
async function legacyExchange(eventId, userId) {
    var _a;
    const generation = cacheGeneration;
    try {
        const res = await fetch(GuestEventApi.exchange(eventId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        });
        if (res.status === 403) {
            const refused = await refusal(res);
            return refused ? { kind: refused } : { kind: 'error' };
        }
        if (!res.ok)
            return { kind: 'error' };
        const { token, exp, linkedEmail, invitationToken, displayName } = (await res.json());
        // The mint's own `sub` is authoritative: a tombstoned link resolves to a
        // DIFFERENT canonical id than the one in the URL (#373 D3a).
        const canonical = (_a = guestSubjectFromToken(token)) !== null && _a !== void 0 ? _a : userId;
        cacheSession(eventId, canonical, token, exp, linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null, generation);
        return { kind: 'ok', token, userId: canonical, invitationToken, ...displayNameField(displayName) };
    }
    catch (_b) {
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
export function guestTokenExpiresInSeconds(eventId) {
    const event = eventId || lastEventId;
    let s;
    if (event) {
        s = readStored(event);
    }
    else {
        try {
            s = parseEntry(sessionStorage.getItem(TOKEN_KEY));
        }
        catch (_a) {
            s = null;
        }
    }
    if (!s || (typeof s.exp !== 'number' && typeof s.expiresAt !== 'number'))
        return undefined;
    return Math.max(0, Math.round((expiryMs(s) - Date.now()) / 1000));
}
/** Authorization header for a reservations call, or {} when no token is available. */
export async function guestAuthHeaders(eventId, userId) {
    const token = await ensureGuestToken(eventId, userId);
    return token ? { Authorization: `Bearer ${token}` } : {};
}
/**
 * The identity's single linked Google for this (event, userId), or null if none (cdk#637).
 * Ensures a token first (the exchange response carries `linkedEmail`), so the gated screens
 * can render the Link vs Unlink toggle off one call.
 *
 * Null is only ever a confirmed "no Google linked" (shore#483). When the link state cannot
 * be known — no session could be minted (a 429, a 5xx, offline, a refused id) or an id is
 * missing — this REJECTS. A caller must not offer Link on a rejection: the claim it starts
 * binds the incoming Google, and with the current one unseen no "replace?" check can run.
 */
export async function guestLinkedEmail(eventId, userId) {
    var _a;
    const token = await ensureGuestToken(eventId, userId);
    const stored = token && eventId ? readStored(eventId) : null;
    if (!stored || stored.userId !== userId)
        throw new Error('guest link state unavailable');
    return (_a = stored.linkedEmail) !== null && _a !== void 0 ? _a : null;
}
export async function claimIdentity(params) {
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
            const { token, exp, userId: canonicalUserId, claimed, linkedEmail, displayName } = (await res.json());
            cacheGeneration += 1; // invalidate any in-flight exchange for the old identity
            writeStored(received({ token, exp, userId: canonicalUserId, eventId, linkedEmail: linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null }));
            return {
                kind: 'ok', userId: canonicalUserId, claimed: claimed === true, linkedEmail: linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null,
                ...displayNameField(displayName),
            };
        }
        if (res.status === 404)
            return { kind: 'none' };
        if (res.status === 401)
            return { kind: 'invalid' };
        if (res.status === 409) {
            // Any body that is not an object (unparseable, `null`, a bare value) has no candidates.
            const parsed = await res.json().catch(() => null);
            const candidates = parsed && typeof parsed === 'object'
                ? parsed.candidates
                : undefined;
            if (Array.isArray(candidates) && candidates.length > 0) {
                return { kind: 'chooser', candidates: candidates };
            }
            // No one to choose between: the B2 refusal (cdk#1763). It is only ever the answer
            // to an invite-session claim; on the login lane a candidate-less 409 is not a state
            // the guest can act on, so it is a retryable error rather than an empty chooser.
            return params.userId ? { kind: 'unlinkFirst' } : { kind: 'error' };
        }
        return { kind: 'error' };
    }
    catch (_a) {
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
async function claimProof(eventId, userId) {
    if (!userId)
        return {};
    try {
        return await guestAuthHeaders(eventId, userId);
    }
    catch (_a) {
        return {};
    }
}
const isChoice = (row) => {
    if (!row || typeof row !== 'object')
        return false;
    const r = row;
    return typeof r.eventId === 'string' && r.eventId.length > 0
        && (r.name === undefined || typeof r.name === 'string')
        && (r.date === undefined || typeof r.date === 'string');
};
export async function loginNoEvent(credential) {
    try {
        const res = await fetch(PublicApi.GUEST_LOGIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
        });
        if (res.status === 200) {
            const { token, exp, userId, eventId, linkedEmail, displayName } = (await res.json());
            cacheGeneration += 1; // invalidate any in-flight exchange for a prior identity
            writeStored(received({ token, exp, userId, eventId, linkedEmail: linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null }));
            return { kind: 'ok', userId, eventId, ...displayNameField(displayName) };
        }
        // 300 Multiple Choices (cdk#1617 step 1): the caller's own memberships, nothing minted.
        // A 300 whose body does not carry a usable list is an error, not a chooser with no
        // rows — the backend only answers 300 for two or more events.
        if (res.status === 300) {
            const body = (await res.json().catch(() => null));
            const events = Array.isArray(body === null || body === void 0 ? void 0 : body.events)
                ? body.events.filter(isChoice).map(({ eventId, name, date }) => ({ eventId, ...(name === undefined ? {} : { name }), ...(date === undefined ? {} : { date }) }))
                : [];
            return events.length >= 2 ? { kind: 'choose', events } : { kind: 'error' };
        }
        // Zero events is the D5 404: the guided "open your invite link".
        if (res.status === 404)
            return { kind: 'none' };
        if (res.status === 401)
            return { kind: 'invalid' };
        return { kind: 'error' };
    }
    catch (_a) {
        return { kind: 'error' };
    }
}
export async function unlinkIdentity(eventId) {
    const stored = readStored(eventId);
    // The token must be THIS event's (auth is event-scoped, cdk#427) and unexpired-ish;
    // the server re-verifies, so this is only a fast local guard against a pointless call.
    if (!stored || !stored.token)
        return { kind: 'unauthenticated' };
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
        if (res.status === 401)
            return { kind: 'unauthenticated' };
        return { kind: 'error' };
    }
    catch (_a) {
        return { kind: 'error' };
    }
}
// ONE renewal per cached session at a time: concurrent callers (several requests noticing
// the edge at once) share the request, so a session is never renewed twice and the second
// renewal never reads as `superseded` by the first.
const refreshInFlight = new Map();
/**
 * Renew this tab's live guest session for `eventId` (shore#395), returning the new session
 * or why there is none. Never throws. See `GuestSessionRefresh` for the outcomes.
 */
export async function refreshGuestSession(eventId) {
    if (!eventId)
        return { kind: 'noSession' };
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
async function refresh(eventId, sessionToken) {
    const generation = cacheGeneration;
    const unlinks = unlinkEpoch;
    try {
        const res = await fetch(GuestEventApi.refresh(eventId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        });
        if (res.status === 401)
            return { kind: 'unauthenticated' };
        if (res.status === 403)
            return (await refusal(res)) ? { kind: 'unknown' } : { kind: 'error' };
        if (res.status !== 200)
            return { kind: 'error' };
        const body = await res.json();
        if (!body || typeof body !== 'object')
            return { kind: 'error' };
        const { token, exp, linkedEmail, displayName } = body;
        if (typeof token !== 'string' || typeof exp !== 'number' || !Number.isFinite(exp)) {
            return { kind: 'error' };
        }
        // The body carries no userId (cdk#1566): the new JWT's own `sub` names the identity.
        const userId = guestSubjectFromToken(token);
        if (!userId)
            return { kind: 'error' };
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
        writeStored(received({ token, exp, userId, eventId, linkedEmail: email }));
        return { kind: 'ok', token, userId, linkedEmail: email, ...displayNameField(displayName) };
    }
    catch (_a) {
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
export function clearGuestToken(eventId) {
    if (eventId)
        unpersisted.delete(eventId);
    else
        unpersisted.clear();
    try {
        if (eventId) {
            sessionStorage.removeItem(keyFor(eventId));
            if (readLegacy(eventId))
                sessionStorage.removeItem(TOKEN_KEY);
            return;
        }
        sessionStorage.removeItem(TOKEN_KEY);
        const prefix = keyFor('');
        for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
            const key = sessionStorage.key(i);
            if (key === null || key === void 0 ? void 0 : key.startsWith(prefix))
                sessionStorage.removeItem(key);
        }
    }
    catch (_a) {
        /* no storage (SSR) -> nothing to clear */
    }
}
