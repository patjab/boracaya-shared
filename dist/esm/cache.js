/**
 * Default freshness window. Sized for the tab-bounce pattern: a value fetched
 * on one screen visit is served instantly on a re-visit within this window
 * (no fetch at all); older values are served instantly but revalidated in the
 * background. Override per call via `ttlMs`.
 */
export const DEFAULT_CACHE_TTL_MS = 30000;
// Module-level so every hook instance (and every screen) shares one cache.
const entries = new Map();
/**
 * Eviction cap. The cache is a screen-bounce accelerator, not a datastore: an
 * admin session touches tens of eventId+resource keys, so 200 sits far above
 * any real working set while bounding memory when a long-lived session churns
 * through many keys. Eviction is least-recently-WRITTEN — Map preserves
 * insertion order and writeCache re-inserts on every write, so the first key
 * is always the stalest write. (No read-recency bookkeeping: at tab-bounce
 * scale a write-LRU is indistinguishable from a full LRU and much simpler.)
 */
export const MAX_CACHE_ENTRIES = 200;
/**
 * Read a cached value. Entries never expire out of the map — TTL only decides
 * `isFresh` (fresh = serve without fetching; stale = serve AND revalidate),
 * which is what makes stale-while-revalidate possible.
 */
export function readCache(key, ttlMs = DEFAULT_CACHE_TTL_MS) {
    const entry = entries.get(key);
    if (!entry)
        return undefined;
    return { value: entry.value, isFresh: Date.now() - entry.storedAt < ttlMs };
}
/**
 * Store a value under a key, restarting its freshness window and its write
 * recency. At MAX_CACHE_ENTRIES the least-recently-written entry is evicted.
 */
export function writeCache(key, value) {
    // Delete-then-set moves the key to the back of the Map's insertion order,
    // so recency follows writes.
    entries.delete(key);
    entries.set(key, { value, storedAt: Date.now() });
    if (entries.size > MAX_CACHE_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined)
            entries.delete(oldest);
    }
}
/**
 * Drop the exact key, or — treating '/' as the key segment delimiter — every
 * key under the prefix: pass a full key to invalidate one resource, or a bare
 * segment prefix (e.g. the eventId) to invalidate everything under an event
 * after a write. Matching is delimiter-bounded, so invalidating 'e1' drops
 * 'e1' and 'e1/guests' but never 'e10/guests' — which is why keys MUST use
 * '/' between segments (`${eventId}/guests`). The next load for a dropped
 * key is a full cold fetch.
 */
export function invalidateCache(keyOrPrefix) {
    const prefix = `${keyOrPrefix}/`;
    for (const key of Array.from(entries.keys())) {
        if (key === keyOrPrefix || key.startsWith(prefix))
            entries.delete(key);
    }
}
/**
 * The render-time seed for a key, as a pure function: what a screen shows
 * before (or instead of) any fetch — a cached value (fresh or stale) renders
 * as data instantly, a miss renders the loading state. hooks/useCachedLoad
 * derives from this for its initial state AND at render time on a key
 * switch, so the first render after a key change never flashes the previous
 * key's data.
 */
export function seedFromCache(key, ttlMs = DEFAULT_CACHE_TTL_MS) {
    const hit = readCache(key, ttlMs);
    return hit
        ? { data: hit.value, isLoading: false, error: null }
        : { data: null, isLoading: true, error: null };
}
/** Clear the whole cache. For tests (and sign-out-shaped resets). */
export function resetCache() {
    entries.clear();
}
/**
 * The cache-aware load orchestration, as a plain function (the runGuarded
 * pattern) so stale-while-revalidate, invalidation, and abort semantics are
 * testable without React.
 */
export function createCachedLoad(opts) {
    var _a;
    const { key, load, set, errorMessage } = opts;
    const ttlMs = (_a = opts.ttlMs) !== null && _a !== void 0 ? _a : DEFAULT_CACHE_TTL_MS;
    let disposed = false;
    // Monotonic run id, same idea as useGuardedLoad's: only the latest run may
    // write state, so a slower earlier run can't overwrite a newer one.
    let runSeq = 0;
    let controller;
    // Fetch through `load` and populate the cache. Starting a new fetch aborts
    // the previous in-flight one (reload spam), and dispose() aborts the last —
    // which is how a key switch cancels the old key's request. Returns THIS
    // request's signal alongside the promise: settlement handlers must consult
    // the signal of the request they belong to, not the mutable latest
    // controller, or a newer run would misclassify an intentional abort.
    const startFetch = () => {
        controller === null || controller === void 0 ? void 0 : controller.abort();
        const own = new AbortController();
        controller = own;
        const promise = (async () => {
            const value = await load(own.signal);
            // A loader that ignores the signal can still settle after an abort — it
            // must not repopulate the cache, or a late response would silently undo
            // a write's invalidation.
            if (!own.signal.aborted)
                writeCache(key, value);
            return value;
        })();
        return { signal: own.signal, promise };
    };
    const run = () => {
        if (disposed)
            return;
        runSeq += 1;
        const seq = runSeq;
        const guardedSet = (next) => {
            if (!disposed && seq === runSeq)
                set(next);
        };
        const hit = readCache(key, ttlMs);
        if (hit) {
            // Serve the cached value instantly — the screen renders data, never a
            // spinner, whether or not a background refresh follows.
            guardedSet({ data: hit.value, isLoading: false, error: null });
            if (hit.isFresh)
                return;
            const { signal, promise } = startFetch();
            void promise.then((value) => guardedSet({ data: value, isLoading: false, error: null }), (e) => {
                // A failed revalidation keeps serving the stale value rather than
                // blanking a screen that already has data; an ABORTED one (a newer
                // run or dispose cancelled this specific request) is silent.
                if (!signal.aborted)
                    console.error(`cache: revalidate failed (${key}):`, e);
            });
            return;
        }
        // Cold miss: the guarded contract (loading set first, then data or the
        // error message — loading always cleared), handled inline rather than
        // via runGuarded so an INTENTIONAL abort — dispose/key switch or a newer
        // run superseding this request — is fully silent: no console output and
        // no state write (the writes are already sequence-guarded; this consults
        // the request's own captured signal, per the revalidation path).
        guardedSet({ data: null, isLoading: true, error: null });
        const { signal, promise } = startFetch();
        void promise.then((value) => guardedSet({ data: value, isLoading: false, error: null }), (e) => {
            if (signal.aborted)
                return;
            console.error(`cache: guarded load failed (${errorMessage}):`, e);
            guardedSet({ data: null, isLoading: false, error: errorMessage });
        });
    };
    return {
        run,
        reload() {
            invalidateCache(key);
            run();
        },
        dispose() {
            disposed = true;
            controller === null || controller === void 0 ? void 0 : controller.abort();
        },
    };
}
