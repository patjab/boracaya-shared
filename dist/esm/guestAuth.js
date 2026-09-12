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
const TOKEN_KEY = 'pdab_guest_token';
// Refresh a little before the real edge so an in-flight request never carries a token that
// expires mid-flight.
const SKEW_MS = 30000;
/** The cached guest token entry, or null when absent/corrupt. */
function readStored() {
    try {
        const raw = sessionStorage.getItem(TOKEN_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch (_a) {
        return null;
    }
}
function readValid(eventId, userId) {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw)
        return null;
    try {
        const s = JSON.parse(raw);
        if (s.eventId === eventId && s.userId === userId && s.token
            && s.exp * 1000 - SKEW_MS > Date.now())
            return s.token;
    }
    catch (_a) {
        /* corrupt entry -> treat as absent (a pre-#427 entry without eventId parses
           fine and is rejected by the eventId equality check above instead) */
    }
    return null;
}
// Dedup concurrent exchanges for the same userId (several reservations calls fire on mount).
const inFlight = new Map();
// A claim supersedes any in-flight exchange (#439 review): reservations calls firing on
// mount can have an exchange for the OLD identity in flight while claimIdentity() lands
// the canonical one — a stale exchange must not clobber the freshly claimed cache entry.
// Each claim bumps the generation; an exchange only writes if its snapshot still matches.
let cacheGeneration = 0;
async function exchange(eventId, userId) {
    const generation = cacheGeneration;
    try {
        const res = await fetch(GuestEventApi.exchange(eventId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        });
        // 403 (unknown invitation) / any failure -> no token; the caller proceeds without one
        // (today's open reservations API still accepts it — until the authorizer lands).
        if (!res.ok)
            return null;
        const { token, exp, linkedEmail } = (await res.json());
        if (generation === cacheGeneration) {
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp, userId, eventId, linkedEmail: linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null }));
        }
        return token; // still valid for THIS caller's request even when superseded
    }
    catch (_a) {
        return null;
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
    // JSON-encoded composite: collision-free even if an id ever contained ':'.
    const flightKey = JSON.stringify([eventId, userId]);
    let p = inFlight.get(flightKey);
    if (!p) {
        p = exchange(eventId, userId).finally(() => inFlight.delete(flightKey));
        inFlight.set(flightKey, p);
    }
    return p;
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
    if (!token)
        return null;
    try {
        const payload = token.split('.')[1];
        if (!payload)
            return null;
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        const sub = JSON.parse(json).sub;
        return typeof sub === 'string' && sub ? sub : null;
    }
    catch (_a) {
        return null;
    }
}
function cacheSession(eventId, userId, token, exp, linkedEmail, generation) {
    if (generation !== cacheGeneration)
        return;
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp, userId, eventId, linkedEmail }));
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
        if (res.status === 403)
            return { kind: 'unknown' };
        if (!res.ok)
            return { kind: 'error' };
        const { token, exp, linkedEmail } = (await res.json());
        const userId = guestSubjectFromToken(token);
        if (!userId)
            return { kind: 'error' };
        try {
            cacheSession(eventId, userId, token, exp, linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null, generation);
        }
        catch (_a) {
            // storage unavailable — the session just won't survive a reload
        }
        return { kind: 'ok', token, userId };
    }
    catch (_b) {
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
export async function exchangeLegacyInvite(eventId, userId) {
    var _a;
    if (!eventId || !userId)
        return { kind: 'unknown' };
    const generation = cacheGeneration;
    try {
        const res = await fetch(GuestEventApi.exchange(eventId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        });
        if (res.status === 403) {
            const body = (await res.json().catch(() => ({})));
            return body.error === 'invitation link replaced'
                ? { kind: 'replaced' }
                : { kind: 'unknown' };
        }
        if (!res.ok)
            return { kind: 'error' };
        const { token, exp, linkedEmail, invitationToken } = (await res.json());
        // The mint's own `sub` is authoritative: a tombstoned link resolves to a
        // DIFFERENT canonical id than the one in the URL (#373 D3a).
        const canonical = (_a = guestSubjectFromToken(token)) !== null && _a !== void 0 ? _a : userId;
        try {
            cacheSession(eventId, canonical, token, exp, linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null, generation);
        }
        catch (_b) {
            // storage unavailable
        }
        return { kind: 'ok', token, userId: canonical, invitationToken };
    }
    catch (_c) {
        return { kind: 'error' };
    }
}
/**
 * Seconds until the cached guest token expires, or undefined when none is
 * cached / it is corrupt (cdk#1495): Shore's auth-state field on a client
 * error report. Exposes the expiry ONLY — never the token, userId or event.
 */
export function guestTokenExpiresInSeconds() {
    const s = readStored();
    if (!s || typeof s.exp !== 'number')
        return undefined;
    return Math.max(0, Math.round(s.exp - Date.now() / 1000));
}
/** Authorization header for a reservations call, or {} when no token is available. */
export async function guestAuthHeaders(eventId, userId) {
    const token = await ensureGuestToken(eventId, userId);
    return token ? { Authorization: `Bearer ${token}` } : {};
}
/**
 * The identity's single linked Google for this (event, userId), or null if none (cdk#637).
 * Ensures a token first (the exchange response carries `linkedEmail`), so the gated screens
 * can render the Link vs Unlink toggle off one call. Null when no token can be minted.
 */
export async function guestLinkedEmail(eventId, userId) {
    var _a;
    const token = await ensureGuestToken(eventId, userId);
    if (!token)
        return null;
    const stored = readStored();
    return stored && stored.eventId === eventId && stored.userId === userId
        ? (_a = stored.linkedEmail) !== null && _a !== void 0 ? _a : null
        : null;
}
export async function claimIdentity(params) {
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
            const { token, exp, userId: canonicalUserId, claimed, linkedEmail } = (await res.json());
            cacheGeneration += 1; // invalidate any in-flight exchange for the old identity
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
                token, exp, userId: canonicalUserId, eventId, linkedEmail: linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null,
            }));
            return { kind: 'ok', userId: canonicalUserId, claimed: claimed === true, linkedEmail: linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null };
        }
        if (res.status === 404)
            return { kind: 'none' };
        if (res.status === 401)
            return { kind: 'invalid' };
        if (res.status === 409) {
            const { candidates } = (await res.json());
            return { kind: 'chooser', candidates: Array.isArray(candidates) ? candidates : [] };
        }
        return { kind: 'error' };
    }
    catch (_a) {
        return { kind: 'error' };
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
            const { token, exp, userId, eventId, linkedEmail } = (await res.json());
            cacheGeneration += 1; // invalidate any in-flight exchange for a prior identity
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp, userId, eventId, linkedEmail: linkedEmail !== null && linkedEmail !== void 0 ? linkedEmail : null }));
            return { kind: 'ok', userId, eventId };
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
    const stored = readStored();
    // The token must be THIS event's (auth is event-scoped, cdk#427) and unexpired-ish;
    // the server re-verifies, so this is only a fast local guard against a pointless call.
    if (!stored || !stored.token || stored.eventId !== eventId)
        return { kind: 'unauthenticated' };
    try {
        const res = await fetch(GuestEventApi.unlink(eventId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stored.token}` },
        });
        if (res.status === 200) {
            // Keep the session token — the guest stays signed in via their invite link; only
            // the linked-Google marker is cleared so the toggle flips back to "Link".
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ ...stored, linkedEmail: null }));
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
/** Drop the cached guest token (e.g. on identity change / sign-out). */
export function clearGuestToken() {
    try {
        sessionStorage.removeItem(TOKEN_KEY);
    }
    catch (_a) {
        /* no storage (SSR) -> nothing to clear */
    }
}
