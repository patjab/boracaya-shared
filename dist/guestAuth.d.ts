/**
 * Return a valid guest token for this userId, exchanging + caching if needed. Never throws;
 * returns null when there's no userId or the exchange fails.
 */
export declare function ensureGuestToken(userId: string | null | undefined): Promise<string | null>;
/** Authorization header for a reservations call, or {} when no token is available. */
export declare function guestAuthHeaders(userId: string | null | undefined): Promise<Record<string, string>>;
/** One chooser option (cdk#452): label is event-scoped — this event's guest name or a generic fallback. */
export interface ClaimCandidate {
    userId: string;
    label: string;
}
export type ClaimResult = 
/** Token minted + cached; `userId` is the canonical identity to remember. */
{
    kind: 'ok';
    userId: string;
    claimed: boolean;
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
    credential: string;
    userId?: string;
    chooseUserId?: string;
}): Promise<ClaimResult>;
/** Drop the cached guest token (e.g. on identity change / sign-out). */
export declare function clearGuestToken(): void;
