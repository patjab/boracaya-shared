// The shared per-event client cache + request-abort primitive (admin#159,
// Wave 2 of admin#164): every Valet tab bounce today is a cold fetch because
// each screen hook starts from nothing on mount. This module adds ONE seam on
// top of the data-access layer (data.ts): a module-level TTL cache keyed by an
// explicit string key (callers key per eventId+resource, e.g.
// `${eventId}/guests`), stale-while-revalidate serving, prefix invalidation
// for writes, and AbortController wiring so switching keys cancels the old
// key's in-flight fetch instead of letting it run to completion.
//
// It COMPOSES with the existing guarded contract rather than replacing it:
// the cold-miss path delegates to runGuarded, so loading/error behavior is
// identical to useGuardedLoad's. The React binding lives in
// hooks/useCachedLoad.ts; this module is plain TypeScript so the semantics
// are testable without React and Node consumers stay safe (no window,
// no storage).
import { GuardedState, runGuarded } from './data';

/**
 * Default freshness window. Sized for the tab-bounce pattern: a value fetched
 * on one screen visit is served instantly on a re-visit within this window
 * (no fetch at all); older values are served instantly but revalidated in the
 * background. Override per call via `ttlMs`.
 */
export const DEFAULT_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  value: unknown;
  storedAt: number;
}

// Module-level so every hook instance (and every screen) shares one cache.
const entries = new Map<string, CacheEntry>();

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
export function readCache<T>(key: string, ttlMs: number = DEFAULT_CACHE_TTL_MS): CacheHit<T> | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  return { value: entry.value as T, isFresh: Date.now() - entry.storedAt < ttlMs };
}

/** Store a value under a key, restarting its freshness window. */
export function writeCache<T>(key: string, value: T): void {
  entries.set(key, { value, storedAt: Date.now() });
}

/**
 * Drop every entry whose key equals or starts with the argument — pass a full
 * key to invalidate one resource, or a shared prefix (e.g. the eventId) to
 * invalidate everything under an event after a write. The next load for a
 * dropped key is a full cold fetch.
 */
export function invalidateCache(keyOrPrefix: string): void {
  for (const key of Array.from(entries.keys())) {
    if (key.startsWith(keyOrPrefix)) entries.delete(key);
  }
}

/** Clear the whole cache. For tests (and sign-out-shaped resets). */
export function resetCache(): void {
  entries.clear();
}

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
export function createCachedLoad<T>(opts: CachedLoadOptions<T>): CachedLoadHandle {
  const { key, load, set, errorMessage } = opts;
  const ttlMs = opts.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  let disposed = false;
  // Monotonic run id, same idea as useGuardedLoad's: only the latest run may
  // write state, so a slower earlier run can't overwrite a newer one.
  let runSeq = 0;
  let controller: AbortController | undefined;

  // Fetch through `load` and populate the cache. Starting a new fetch aborts
  // the previous in-flight one (reload spam), and dispose() aborts the last —
  // which is how a key switch cancels the old key's request.
  const fetchInto = async (): Promise<T> => {
    controller?.abort();
    const own = new AbortController();
    controller = own;
    const value = await load(own.signal);
    // A loader that ignores the signal can still settle after an abort — it
    // must not repopulate the cache, or a late response would silently undo a
    // write's invalidation.
    if (!own.signal.aborted) writeCache(key, value);
    return value;
  };

  const run = (): void => {
    if (disposed) return;
    runSeq += 1;
    const seq = runSeq;
    const guardedSet = (next: GuardedState<T>): void => {
      if (!disposed && seq === runSeq) set(next);
    };

    const hit = readCache<T>(key, ttlMs);
    if (hit) {
      // Serve the cached value instantly — the screen renders data, never a
      // spinner, whether or not a background refresh follows.
      guardedSet({ data: hit.value, isLoading: false, error: null });
      if (hit.isFresh) return;
      void fetchInto().then(
        (value) => guardedSet({ data: value, isLoading: false, error: null }),
        (e) => {
          // A failed (or aborted) revalidation keeps serving the stale value
          // rather than blanking a screen that already has data.
          if (!controller?.signal.aborted) console.error(`cache: revalidate failed (${key}):`, e);
        },
      );
      return;
    }
    // Cold miss: the existing guarded contract, unchanged.
    void runGuarded(fetchInto, guardedSet, errorMessage);
  };

  return {
    run,
    dispose(): void {
      disposed = true;
      controller?.abort();
    },
  };
}
