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
export declare function hasGuestSession(eventId: string | null | undefined, userId: string | null | undefined): boolean;
/**
 * Return a valid guest token for this userId, exchanging + caching if needed. The exchange
 * is event-scoped (cdk#427): `eventId` is the SPA's path tenant, and the mint succeeds only
 * if the userId resolves to an invitation in THAT event. Never throws; returns null when
 * either id is missing or the exchange fails.
 */
export declare function ensureGuestToken(eventId: string | null | undefined, userId: string | null | undefined): Promise<string | null>;
/** The outcome of presenting a link's credential, for the screens to branch on. */
export type InvitationExchange = 
/** A session. `userId` is the canonical id, read from the JWT's own `sub`.
 *  `displayName` (shore#503) is the guest's name as this event knows it, present
 *  only when the server named one (a backend from before it never does). */
{
    kind: 'ok';
    token: string;
    userId: string;
    displayName?: string;
}
/** The legacy grace period ended: this `?invited=` link is dead (cdk#1566 Q2). */
 | {
    kind: 'replaced';
}
/** Unknown, revoked, or wrong-event — deliberately indistinguishable. The server's own
 *  refusal ("unknown invitation"): a definite answer, not a fault to retry (shore#401). */
 | {
    kind: 'unknown';
}
/** Network or server fault, or a 403 the auth service did not write (a WAF block, whose
 *  body is not the service's JSON); the caller may retry. */
 | {
    kind: 'error';
};
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
export declare function guestSubjectFromToken(token: string | null | undefined): string | null;
/**
 * Exchange an invitation TOKEN (the `?invite=` link's credential) for an
 * event-scoped guest session (cdk#1566).
 *
 * Unlike `ensureGuestToken`, the caller does not know its own userId yet — the
 * token is the only thing the link carries — so the cache is written after the
 * response, keyed on the `sub` the JWT itself names.
 */
export declare function exchangeInvitationToken(eventId: string | null | undefined, invitationToken: string | null | undefined): Promise<InvitationExchange>;
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
export declare function exchangeLegacyInvite(eventId: string | null | undefined, userId: string | null | undefined): Promise<LegacyExchange>;
/** The legacy exchange's wire shape: a session plus, on a first use, the swapped-in token. */
type LegacyExchange = InvitationExchange & {
    invitationToken?: string;
};
/**
 * Seconds until the cached guest token expires, or undefined when none is
 * cached / it is corrupt (cdk#1495): Shore's auth-state field on a client
 * error report. Exposes the expiry ONLY — never the token, userId or event.
 *
 * Sessions are cached per event (shore#529): pass `eventId` for that event's.
 * Without one it reads the session this tab cached most recently (before any,
 * the pre-#529 single slot) — what the event-less call has always meant.
 */
