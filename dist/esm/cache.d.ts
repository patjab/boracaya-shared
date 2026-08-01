import { GuardedState } from './data';
/**
 * Default freshness window. Sized for the tab-bounce pattern: a value fetched
 * on one screen visit is served instantly on a re-visit within this window
 * (no fetch at all); older values are served instantly but revalidated in the
 * background. Override per call via `ttlMs`.
 */
export declare const DEFAULT_CACHE_TTL_MS = 30000;
/**
 * Eviction cap. The cache is a screen-bounce accelerator, not a datastore: an
 * admin session touches tens of eventId+resource keys, so 200 sits far above
 * any real working set while bounding memory when a long-lived session churns
 * through many keys. Eviction is least-recently-WRITTEN — Map preserves
 * insertion order and writeCache re-inserts on every write, so the first key
 * is always the stalest write. (No read-recency bookkeeping: at tab-bounce
 * scale a write-LRU is indistinguishable from a full LRU and much simpler.)
 */
export declare const MAX_CACHE_ENTRIES = 200;
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
/**
 * Store a value under a key, restarting its freshness window and its write
 * recency. At MAX_CACHE_ENTRIES the least-recently-written entry is evicted.
 */
export declare function writeCache<T>(key: string, value: T): void;
/**
 * Drop the exact key, or — treating '/' as the key segment delimiter — every
 * key under the prefix: pass a full key to invalidate one resource, or a bare
 * segment prefix (e.g. the eventId) to invalidate everything under an event
 * after a write. Matching is delimiter-bounded, so invalidating 'e1' drops
 * 'e1' and 'e1/guests' but never 'e10/guests' — which is why keys MUST use
 * '/' between segments (`${eventId}/guests`). The next load for a dropped
 * key is a full cold fetch.
 */
export declare function invalidateCache(keyOrPrefix: string): void;
/**
 * The render-time seed for a key, as a pure function: what a screen shows
 * before (or instead of) any fetch — a cached value (fresh or stale) renders
 * as data instantly, a miss renders the loading state. hooks/useCachedLoad
 * derives from this for its initial state AND at render time on a key
 * switch, so the first render after a key change never flashes the previous
 * key's data.
 */
export declare function seedFromCache<T>(key: string, ttlMs?: number): GuardedState<T>;
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
     * Run the load for the handle's key, cache-respecting: fresh hit → serve
     * with no fetch; stale hit → serve instantly, revalidate in the
     * background; miss → the guarded contract (loading state, then data or
     * errorMessage).
     */
    run: () => void;
    /**
     * Force a refetch: invalidate the key, then run. This is what a screen's
     * reload button (and a post-write refresh) means — it must reliably hit
     * the network, never no-op on a fresh cache entry.
     */
    reload: () => void;
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
