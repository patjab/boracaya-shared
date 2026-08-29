import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CACHE_TTL_MS,
  MAX_CACHE_ENTRIES,
  createCachedLoad,
  invalidateCache,
  readCache,
  resetCache,
  seedFromCache,
  writeCache,
} from './cache';
import { GuardedState } from './data';

// The cache decides freshness with Date.now only — drive it directly.
let now = 0;
const advance = (ms: number) => {
  now += ms;
};

beforeEach(() => {
  now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  resetCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const states = <T>() => {
  const seen: GuardedState<T>[] = [];
  return { seen, set: (s: GuardedState<T>) => seen.push(s) };
};

/**
 * A load whose settlement the test controls, capturing the abort signal and
 * resolvers of EACH call so overlapping requests can settle independently.
 */
const deferredLoad = <T>() => {
  const calls: { signal: AbortSignal; resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
  const load = vi.fn(
    (signal: AbortSignal) =>
      new Promise<T>((resolve, reject) => {
        calls.push({ signal, resolve, reject });
      }),
  );
  return { load, calls };
};

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('the cache store', () => {
  it('reads back writes, fresh within the TTL and stale after it', () => {
    writeCache('e1/guests', ['a']);
    expect(readCache('e1/guests')).toEqual({ value: ['a'], isFresh: true });
    advance(DEFAULT_CACHE_TTL_MS - 1);
    expect(readCache('e1/guests')?.isFresh).toBe(true);
    advance(1);
    // Stale entries are still served (for stale-while-revalidate), not dropped.
    expect(readCache('e1/guests')).toEqual({ value: ['a'], isFresh: false });
  });

  it('honors a per-call ttlMs override', () => {
    writeCache('k', 1);
    advance(5_000);
    expect(readCache('k', 4_000)?.isFresh).toBe(false);
    expect(readCache('k', 60_000)?.isFresh).toBe(true);
  });

  it('invalidates by exact key and by prefix', () => {
    writeCache('e1/guests', 1);
    writeCache('e1/rsvps', 2);
    writeCache('e2/guests', 3);
    invalidateCache('e1/guests');
    expect(readCache('e1/guests')).toBeUndefined();
    expect(readCache('e1/rsvps')).toBeDefined();
    invalidateCache('e1');
    expect(readCache('e1/rsvps')).toBeUndefined();
    expect(readCache('e2/guests')).toBeDefined();
  });

  it("prefix invalidation is '/'-delimiter-bounded: 'e1' never matches into 'e10/...'", () => {
    writeCache('e1', 'bare');
    writeCache('e1/guests', 1);
    writeCache('e10/guests', 2);
    writeCache('e10', 'bare10');
    invalidateCache('e1');
    expect(readCache('e1')).toBeUndefined(); // exact key
    expect(readCache('e1/guests')).toBeUndefined(); // delimiter-bounded prefix
    expect(readCache('e10/guests')).toBeDefined(); // NOT a raw startsWith match
    expect(readCache('e10')).toBeDefined();
  });

  it('seedFromCache derives the render-time state for a key', () => {
    // Miss: the loading state.
    expect(seedFromCache('e1/guests')).toEqual({ data: null, isLoading: true, error: null });
    // Fresh hit: the cached value as settled data.
    writeCache('e1/guests', ['a']);
    expect(seedFromCache('e1/guests')).toEqual({ data: ['a'], isLoading: false, error: null });
    // Stale hit: still the cached value (stale-while-revalidate serves it).
    advance(DEFAULT_CACHE_TTL_MS + 1);
    expect(seedFromCache('e1/guests')).toEqual({ data: ['a'], isLoading: false, error: null });
    // Per-call TTL override applies (it only affects freshness, not serving).
    expect(seedFromCache('e1/guests', 10 ** 9)).toEqual({ data: ['a'], isLoading: false, error: null });
  });

  it('evicts the least-recently-WRITTEN entry at the cap; a re-written key survives', () => {
    for (let i = 0; i < MAX_CACHE_ENTRIES; i += 1) writeCache(`k${i}/x`, i);
    // Re-writing k0 refreshes its write recency — it is no longer the oldest.
    writeCache('k0/x', 'rewritten');
    // The cap+1-th distinct key evicts the oldest write: now k1, not k0.
    writeCache('overflow/x', 'new');
    expect(readCache('k0/x')?.value).toBe('rewritten');
    expect(readCache('k1/x')).toBeUndefined();
    expect(readCache('overflow/x')?.value).toBe('new');
    expect(readCache('k2/x')).toBeDefined();
  });

  it('resetCache clears everything', () => {
    writeCache('a', 1);
    writeCache('b', 2);
    resetCache();
    expect(readCache('a')).toBeUndefined();
    expect(readCache('b')).toBeUndefined();
  });
});

describe('createCachedLoad', () => {
  it('cold miss follows the guarded contract (loading, then data) and fills the cache', async () => {
    const { seen, set } = states<string[]>();
    const load = vi.fn(async () => ['g1']);
    createCachedLoad({ key: 'e1/guests', load, set, errorMessage: 'failed' }).run();
    expect(seen[0]).toEqual({ data: null, isLoading: true, error: null });
    await flush();
    expect(seen.at(-1)).toEqual({ data: ['g1'], isLoading: false, error: null });
    expect(readCache('e1/guests')?.value).toEqual(['g1']);
  });

  it('cold-miss failure surfaces the error message through the guarded contract', async () => {
    const { seen, set } = states<string>();
    const load = vi.fn(async () => {
      throw new Error('down');
    });
    createCachedLoad({ key: 'k', load, set, errorMessage: 'We could not load the guest list.' }).run();
    await flush();
    expect(seen.at(-1)).toEqual({ data: null, isLoading: false, error: 'We could not load the guest list.' });
    expect(readCache('k')).toBeUndefined();
  });

  it('serves a fresh hit instantly with NO second fetch', async () => {
    writeCache('e1/guests', ['cached']);
    advance(DEFAULT_CACHE_TTL_MS - 1);
    const { seen, set } = states<string[]>();
    const load = vi.fn(async () => ['network']);
    createCachedLoad({ key: 'e1/guests', load, set, errorMessage: 'failed' }).run();
    await flush();
    expect(seen).toEqual([{ data: ['cached'], isLoading: false, error: null }]);
    expect(load).not.toHaveBeenCalled();
  });

  it('serves a stale hit instantly, then revalidates in the background', async () => {
    writeCache('e1/guests', ['stale']);
    advance(DEFAULT_CACHE_TTL_MS + 1);
    const { seen, set } = states<string[]>();
    const d = deferredLoad<string[]>();
    createCachedLoad({ key: 'e1/guests', load: d.load, set, errorMessage: 'failed' }).run();
    // The stale value renders synchronously — never a loading state — while
    // the refresh is already in flight.
    expect(seen).toEqual([{ data: ['stale'], isLoading: false, error: null }]);
    expect(d.load).toHaveBeenCalledTimes(1);
    d.calls[0].resolve(['fresh']);
    await flush();
    expect(seen.at(-1)).toEqual({ data: ['fresh'], isLoading: false, error: null });
    expect(readCache('e1/guests')?.value).toEqual(['fresh']);
  });

  it('keeps serving the stale value when revalidation fails', async () => {
    writeCache('k', 'stale');
    advance(DEFAULT_CACHE_TTL_MS + 1);
    const { seen, set } = states<string>();
    const d = deferredLoad<string>();
    createCachedLoad({ key: 'k', load: d.load, set, errorMessage: 'failed' }).run();
    d.calls[0].reject(new Error('down'));
    await flush();
    expect(seen).toEqual([{ data: 'stale', isLoading: false, error: null }]);
    expect(readCache('k')?.value).toBe('stale');
  });

  it('disposing mid-COLD-fetch is fully silent: no console.error, state untouched', async () => {
    const { seen, set } = states<string>();
    const d = deferredLoad<string>();
    const handle = createCachedLoad({ key: 'k', load: d.load, set, errorMessage: 'failed' });
    handle.run(); // cold miss: loading state set, fetch in flight
    expect(seen).toEqual([{ data: null, isLoading: true, error: null }]);

    handle.dispose(); // key switch / unmount
    d.calls[0].reject(new DOMException('The operation was aborted', 'AbortError'));
    await flush();
    // The intentional abort neither logs nor writes an error state.
    expect(console.error).not.toHaveBeenCalled();
    expect(seen).toEqual([{ data: null, isLoading: true, error: null }]);
    expect(readCache('k')).toBeUndefined();
  });

  it('reload() forces a real fetch even on a fresh hit (invalidate + run)', async () => {
    writeCache('e1/guests', ['cached']);
    const { seen, set } = states<string[]>();
    const load = vi.fn(async () => ['refetched']);
    const handle = createCachedLoad({ key: 'e1/guests', load, set, errorMessage: 'failed' });
    handle.run(); // fresh hit: served from cache, no fetch
    expect(load).not.toHaveBeenCalled();

    handle.reload(); // must reliably hit the network, never a cache no-op
    expect(load).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toEqual({ data: null, isLoading: true, error: null });
    await flush();
    expect(seen.at(-1)).toEqual({ data: ['refetched'], isLoading: false, error: null });
    expect(readCache('e1/guests')?.value).toEqual(['refetched']);
  });

  it('invalidateCache forces the next run to refetch', async () => {
    writeCache('e1/guests', ['cached']);
    invalidateCache('e1/guests');
    const { seen, set } = states<string[]>();
    const load = vi.fn(async () => ['refetched']);
    createCachedLoad({ key: 'e1/guests', load, set, errorMessage: 'failed' }).run();
    expect(load).toHaveBeenCalledTimes(1);
    await flush();
    expect(seen.at(-1)).toEqual({ data: ['refetched'], isLoading: false, error: null });
  });

  it('disposing (a key switch / unmount) aborts the in-flight fetch and stops state writes', async () => {
    const oldKey = states<string>();
    const d = deferredLoad<string>();
    const oldHandle = createCachedLoad({ key: 'e1/guests', load: d.load, set: oldKey.set, errorMessage: 'failed' });
    oldHandle.run();
    expect(d.calls[0].signal.aborted).toBe(false);

    // What useCachedLoad does when `key` changes: dispose old, run new.
    oldHandle.dispose();
    expect(d.calls[0].signal.aborted).toBe(true);

    const newKey = states<string>();
    createCachedLoad({ key: 'e2/guests', load: async () => 'e2', set: newKey.set, errorMessage: 'failed' }).run();
    await flush();
    expect(newKey.seen.at(-1)).toEqual({ data: 'e2', isLoading: false, error: null });

    // The old key's fetch settling late must not write state OR the cache.
    const before = oldKey.seen.length;
    d.calls[0].resolve('too late');
    await flush();
    expect(oldKey.seen.length).toBe(before);
    expect(readCache('e1/guests')).toBeUndefined();
  });

  it('a re-run (reload) aborts the previous in-flight fetch and only the latest run writes', async () => {
    const { seen, set } = states<string>();
    const d = deferredLoad<string>();
    const handle = createCachedLoad({ key: 'k', load: d.load, set, errorMessage: 'failed' });
    handle.run();
    handle.run();
    expect(d.calls).toHaveLength(2);
    expect(d.calls[0].signal.aborted).toBe(true);
    expect(d.calls[1].signal.aborted).toBe(false);
    d.calls[1].resolve('second');
    await flush();
    expect(seen.at(-1)).toEqual({ data: 'second', isLoading: false, error: null });
  });

  it('a newer run mid-revalidate aborts the older revalidation SILENTLY and completes itself', async () => {
    writeCache('k', 'stale');
    advance(DEFAULT_CACHE_TTL_MS + 1);
    const { seen, set } = states<string>();
    const d = deferredLoad<string>();
    const handle = createCachedLoad({ key: 'k', load: d.load, set, errorMessage: 'failed' });
    handle.run(); // serves stale, revalidation #1 in flight
    handle.run(); // serves stale again, revalidation #2 aborts #1
    expect(d.calls).toHaveLength(2);
    expect(d.calls[0].signal.aborted).toBe(true);

    // #1 settles with the rejection an aborted fetch produces. The handler
    // must consult #1's OWN signal — not the (unaborted) latest controller —
    // so this stays silent: no error logged, no state write, no cache write.
    d.calls[0].reject(new DOMException('The operation was aborted', 'AbortError'));
    await flush();
    expect(console.error).not.toHaveBeenCalled();
    expect(seen).toEqual([
      { data: 'stale', isLoading: false, error: null },
      { data: 'stale', isLoading: false, error: null },
    ]);
    expect(readCache('k')?.value).toBe('stale');

    // #2 completes normally.
    d.calls[1].resolve('fresh');
    await flush();
    expect(seen.at(-1)).toEqual({ data: 'fresh', isLoading: false, error: null });
    expect(readCache('k')?.value).toBe('fresh');
  });

  it('after resetCache, a previously cached key cold-fetches again', async () => {
    writeCache('k', 'cached');
    resetCache();
    const { seen, set } = states<string>();
    const load = vi.fn(async () => 'fetched');
    createCachedLoad({ key: 'k', load, set, errorMessage: 'failed' }).run();
    expect(seen[0]).toEqual({ data: null, isLoading: true, error: null });
    expect(load).toHaveBeenCalledTimes(1);
    await flush();
    expect(seen.at(-1)).toEqual({ data: 'fetched', isLoading: false, error: null });
  });
});

/**
 * THE STALE-COMMIT CLASS (valet#465, valet#466).
 *
 * A revalidation whose GET was captured BEFORE a local write settles AFTER
 * it, and the commit is unconditional — so the pre-write body lands in both
 * the cache entry and screen state, at full freshness. The organizer sees
 * their action undone with nothing in flight to correct it, and a tab bounce
 * repaints the wrong value with no fetch.
 *
 * Three consumer-side guards were built and withdrawn in valet#464 before it
 * was established the class cannot be closed above this module: this is the
 * only place that owns BOTH the cache write and the state publish.
 */
describe('createCachedLoad — a write supersedes a read captured before it', () => {
  it('drops a revalidation body that a local write has overtaken', async () => {
    writeCache('e1/roster', { sent: 0 });
    advance(DEFAULT_CACHE_TTL_MS + 1);
    const { seen, set } = states<{ sent: number }>();
    const { load, calls } = deferredLoad<{ sent: number }>();
    createCachedLoad({ key: 'e1/roster', load, set, errorMessage: 'failed' }).run();
    await flush();

    // The organizer copies an invite: the bump is written through the entry
    // while the revalidation above is still in the air.
    writeCache('e1/roster', { sent: 1 });
    // …and the pre-bump body settles last.
    calls[0].resolve({ sent: 0 });
    await flush();

    expect(readCache('e1/roster')?.value).toEqual({ sent: 1 });
    expect(seen.at(-1)?.data).toEqual({ sent: 1 });
  });

  it('still commits a revalidation body when nothing was written under it', async () => {
    writeCache('e1/roster', { sent: 0 });
    advance(DEFAULT_CACHE_TTL_MS + 1);
    const { seen, set } = states<{ sent: number }>();
    const { load, calls } = deferredLoad<{ sent: number }>();
    createCachedLoad({ key: 'e1/roster', load, set, errorMessage: 'failed' }).run();
    await flush();

    calls[0].resolve({ sent: 7 });
    await flush();

    expect(readCache('e1/roster')?.value).toEqual({ sent: 7 });
    expect(seen.at(-1)?.data).toEqual({ sent: 7 });
  });

  it('publishes the write rather than stranding a cold load on its spinner', async () => {
    // The same race with no cached value behind it. Refusing the body must not
    // leave the screen loading for ever — the write IS the newer truth, so it
    // is what gets published.
    const { seen, set } = states<{ sent: number }>();
    const { load, calls } = deferredLoad<{ sent: number }>();
    createCachedLoad({ key: 'e1/roster', load, set, errorMessage: 'failed' }).run();
    expect(seen[0]).toEqual({ data: null, isLoading: true, error: null });

    writeCache('e1/roster', { sent: 1 });
    calls[0].resolve({ sent: 0 });
    await flush();

    expect(seen.at(-1)).toEqual({ data: { sent: 1 }, isLoading: false, error: null });
    expect(readCache('e1/roster')?.value).toEqual({ sent: 1 });
  });

  it('a write under one key does not veto another key’s read', async () => {
    const { seen, set } = states<string>();
    const { load, calls } = deferredLoad<string>();
    createCachedLoad({ key: 'e1/guests', load, set, errorMessage: 'failed' }).run();
    writeCache('e1/roster', 'unrelated');
    calls[0].resolve('fetched');
    await flush();
    expect(seen.at(-1)?.data).toBe('fetched');
  });
  it('one consumer’s fetch does not veto another consumer’s read of the same key', async () => {
    // Why a fetch commits through `store` and not `writeCache`: if a fetched
    // body counted as a local write, the FIRST revalidation to settle would
    // veto every other in-flight read of the key. Issue order is not settle
    // order, so that veto would be arbitrary — it would drop bodies that are
    // newer than the one that won.
    const a = states<string>();
    const b = states<string>();
    const first = deferredLoad<string>();
    const second = deferredLoad<string>();
    createCachedLoad({ key: 'e1/shared', load: first.load, set: a.set, errorMessage: 'failed' }).run();
    createCachedLoad({ key: 'e1/shared', load: second.load, set: b.set, errorMessage: 'failed' }).run();

    first.calls[0].resolve('from A');
    await flush();
    second.calls[0].resolve('from B');
    await flush();

    // B's body is not a stale read — nothing was WRITTEN under it — so it
    // commits, and last-settled wins as it always has.
    expect(b.seen.at(-1)?.data).toBe('from B');
    expect(readCache('e1/shared')?.value).toBe('from B');
  });
});
