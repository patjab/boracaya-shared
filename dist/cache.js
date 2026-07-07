"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CACHE_TTL_MS = void 0;
exports.readCache = readCache;
exports.writeCache = writeCache;
exports.invalidateCache = invalidateCache;
exports.resetCache = resetCache;
exports.createCachedLoad = createCachedLoad;
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
const data_1 = require("./data");
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
/** Store a value under a key, restarting its freshness window. */
function writeCache(key, value) {
    entries.set(key, { value, storedAt: Date.now() });
}
/**
 * Drop every entry whose key equals or starts with the argument — pass a full
 * key to invalidate one resource, or a shared prefix (e.g. the eventId) to
 * invalidate everything under an event after a write. The next load for a
 * dropped key is a full cold fetch.
 */
function invalidateCache(keyOrPrefix) {
    for (const key of Array.from(entries.keys())) {
        if (key.startsWith(keyOrPrefix))
            entries.delete(key);
    }
}
/** Clear the whole cache. For tests (and sign-out-shaped resets). */
function resetCache() {
    entries.clear();
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
    // which is how a key switch cancels the old key's request.
    const fetchInto = async () => {
        controller === null || controller === void 0 ? void 0 : controller.abort();
        const own = new AbortController();
        controller = own;
        const value = await load(own.signal);
        // A loader that ignores the signal can still settle after an abort — it
        // must not repopulate the cache, or a late response would silently undo a
        // write's invalidation.
        if (!own.signal.aborted)
            writeCache(key, value);
        return value;
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
            void fetchInto().then((value) => guardedSet({ data: value, isLoading: false, error: null }), (e) => {
                // A failed (or aborted) revalidation keeps serving the stale value
                // rather than blanking a screen that already has data.
                if (!(controller === null || controller === void 0 ? void 0 : controller.signal.aborted))
                    console.error(`cache: revalidate failed (${key}):`, e);
            });
            return;
        }
        // Cold miss: the existing guarded contract, unchanged.
        void (0, data_1.runGuarded)(fetchInto, guardedSet, errorMessage);
    };
    return {
        run,
        dispose() {
            disposed = true;
            controller === null || controller === void 0 ? void 0 : controller.abort();
        },
    };
}
