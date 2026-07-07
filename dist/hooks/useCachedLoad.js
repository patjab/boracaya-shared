"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCachedLoad = useCachedLoad;
const react_1 = require("react");
const cache_1 = require("../cache");
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
function useCachedLoad(key, load, errorMessage, opts = {}) {
    var _a;
    const ttlMs = (_a = opts.ttlMs) !== null && _a !== void 0 ? _a : cache_1.DEFAULT_CACHE_TTL_MS;
    // Seed from the cache so a cached value paints on the very first render —
    // no one-frame spinner on a tab bounce.
    const [state, setState] = (0, react_1.useState)(() => {
        const hit = (0, cache_1.readCache)(key, ttlMs);
        return hit
            ? { data: hit.value, isLoading: false, error: null }
            : { data: null, isLoading: true, error: null };
    });
    // Always call the latest load, not the one captured when the key last
    // changed — the handle stays per-key, but the loader never goes stale.
    const loadRef = (0, react_1.useRef)(load);
    loadRef.current = load;
    const handleRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        const handle = (0, cache_1.createCachedLoad)({
            key,
            ttlMs,
            load: (signal) => loadRef.current(signal),
            set: setState,
            errorMessage,
        });
        handleRef.current = handle;
        handle.run();
        // Disposing on key change / unmount stops state writes AND aborts the
        // in-flight fetch of the old key (the #159 abort item).
        return () => {
            handle.dispose();
        };
        // errorMessage is a static UX string at every call site; re-keying the
        // handle on it would abort and refetch for a copy change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, ttlMs]);
    const reload = (0, react_1.useCallback)(() => { var _a; return (_a = handleRef.current) === null || _a === void 0 ? void 0 : _a.run(); }, []);
    return { ...state, reload };
}
