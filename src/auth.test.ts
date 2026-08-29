/**
 * initAuth retry semantics (cdk#1278): a failed GSI load (script onerror) or an
 * `initialize` throw must NOT stay cached in the module-level memo — the next call
 * retries; a successful init IS memoized (one script load per page session).
 *
 * Hermetic: window/document are stubbed; each case re-imports the module so the
 * memo starts cold (same pattern as env.test.ts).
 *
 * (Runs under the default `npm test`, which runs every suite except the live
 * network smoke tests.)
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
  win: { google?: { accounts?: { id?: { initialize: (cfg: unknown) => void } } }; dispatchEvent?: (e: Event) => boolean };
  events: string[];
}

/** Fresh import with stubbed window/document; returns handles to the stub scripts. */
const load = async (): Promise<Harness> => {
  vi.resetModules();
  const scripts: StubScript[] = [];
  const win: Harness['win'] = {};
  // The GIS callback dispatches `pdab-auth-change` on window — that event is how
  // the console learns to re-probe. Recording it keeps the stub faithful to the
  // code under test AND makes the notification assertable.
  const events: string[] = [];
  win.dispatchEvent = (e: Event) => { events.push(e.type); return true; };
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
  return { initAuth: mod.initAuth, scripts, win, events };
};

const gsiOk = (win: Harness['win'], initialize: (cfg: unknown) => void = () => undefined) => {
  win.google = { accounts: { id: { initialize } } };
};

/** A JWT whose exp is an hour out, so getIdToken treats it as live. */
const liveJwt = (): string => {
  const claims = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 });
  return `h.${btoa(claims).replace(/\+/g, '-').replace(/\//g, '_')}.s`;
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

  // valet#640: the token no longer lives in sessionStorage, so NOTHING carries a
  // session across a page load. Auto-select is what stops that becoming a
  // "Continue with Google" click on every refresh. Turning it off again silently
  // reintroduces that, which is why it is pinned here rather than left to the
  // comment beside it.
  it('initializes GIS with auto_select ON, so a refresh can re-auth silently', async () => {
    const { initAuth, scripts, win } = await load();
    const seen: Array<Record<string, unknown>> = [];
    const p = initAuth();
    gsiOk(win, (cfg) => { seen.push(cfg as Record<string, unknown>); });
    scripts[0].onload!();
    await p;

    expect(seen).toHaveLength(1);
    expect(seen[0].auto_select).toBe(true);
    expect(typeof seen[0].client_id).toBe('string');
  });

  // Codex r2 on shared#161, both of these. The suite proved setIdToken and
  // clearIdToken in ISOLATION and proved initAuth's GIS config, but nothing
  // joined them up: deleting `setIdToken(r.credential)` from the callback, or
  // `clearIdToken()` from signOut, left all 16 tests green while the app was
  // respectively never signed in and never signed out. These drive the public
  // outcome — getIdToken / authHeaders — through the real lifecycle.
  const signIn = async (credential: string) => {
    const { initAuth, scripts, win, events } = await load();
    let callback: (r: { credential?: string }) => void = () => undefined;
    const p = initAuth();
    gsiOk(win, (cfg) => { callback = (cfg as { callback: typeof callback }).callback; });
    scripts[0].onload!();
    await p;
    callback({ credential });
    return { mod: await import('./auth'), events };
  };

  it('a GIS credential reaches the token holder, not just the auth-change event', async () => {
    const token = liveJwt();
    const { mod, events } = await signIn(token);

    expect(mod.getIdToken()).toBe(token);
    expect(mod.authHeaders()).toEqual({ Authorization: `Bearer ${token}` });
    // Both halves, since the event alone was what the old suite could see.
    expect(events).toEqual(['pdab-auth-change']);
  });

  it('signOut invalidates the held token, not only the GIS auto-select state', async () => {
    const { mod } = await signIn(liveJwt());
    expect(mod.getIdToken()).not.toBeNull();

    mod.signOut();

    expect(mod.getIdToken()).toBeNull();
    expect(mod.authHeaders()).toEqual({});
  });

  it('resolves immediately without a window (SSR guard)', async () => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);
    const mod = await import('./auth');
    await expect(mod.initAuth()).resolves.toBeUndefined();
  });
});
