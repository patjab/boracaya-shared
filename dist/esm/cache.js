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
// the cold-miss path implements the same loading/error contract as
// runGuarded/useGuardedLoad (loading set first, then data or errorMessage,
// loading always cleared) — inlined only so an INTENTIONAL abort (dispose,
// key switch, a newer run superseding) is fully silent instead of logging.
// The React binding lives in hooks/useCachedLoad.ts; this module is plain
// TypeScript so the semantics are testable without React and Node consumers
// stay safe (no window, no storage).
import { apiCaught } from './apiObserver.js';
import { ApiError } from './data.js';
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
    localWrites.clear();
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
        // The key's local-write count as of ISSUE. If it has moved by the time
        // this settles, a persisted mutation overtook the request in flight.
        const writesAtIssue = writeSeq(key);
        const promise = (async () => {
            const value = await load(own.signal);
            // A loader that ignores the signal can still settle after an abort — it
            // must not repopulate the cache, or a late response would silently undo
            // a write's invalidation.
            // Overtaken? Drop the body without touching the entry: the write that
            // overtook it is already there, and it is the newer truth.
            if (!own.signal.aborted && writeSeq(key) === writesAtIssue)
                store(key, value);
            return value;
        })();
        return { signal: own.signal, writesAtIssue, promise };
    };
    const run = (retries = 1) => {
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
            const { signal, writesAtIssue, promise } = startFetch();
            void promise.then((value) => {
                // Re-checked HERE, not only where the body was stored. Those are two
                // different microtasks — the store happens in the continuation of
                // `await load(...)`, this handler runs a tick later — and a write
                // queued in that gap updates the entry and its own author's screen
                // first. Publishing a verdict computed before it would roll the
                // screen back to the pre-write body while the cache stayed correct,
                // which is the exact symptom this module exists to prevent (Codex r1
                // on shared#160).
                if (writeSeq(key) === writesAtIssue) {
                    guardedSet({ data: value, isLoading: false, error: null });
                    return;
                }
                // Superseded. Publish the ENTRY — the write that overtook this read
                // is in there and is the newer truth. Usually a no-op, since its
                // author set the same value locally; it matters for a SECOND
                // consumer of this key, which did no write of its own and would
                // otherwise sit on the pre-write value until its next run.
                //
                // If the entry is gone (evicted at MAX_CACHE_ENTRIES while this was
                // in the air) there is nothing newer to show — but this screen
                // already has data, because a stale hit served it before the
                // revalidation started. Leave it alone rather than publish a body
                // the generation check has proved obsolete.
                const hitAfter = readCache(key, Infinity);
                if (hitAfter)
                    guardedSet({ data: hitAfter.value, isLoading: false, error: null });
            }, (e) => {
                // A failed revalidation keeps serving the stale value rather than
                // blanking a screen that already has data; an ABORTED one (a newer
                // run or dispose cancelled this specific request) is silent.
                if (!signal.aborted) {
                    console.error(`cache: revalidate failed (${key}):`, e);
                    if (!(e instanceof ApiError))
                        apiCaught(key, e);
                }
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
        const { signal, writesAtIssue, promise } = startFetch();
        void promise.then((value) => {
            // Same recheck as the revalidation path, for the same microtask-gap
            // reason — and here the screen has nothing yet, so the loading state
            // must still clear on every branch.
            if (writeSeq(key) === writesAtIssue) {
                guardedSet({ data: value, isLoading: false, error: null });
                return;
            }
            const hitAfter = readCache(key, Infinity);
            if (hitAfter) {
                // The write that overtook this read is the newer truth.
                guardedSet({ data: hitAfter.value, isLoading: false, error: null });
                return;
            }
            // Superseded AND its replacement has been evicted, so nothing on hand
            // is both current and true — and a cold load cannot simply stop, or
            // the spinner never clears. Read again: a fresh request carries a
            // fresh generation. `retries` bounds it, because the alternative under
            // pathological churn is a loop, and one honest re-read is worth more
            // than a guarantee bought with an unbounded one.
            //
            // Guarded like every other write on this path, and it needs the guard
            // MORE than they do (Codex r4): a `run()` is not a state write it can
            // drop — it bumps runSeq and aborts whatever is in flight. A loader
            // that ignores its signal, which is the very case these abort checks
            // exist for, would otherwise let a dead run cancel the live one and
            // replace its result. A superseded run has no standing to do anything;
            // the run that overtook it owns this key now.
            if (disposed || signal.aborted || seq !== runSeq)
                return;
            if (retries > 0) {
                run(retries - 1);
                return;
            }
            guardedSet({ data: null, isLoading: false, error: errorMessage });
        }, (e) => {
            if (signal.aborted)
                return;
            console.error(`cache: guarded load failed (${errorMessage}):`, e);
            if (!(e instanceof ApiError))
                apiCaught(errorMessage, e);
            guardedSet({ data: null, isLoading: false, error: errorMessage });
        });
    };
    return {
        run: () => run(),
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
