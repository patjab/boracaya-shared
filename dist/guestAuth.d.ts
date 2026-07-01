/**
 * Return a valid guest token for this userId, exchanging + caching if needed. Never throws;
 * returns null when there's no userId or the exchange fails.
 */
export declare function ensureGuestToken(userId: string | null | undefined): Promise<string | null>;
/** Authorization header for a reservations call, or {} when no token is available. */
export declare function guestAuthHeaders(userId: string | null | undefined): Promise<Record<string, string>>;
/** Drop the cached guest token (e.g. on identity change / sign-out). */
export declare function clearGuestToken(): void;
