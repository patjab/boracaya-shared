import { GuardedState } from '../data';
/**
 * The cache-aware sibling of useGuardedLoad (admin#159): same signature shape
 * and the same GuardedState contract, plus the shared per-event cache — so a
 * screen hook swaps `useGuardedLoad(load, msg)` for
 * `useCachedLoad(key, load, msg)` and tab bounces stop being cold fetches.
 *
 * - `key` is the cache identity (key per eventId+resource, e.g.
 *   `${eventId}/guests`). A fresh hit renders instantly with no fetch; a
 *   stale hit renders instantly while a background refresh runs; a miss
 *   behaves exactly like useGuardedLoad.
 * - Changing `key` disposes the old handle, which ABORTS the old key's
 *   in-flight fetch — thread the provided AbortSignal into getJson/sendJson.
 * - `reload` re-runs through the cache; after a write, call
 *   invalidateCache(key or prefix) first to force a real refetch.
 */
export declare function useCachedLoad<T>(key: string, load: (signal: AbortSignal) => Promise<T>, errorMessage: string, opts?: {
    ttlMs?: number;
}): GuardedState<T> & {
    reload: () => void;
};