export declare function guestTokenExpiresInSeconds(eventId?: string | null): number | undefined;
/** Authorization header for a reservations call, or {} when no token is available. */
export declare function guestAuthHeaders(eventId: string | null | undefined, userId: string | null | undefined): Promise<Record<string, string>>;
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
export declare function guestLinkedEmail(eventId: string | null | undefined, userId: string | null | undefined): Promise<string | null>;
/** One chooser option (cdk#452): label is event-scoped — this event's guest name or a generic fallback. */
export interface ClaimCandidate {
    userId: string;
    label: string;
}
export type ClaimResult = 
/** Token minted + cached; `userId` is the canonical identity to remember, and
 *  `linkedEmail` is the account now linked to it (cdk#637). `displayName` (shore#503)
 *  is the guest's name as this event knows it, present only when the server named one. */
{
    kind: 'ok';
    userId: string;
    claimed: boolean;
    linkedEmail: string | null;
    displayName?: string;
}
/** #373 D5 zero-match: no invitation for this email — guide to the invite link. */
 | {
    kind: 'none';
}
/** #373 D4 multi-match: present the chooser, then re-call with `chooseUserId`. */
 | {
    kind: 'chooser';
    candidates: ClaimCandidate[];
}
/** cdk#1763 (the #1566 B2 decision): this invitation is already linked to a DIFFERENT
 *  Google account, and a claim never replaces it. Switching accounts is unlink-then-link:
 *  `unlinkIdentity`, then claim again. Nothing was bound and no token was minted.
 *  Only the invite-session lane (`userId` set) answers this. */
 | {
    kind: 'unlinkFirst';
}
/** The Google credential was rejected (401). */
 | {
    kind: 'invalid';
}
/** Anything else (network failure, 4xx/5xx) — safe to offer a retry. */
 | {
    kind: 'error';
};
export declare function claimIdentity(params: {
    /** The SPA's path tenant (cdk#427): candidates/labels are scoped to this event (cdk#452). */
    eventId: string;
    credential: string;
    userId?: string;
    chooseUserId?: string;
}): Promise<ClaimResult>;
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
{
    kind: 'ok';
    userId: string;
    eventId: string;
    displayName?: string;
}
/** Zero member events (#373 D5): guide to the personal invite link. */
 | {
    kind: 'none';
}
/** Several member events (G5 / U68): the caller's own memberships, to choose from. No
 *  token is minted; the guest picks and enters that event's lane. Never fewer than two. */
 | {
    kind: 'choose';
    events: NoEventLoginChoice[];
}
/** The Google credential was rejected (401). */
 | {
    kind: 'invalid';
}
/** Anything else (network failure, 4xx/5xx) — safe to offer a retry. */
 | {
    kind: 'error';
};
export declare function loginNoEvent(credential: string): Promise<NoEventLoginResult>;
export type UnlinkResult = 
/** The binding was removed (or was already absent) — the identity is now unlinked. */
{
    kind: 'ok';
}
/** No cached token, or the server rejected it (401): the SPA should send the guest back
 *  through their invite link. */
 | {
    kind: 'unauthenticated';
}
/** Anything else (network failure, 4xx/5xx) — safe to offer a retry. */
 | {
    kind: 'error';
};
export declare function unlinkIdentity(eventId: string): Promise<UnlinkResult>;
export type GuestSessionRefresh = 
/** Renewed and cached. `userId` is the canonical id from the new JWT's own `sub` (a merged
 *  identity renews as its canonical id); `linkedEmail` is the identity's linked Google or
 *  null; `displayName` is present only when the server named the guest. */
{
    kind: 'ok';
    token: string;
    userId: string;
    linkedEmail: string | null;
    displayName?: string;
}
/** No session cached for this event: nothing was sent. Not a failure — there is nothing
 *  to renew, and the guest's ordinary sign-in lanes apply. */
 | {
    kind: 'noSession';
}
/** 401: the session was missing, invalid or already expired. It cannot be renewed; send
 *  the guest back through their invite link or sign-in (as `UnlinkResult`'s arm). */
 | {
    kind: 'unauthenticated';
}
/** 403: the identity is no longer on this event's list, or the host revoked its link —
 *  deliberately indistinguishable, as `InvitationExchange`'s `unknown`. A 403 the auth
 *  service did not write (a WAF block) is `error` instead (shore#401). */
 | {
    kind: 'unknown';
}
/** The cached session changed while the renewal was in flight (a claim, a login, a
 *  sign-out or another exchange won). Nothing was written; the current cache stands. */
 | {
    kind: 'superseded';
}
/** Network or server fault (5xx, an unreadable 200, any other status); retryable. */
 | {
    kind: 'error';
};
/**
 * Renew this tab's live guest session for `eventId` (shore#395), returning the new session
 * or why there is none. Never throws. See `GuestSessionRefresh` for the outcomes.
 */
export declare function refreshGuestSession(eventId: string | null | undefined): Promise<GuestSessionRefresh>;
/**
 * Drop the cached guest session (e.g. on identity change / sign-out).
 *
 * With `eventId`, only THAT event's session goes (shore#529): signing out of one event
 * must not sign the guest out of another they hold a session for in this tab. Without
 * one, every event's session goes — a sign-out everywhere, as the single slot used to.
 */
export declare function clearGuestToken(eventId?: string | null): void;
export {};
