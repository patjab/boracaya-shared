import { GuardedState } from './data';
/**
 * Default freshness window. Sized for the tab-bounce pattern: a value fetched
 * on one screen visit is served instantly on a re-visit within this window
 * (no fetch at all); older values are served instantly but revalidated in the
 * background. Override per call via `ttlMs`.
 */
export declare const DEFAULT_CACHE_TTL_MS = 30000;
/** A cached value plus whether it is still within its freshness window. */
export interface CacheHit<T> {
    value: T;
    isFresh: boolean;
}
/**
 * Read a cached value. Entries never expire out of the map — TTL only decides
 * `isFresh` (fresh = serve without fetching; stale = serve AND revalidate),
 * which is what makes stale-while-revalidate possible.
 */
export declare function readCache<T>(key: string, ttlMs?: number): CacheHit<T> | undefined;
/** Store a value under a key, restarting its freshness window. */
export declare function writeCache<T>(key: string, value: T): void;
/**
 * Drop every entry whose key equals or starts with the argument — pass a full
 * key to invalidate one resource, or a shared prefix (e.g. the eventId) to
 * invalidate everything under an event after a write. The next load for a
 * dropped key is a full cold fetch.
 */
export declare function invalidateCache(keyOrPrefix: string): void;
/** Clear the whole cache. For tests (and sign-out-shaped resets). */
export declare function resetCache(): void;
export interface CachedLoadOptions<T> {
    /** Cache key — callers key per eventId+resource, e.g. `${eventId}/guests`. */
    key: string;
    /**
     * The fetch + view-model transform, exactly as passed to useGuardedLoad —
     * plus the AbortSignal to thread into getJson/sendJson so a key switch
     * actually cancels the network request (not just the state write).
     */
    load: (signal: AbortSignal) => Promise<T>;
    /** State sink; hooks/useCachedLoad binds this to component state. */
    set: (next: GuardedState<T>) => void;
    /** Surfaced (via the guarded contract) when a cold load fails. */
    errorMessage: string;
    /** Freshness window; defaults to DEFAULT_CACHE_TTL_MS. */
    ttlMs?: number;
}
export interface CachedLoadHandle {
    /**
     * Run the load for the handle's key: fresh hit → serve with no fetch;
     * stale hit → serve instantly, revalidate in the background; miss → the
     * plain guarded contract (loading state, then data or errorMessage).
     * Also the reload: to force a refetch, invalidateCache(key) first.
     */
    run: () => void;
    /**
     * Stop writing state and abort any in-flight fetch. Call on unmount or key
     * switch (hooks/useCachedLoad creates one handle per key and disposes the
     * old one — that dispose IS the key-switch abort).
     */
    dispose: () => void;
}
/**
 * The cache-aware load orchestration, as a plain function (the runGuarded
 * pattern) so stale-while-revalidate, invalidation, and abort semantics are
 * testable without React.
 */
export declare function createCachedLoad<T>(opts: CachedLoadOptions<T>): CachedLoadHandle;
