import { useCallback, useEffect, useRef, useState } from 'react';
import { createCachedLoad, DEFAULT_CACHE_TTL_MS, seedFromCache } from '../cache.js';
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
 * - `reload` invalidates the key and refetches — it reliably hits the
 *   network, never a cache no-op. (A write that affects OTHER keys still
 *   calls invalidateCache(prefix) itself.)
 */
export function useCachedLoad(key, load, errorMessage, opts = {}) {
    var _a;
    const ttlMs = (_a = opts.ttlMs) !== null && _a !== void 0 ? _a : DEFAULT_CACHE_TTL_MS;
    // State is stored WITH the key it belongs to. Seeding from the cache means
    // a cached value paints on the very first render (no one-frame spinner on
    // a tab bounce), and the key tag lets the render below detect a key switch
    // before the effect has re-run.
    const [entry, setEntry] = useState(() => ({
        key,
        state: seedFromCache(key, ttlMs),
    }));
    // Always call the latest load, not the one captured when the key last
    // changed — the handle stays per-key, but the loader never goes stale.
    const loadRef = useRef(load);
    loadRef.current = load;
    const handleRef = useRef(null);
    useEffect(() => {
        const handle = createCachedLoad({
            key,
            ttlMs,
            load: (signal) => loadRef.current(signal),
            set: (state) => setEntry({ key, state }),
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
    const reload = useCallback(() => { var _a; return (_a = handleRef.current) === null || _a === void 0 ? void 0 : _a.reload(); }, []);
    // When `key` changes, the component renders once BEFORE the effect swaps
    // handles — deriving from the NEW key's cache seed at render time means
    // that frame shows the new key's cached value (or its loading state), never
    // a flash of the previous key's data.
    const state = entry.key === key ? entry.state : seedFromCache(key, ttlMs);
    return { ...state, reload };
}
