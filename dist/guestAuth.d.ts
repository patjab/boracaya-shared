/**
 * Return a valid guest token for this userId, exchanging + caching if needed. The exchange
 * is event-scoped (cdk#427): `eventId` is the SPA's path tenant, and the mint succeeds only
 * if the userId resolves to an invitation in THAT event. Never throws; returns null when
 * either id is missing or the exchange fails.
 */
export declare function ensureGuestToken(eventId: string | null | undefined, userId: string | null | undefined): Promise<string | null>;
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
