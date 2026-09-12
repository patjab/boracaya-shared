/**
 * Return a valid guest token for this userId, exchanging + caching if needed. The exchange
 * is event-scoped (cdk#427): `eventId` is the SPA's path tenant, and the mint succeeds only
 * if the userId resolves to an invitation in THAT event. Never throws; returns null when
 * either id is missing or the exchange fails.
 */
export declare function ensureGuestToken(eventId: string | null | undefined, userId: string | null | undefined): Promise<string | null>;
/** The outcome of presenting a link's credential, for the screens to branch on. */
export type InvitationExchange = 
/** A session. `userId` is the canonical id, read from the JWT's own `sub`. */
{
    kind: 'ok';
    token: string;
    userId: string;
}
/** The legacy grace period ended: this `?invited=` link is dead (cdk#1566 Q2). */
 | {
    kind: 'replaced';
}
/** Unknown, revoked, or wrong-event — deliberately indistinguishable. */
 | {
    kind: 'unknown';
}
/** Network or server fault; the caller may retry. */
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
 * `unknown` is the pre-existing "no such invitation".
 *
 * On success the server also hands back a freshly minted `invitationToken` —
 * the silent swap — which the caller puts in the URL in place of the userId.
 */
export declare function exchangeLegacyInvite(eventId: string | null | undefined, userId: string | null | undefined): Promise<InvitationExchange & {
    invitationToken?: string;
}>;
/**
 * Seconds until the cached guest token expires, or undefined when none is
 * cached / it is corrupt (cdk#1495): Shore's auth-state field on a client
 * error report. Exposes the expiry ONLY — never the token, userId or event.
 */
export declare function guestTokenExpiresInSeconds(): number | undefined;
/** Authorization header for a reservations call, or {} when no token is available. */
export declare function guestAuthHeaders(eventId: string | null | undefined, userId: string | null | undefined): Promise<Record<string, string>>;
/**
 * The identity's single linked Google for this (event, userId), or null if none (cdk#637).
 * Ensures a token first (the exchange response carries `linkedEmail`), so the gated screens
 * can render the Link vs Unlink toggle off one call. Null when no token can be minted.
 */
export declare function guestLinkedEmail(eventId: string | null | undefined, userId: string | null | undefined): Promise<string | null>;
/** One chooser option (cdk#452): label is event-scoped — this event's guest name or a generic fallback. */
export interface ClaimCandidate {
    userId: string;
    label: string;
}
export type ClaimResult = 
/** Token minted + cached; `userId` is the canonical identity to remember, and
 *  `linkedEmail` is the account now linked to it (cdk#637). */
{
    kind: 'ok';
    userId: string;
    claimed: boolean;
    linkedEmail: string | null;
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
export type NoEventLoginResult = 
/** Exactly one member event: token minted + cached; redirect the guest into `eventId`. */
{
    kind: 'ok';
    userId: string;
    eventId: string;
}
/** Zero OR many member events (#373 D5): guide to the personal invite link. No list is
 *  returned to the browser — the no-event lane defers the cross-event chooser. */
 | {
    kind: 'none';
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
/** Drop the cached guest token (e.g. on identity change / sign-out). */
export declare function clearGuestToken(): void;
