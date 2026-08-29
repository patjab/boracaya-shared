"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_CACHE_ENTRIES = exports.DEFAULT_CACHE_TTL_MS = void 0;
exports.readCache = readCache;
exports.writeCache = writeCache;
exports.invalidateCache = invalidateCache;
exports.seedFromCache = seedFromCache;
exports.resetCache = resetCache;
exports.createCachedLoad = createCachedLoad;
/**
 * Default freshness window. Sized for the tab-bounce pattern: a value fetched
 * on one screen visit is served instantly on a re-visit within this window
 * (no fetch at all); older values are served instantly but revalidated in the
 * background. Override per call via `ttlMs`.
 */
exports.DEFAULT_CACHE_TTL_MS = 30000;
// Module-level so every hook instance (and every screen) shares one cache.
const entries = new Map();
/**
 * Completed LOCAL writes per key — the seam that lets a read know it has been
 * overtaken (valet#465, valet#466).
 *
 * A read captured before a write and settling after it carries a document the
 * write has already superseded. Nothing in an AbortSignal says so: the request
 * was never cancelled, it is simply answering a question that is now out of
 * date. Committing it puts the pre-write body in the entry at FULL freshness
 * and publishes it to the screen, so the organizer watches their own action
 * undone with nothing in flight to correct it.
 *
 * Only `writeCache` bumps this, and `writeCache` is the write-through callers
 * use after a persisted mutation. A fetch commits through `commitFetched`,
 * which does NOT bump — otherwise one consumer's revalidation would veto
 * another's concurrent read of the same key, and issue order is not settle
 * order, so the veto would be arbitrary.
 */
const localWrites = new Map();
const writeSeq = (key) => { var _a; return (_a = localWrites.get(key)) !== null && _a !== void 0 ? _a : 0; };
/**
 * Eviction cap. The cache is a screen-bounce accelerator, not a datastore: an
 * admin session touches tens of eventId+resource keys, so 200 sits far above
 * any real working set while bounding memory when a long-lived session churns
 * through many keys. Eviction is least-recently-WRITTEN — Map preserves
 * insertion order and writeCache re-inserts on every write, so the first key
 * is always the stalest write. (No read-recency bookkeeping: at tab-bounce
 * scale a write-LRU is indistinguishable from a full LRU and much simpler.)
 */
exports.MAX_CACHE_ENTRIES = 200;
/**
 * Read a cached value. Entries never expire out of the map — TTL only decides
 * `isFresh` (fresh = serve without fetching; stale = serve AND revalidate),
 * which is what makes stale-while-revalidate possible.
 */
function readCache(key, ttlMs = exports.DEFAULT_CACHE_TTL_MS) {
    const entry = entries.get(key);
    if (!entry)
        return undefined;
    return { value: entry.value, isFresh: Date.now() - entry.storedAt < ttlMs };
}
/**
 * Store a value under a key, restarting its freshness window and its write
 * recency. At MAX_CACHE_ENTRIES the least-recently-written entry is evicted.
 */
function writeCache(key, value) {
    // A caller's write is the local truth an in-flight read may not overwrite.
    localWrites.set(key, writeSeq(key) + 1);
    store(key, value);
}
/**
 * Store without counting it as a local write — the path a fetched body takes.
 * See `localWrites` for why a fetch commit must not bump the counter.
 */
function store(key, value) {
    // Delete-then-set moves the key to the back of the Map's insertion order,
    // so recency follows writes.
    entries.delete(key);
    entries.set(key, { value, storedAt: Date.now() });
    if (entries.size > exports.MAX_CACHE_ENTRIES) {
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
function invalidateCache(keyOrPrefix) {
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
function seedFromCache(key, ttlMs = exports.DEFAULT_CACHE_TTL_MS) {
    const hit = readCache(key, ttlMs);
    return hit
        ? { data: hit.value, isLoading: false, error: null }
        : { data: null, isLoading: true, error: null };
}
/** Clear the whole cache. For tests (and sign-out-shaped resets). */
function resetCache() {
    entries.clear();
    localWrites.clear();
}
/**
 * The cache-aware load orchestration, as a plain function (the runGuarded
 * pattern) so stale-while-revalidate, invalidation, and abort semantics are
 * testable without React.
 */
function createCachedLoad(opts) {
    var _a;
    const { key, load, set, errorMessage } = opts;
    const ttlMs = (_a = opts.ttlMs) !== null && _a !== void 0 ? _a : exports.DEFAULT_CACHE_TTL_MS;
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
        // The key's local-write count as of ISSUE. If it has moved by the time
        // this settles, a persisted mutation overtook the request in flight.
        const writesAtIssue = writeSeq(key);
        const promise = (async () => {
            const value = await load(own.signal);
            // A loader that ignores the signal can still settle after an abort — it
            // must not repopulate the cache, or a late response would silently undo
            // a write's invalidation.
            if (own.signal.aborted)
                return { value, superseded: false };
            if (writeSeq(key) !== writesAtIssue) {
                // Overtaken. Drop the body without touching the entry: the write that
                // overtook it is already there, and it is the newer truth.
                return { value, superseded: true };
            }
            store(key, value);
            return { value, superseded: false };
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
            void promise.then(({ value, superseded }) => {
                // A superseded body must not reach the screen either. Publish the
                // ENTRY instead of the body: the write that overtook this read is
                // in there and is the newer truth. Its own author has usually
                // already set the same value locally, so this is normally a no-op —
                // but it is what makes the invariant hold on every path, including
                // a second consumer of this key that did no write of its own and
                // would otherwise sit on the pre-write value until its next run.
                const hitAfter = superseded ? readCache(key, Infinity) : undefined;
                guardedSet({ data: hitAfter ? hitAfter.value : value, isLoading: false, error: null });
            }, (e) => {
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
        void promise.then(({ value, superseded }) => {
            // On a cold miss there is nothing on screen yet, so refusing outright
            // would strand the spinner. The write that overtook this read is the
            // newer truth AND is already in the entry, so publish that instead —
            // the loading state always clears, and the write is never lost.
            const hitAfter = superseded ? readCache(key, Infinity) : undefined;
            guardedSet({ data: hitAfter ? hitAfter.value : value, isLoading: false, error: null });
        }, (e) => {
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
