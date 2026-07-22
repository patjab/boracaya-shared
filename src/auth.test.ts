/**
 * initAuth retry semantics (cdk#1278): a failed GSI load (script onerror) or an
 * `initialize` throw must NOT stay cached in the module-level memo — the next call
 * retries; a successful init IS memoized (one script load per page session).
 *
 * Hermetic: window/document are stubbed; each case re-imports the module so the
 * memo starts cold (same pattern as env.test.ts).
 *
 * (Not run by the default `npm test`, which is the contract test only; run under
 * `npm run test:all`.)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

interface StubScript {
  src?: string;
  async?: boolean;
  defer?: boolean;
  onload?: () => void;
  onerror?: () => void;
}

interface Harness {
  initAuth: (app?: 'checkin' | 'admin') => Promise<void>;
  scripts: StubScript[];
  win: { google?: { accounts?: { id?: { initialize: (cfg: unknown) => void } } } };
}

/** Fresh import with stubbed window/document; returns handles to the stub scripts. */
const load = async (): Promise<Harness> => {
  vi.resetModules();
  const scripts: StubScript[] = [];
  const win: Harness['win'] = {};
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', {
    createElement: () => {
      const s: StubScript = {};
      scripts.push(s);
      return s;
    },
    head: { appendChild: () => undefined },
  });
  const mod = await import('./auth');
  return { initAuth: mod.initAuth, scripts, win };
};

const gsiOk = (win: Harness['win'], initialize: (cfg: unknown) => void = () => undefined) => {
  win.google = { accounts: { id: { initialize } } };
};

afterEach(() => vi.unstubAllGlobals());

describe('initAuth (cdk#1278)', () => {
  it('memoizes a successful init — second call returns the same promise, one script load', async () => {
    const { initAuth, scripts, win } = await load();
    const p1 = initAuth();
    expect(scripts).toHaveLength(1);
    gsiOk(win);
    scripts[0].onload!();
    await p1;
    const p2 = initAuth();
    expect(p2).toBe(p1); // cached
    expect(scripts).toHaveLength(1); // no second script
  });

  it('script load failure rejects AND resets the memo — the next call retries and can succeed', async () => {
    const { initAuth, scripts, win } = await load();
    const p1 = initAuth();
    scripts[0].onerror!();
    await expect(p1).rejects.toThrow('Failed to load Google Identity Services');

    // Retry: a NEW script load is started (the rejected promise was not returned).
    const p2 = initAuth();
    expect(p2).not.toBe(p1);
    expect(scripts).toHaveLength(2);
    gsiOk(win);
    scripts[1].onload!();
    await expect(p2).resolves.toBeUndefined();
  });

  it('initialize() throwing rejects AND resets the memo — the next call retries', async () => {
    const { initAuth, scripts, win } = await load();
    const p1 = initAuth();
    gsiOk(win, () => {
      throw new Error('gsi exploded');
    });
    scripts[0].onload!();
    await expect(p1).rejects.toThrow('gsi exploded');

    // Retry succeeds once initialize behaves.
    gsiOk(win);
    const p2 = initAuth();
    expect(p2).not.toBe(p1);
    await expect(p2).resolves.toBeUndefined();
  });

  it('after a successful retry the memo is cached again (no third script load)', async () => {
    const { initAuth, scripts, win } = await load();
    const p1 = initAuth();
    scripts[0].onerror!();
    await expect(p1).rejects.toThrow();

    const p2 = initAuth();
    gsiOk(win);
    scripts[1].onload!();
    await p2;
    expect(initAuth()).toBe(p2);
    expect(scripts).toHaveLength(2);
  });

  it('resolves immediately without a window (SSR guard)', async () => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);
    const mod = await import('./auth');
    await expect(mod.initAuth()).resolves.toBeUndefined();
  });
});
