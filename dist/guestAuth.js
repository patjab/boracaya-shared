"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureGuestToken = ensureGuestToken;
exports.guestAuthHeaders = guestAuthHeaders;
exports.claimIdentity = claimIdentity;
exports.loginNoEvent = loginNoEvent;
exports.clearGuestToken = clearGuestToken;
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
const api_1 = require("./api");
const TOKEN_KEY = 'pdab_guest_token';
// Refresh a little before the real edge so an in-flight request never carries a token that
// expires mid-flight.
const SKEW_MS = 30000;
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
        const res = await fetch(api_1.GuestEventApi.exchange(eventId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        });
        // 403 (unknown invitation) / any failure -> no token; the caller proceeds without one
        // (today's open reservations API still accepts it — until the authorizer lands).
        if (!res.ok)
            return null;
        const { token, exp } = (await res.json());
        if (generation === cacheGeneration) {
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp, userId, eventId }));
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
async function ensureGuestToken(eventId, userId) {
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
/** Authorization header for a reservations call, or {} when no token is available. */
async function guestAuthHeaders(eventId, userId) {
    const token = await ensureGuestToken(eventId, userId);
    return token ? { Authorization: `Bearer ${token}` } : {};
}
async function claimIdentity(params) {
    try {
        const { eventId, ...body } = params;
        const res = await fetch(api_1.GuestEventApi.claim(eventId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (res.status === 200) {
            // The response's userId is the CANONICAL identity — after a merge it differs
            // from params.userId (the invite link's provisional id); never conflate them.
            const { token, exp, userId: canonicalUserId, claimed } = (await res.json());
            cacheGeneration += 1; // invalidate any in-flight exchange for the old identity
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp, userId: canonicalUserId, eventId }));
            return { kind: 'ok', userId: canonicalUserId, claimed: claimed === true };
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
async function loginNoEvent(credential) {
    try {
        const res = await fetch(api_1.ApiConstants.GUEST_LOGIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
        });
        if (res.status === 200) {
            const { token, exp, userId, eventId } = (await res.json());
            cacheGeneration += 1; // invalidate any in-flight exchange for a prior identity
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp, userId, eventId }));
            return { kind: 'ok', userId, eventId };
        }
        // Zero AND many both surface as 404 here (the backend never returns a cross-event
        // chooser on this lane) — one guided outcome for the SPA.
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
/** Drop the cached guest token (e.g. on identity change / sign-out). */
function clearGuestToken() {
    try {
        sessionStorage.removeItem(TOKEN_KEY);
    }
    catch (_a) {
        /* no storage (SSR) -> nothing to clear */
    }
}
