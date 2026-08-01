/** Runtime-agnostic fetch helpers. Browser identity headers are attached when available. */
export { ApiError, asArray, clean, getJson, jsonOr, runGuarded, sendJson, } from '../data';
export type { CallOptions, GuardedState, SendOptions } from '../data';
export { DEFAULT_CACHE_TTL_MS, MAX_CACHE_ENTRIES, createCachedLoad, invalidateCache, readCache, resetCache, seedFromCache, writeCache, } from '../cache';
export type { CacheHit, CachedLoadHandle, CachedLoadOptions } from '../cache';
