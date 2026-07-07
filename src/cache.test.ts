import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CACHE_TTL_MS,
  createCachedLoad,
  invalidateCache,
  readCache,
  resetCache,
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

/** A load whose resolution the test controls, capturing the abort signal. */
const deferredLoad = <T>() => {
  const signals: AbortSignal[] = [];
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const load = vi.fn((signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  });
  return { load, signals, resolve: (v: T) => resolve(v), reject: (e: unknown) => reject(e) };
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
    d.resolve(['fresh']);
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
    d.reject(new Error('down'));
    await flush();
    expect(seen).toEqual([{ data: 'stale', isLoading: false, error: null }]);
    expect(readCache('k')?.value).toBe('stale');
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
    expect(d.signals[0].aborted).toBe(false);

    // What useCachedLoad does when `key` changes: dispose old, run new.
    oldHandle.dispose();
    expect(d.signals[0].aborted).toBe(true);

    const newKey = states<string>();
    createCachedLoad({ key: 'e2/guests', load: async () => 'e2', set: newKey.set, errorMessage: 'failed' }).run();
    await flush();
    expect(newKey.seen.at(-1)).toEqual({ data: 'e2', isLoading: false, error: null });

    // The old key's fetch settling late must not write state OR the cache.
    const before = oldKey.seen.length;
    d.resolve('too late');
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
    expect(d.signals).toHaveLength(2);
    expect(d.signals[0].aborted).toBe(true);
    expect(d.signals[1].aborted).toBe(false);
    d.resolve('second');
    await flush();
    expect(seen.at(-1)).toEqual({ data: 'second', isLoading: false, error: null });
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
