import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  claimIdentity,
  clearGuestToken,
  exchangeInvitationToken,
  exchangeLegacyInvite,
  hasGuestSession,
  loginNoEvent,
  refreshGuestSession,
  unlinkIdentity,
} from './guestAuth';
import { GuestEventApi, PublicApi } from './publicApi';

/**
 * The guest-session renewal client (shore#395) and the mint lanes' `displayName`
 * passthrough (shore#503). Hermetic: fetch and sessionStorage are stubbed, no network.
 *
 * What these pin: the renewal sends the cached guest JWT as its only credential, caches
 * the new session under the canonical `sub` the new JWT names, maps 401 / 403 / anything
 * else to `unauthenticated` / `unknown` / `error` without touching the cache, sends nothing
 * when there is no session for the event, and never overwrites a session that changed
 * while it was in flight (a claim, a login, a sign-out, another lane's mint).
 */

// Sessions are cached per event (shore#529).
const TOKEN_KEY = 'pdab_guest_token:evt-9';
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
  });
});

const b64url = (s: string) =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>) =>
  `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(claims))}.${b64url('sig')}`;

const FAR = 9999999999;
const reply = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

const session = (userId: string, eventId = 'evt-9', exp = FAR) => {
  const token = jwt({ sub: userId, evt: eventId, n: Math.random() });
  store.set(`pdab_guest_token:${eventId}`, JSON.stringify({ token, exp, userId, eventId, linkedEmail: 'old@example.com' }));
  return token;
};
const cached = () => JSON.parse(store.get(TOKEN_KEY)!);

function stubFetch(response: Response | (() => Promise<Response>)) {
  const spy = vi.fn(async (_url: string, _init?: RequestInit) =>
    typeof response === 'function' ? response() : response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** A fetch whose response the test releases by hand, to interleave other lanes with it. */
function deferredFetch() {
  let release!: (r: Response) => void;
  const pending = new Promise<Response>((resolve) => { release = resolve; });
  const spy = stubFetch(() => pending);
  return { spy, release };
}

const renewed = (userId: string, extra: Record<string, unknown> = {}) => {
  const token = jwt({ sub: userId, evt: 'evt-9', renewed: true });
  return { token, body: { token, exp: FAR - 1, linkedEmail: 'anna@example.com', displayName: 'Anna', ...extra } };
};

describe('refreshGuestSession (shore#395)', () => {
  it('POSTs the cached session as Bearer to the event-scoped refresh route, and caches the renewal', async () => {
    const old = session('u1');
    const { token, body } = renewed('u1');
    const spy = stubFetch(reply(200, body));

    const res = await refreshGuestSession('evt-9');

    expect(res).toEqual({ kind: 'ok', token, userId: 'u1', linkedEmail: 'anna@example.com', displayName: 'Anna' });
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(GuestEventApi.refresh('evt-9'));
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${old}`);
    expect(init?.body).toBeUndefined(); // the session is the only credential
    expect(cached()).toEqual({ token, exp: FAR - 1, userId: 'u1', eventId: 'evt-9', linkedEmail: 'anna@example.com' });
    expect(hasGuestSession('evt-9', 'u1')).toBe(true);
  });

  it('learns the canonical id from the new JWT, not the cache (a merged identity renews as its canonical id)', async () => {
    session('u-provisional');
    const { token, body } = renewed('u-canonical');
    stubFetch(reply(200, body));

    const res = await refreshGuestSession('evt-9');

    expect(res).toMatchObject({ kind: 'ok', token, userId: 'u-canonical' });
    expect(cached()).toMatchObject({ token, userId: 'u-canonical', eventId: 'evt-9' });
  });

  it('omits displayName when the server names none, and reads a missing linkedEmail as null', async () => {
    session('u1');
    const { token } = renewed('u1');
    stubFetch(reply(200, { token, exp: FAR, displayName: null }));

    const res = await refreshGuestSession('evt-9');

    expect(res).toStrictEqual({ kind: 'ok', token, userId: 'u1', linkedEmail: null });
    expect(cached().linkedEmail).toBeNull();
  });

  it('a 401 (missing, invalid or expired session) is unauthenticated and leaves the cache alone', async () => {
    const old = session('u1');
    stubFetch(reply(401, { error: 'invalid token' }));
    expect(await refreshGuestSession('evt-9')).toEqual({ kind: 'unauthenticated' });
    expect(cached().token).toBe(old);
  });

  it('a 403 (no longer on the list, or the host revoked the link) is unknown and leaves the cache alone', async () => {
    const old = session('u1');
    stubFetch(reply(403, { error: 'unknown invitation' }));
    expect(await refreshGuestSession('evt-9')).toEqual({ kind: 'unknown' });
    expect(cached().token).toBe(old);
  });

  it('5xx, a 429, a WAF 403, a network failure and an unusable 200 are retryable errors that write nothing', async () => {
    const old = session('u1');
    const failures: Array<Response | (() => Promise<Response>)> = [
      // shore#401: a 403 the auth service did not write — the WAF's /auth/ rate limit.
      { status: 403, ok: false, json: async () => { throw new SyntaxError('not json'); } } as unknown as Response,
      reply(403, { message: 'Forbidden' }),
      reply(500, { error: 'lookup failed' }),
      reply(503, {}),
      reply(429, { error: 'rate limited' }),
      () => Promise.reject(new TypeError('Failed to fetch')),
      reply(200, null),
      reply(200, { exp: FAR }), // no token
      reply(200, { token: jwt({ sub: 'u1' }) }), // no exp
      reply(200, { token: 'not-a-jwt', exp: FAR }), // no sub to learn
      { status: 200, ok: true, json: async () => { throw new SyntaxError('bad json'); } } as unknown as Response,
    ];
    for (const failure of failures) {
      stubFetch(failure);
      expect(await refreshGuestSession('evt-9')).toEqual({ kind: 'error' });
      expect(cached().token).toBe(old);
    }
  });

  it('with no session cached for the event it is a no-op: nothing is sent', async () => {
    const spy = stubFetch(reply(200, renewed('u1').body));

    expect(await refreshGuestSession('evt-9')).toEqual({ kind: 'noSession' }); // empty cache
    session('u1', 'evt-other');
    expect(await refreshGuestSession('evt-9')).toEqual({ kind: 'noSession' }); // another event's session
    store.set(TOKEN_KEY, '{corrupt');
    expect(await refreshGuestSession('evt-9')).toEqual({ kind: 'noSession' });
    store.set(TOKEN_KEY, JSON.stringify({ exp: FAR, userId: 'u1', eventId: 'evt-9' })); // no token
    expect(await refreshGuestSession('evt-9')).toEqual({ kind: 'noSession' });
    expect(await refreshGuestSession('')).toEqual({ kind: 'noSession' });
    expect(await refreshGuestSession(null)).toEqual({ kind: 'noSession' });
    expect(await refreshGuestSession(undefined)).toEqual({ kind: 'noSession' });

    expect(spy).not.toHaveBeenCalled();
  });

  it('with no storage at all it is a no-op, never a throw', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    });
    const spy = stubFetch(reply(200, {}));
    expect(await refreshGuestSession('evt-9')).toEqual({ kind: 'noSession' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('leaves expiry judgement to the server: an expired cached session is still presented once', async () => {
    // The client clock is not authoritative; the server answers 401 for a dead session.
    session('u1', 'evt-9', 1);
    const spy = stubFetch(reply(401, { error: 'invalid token' }));
    expect(await refreshGuestSession('evt-9')).toEqual({ kind: 'unauthenticated' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('concurrent callers share one renewal of the same session', async () => {
    session('u1');
    const { token, body } = renewed('u1');
    const { spy, release } = deferredFetch();

    const a = refreshGuestSession('evt-9');
    const b = refreshGuestSession('evt-9');
    release(reply(200, body));

    const expected = { kind: 'ok', token, userId: 'u1', linkedEmail: 'anna@example.com', displayName: 'Anna' };
    expect(await a).toEqual(expected);
    expect(await b).toEqual(expected);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cached().token).toBe(token);
  });
});

describe('refreshGuestSession never clobbers a session that changed in flight (shore#395)', () => {
  it('a claim that lands while the renewal is in flight wins', async () => {
    session('u1');
    const { release } = deferredFetch();
    const pending = refreshGuestSession('evt-9');

    // The claim answers on its own fetch; swap the stub for it, then release the renewal.
    const claimed = jwt({ sub: 'u-canonical', evt: 'evt-9' });
    const refreshFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) =>
      url === GuestEventApi.claim('evt-9')
        ? reply(200, { token: claimed, exp: FAR, userId: 'u-canonical', claimed: true, linkedEmail: 'bob@example.com' })
        : (refreshFetch as typeof fetch)(url, init)));
    expect(await claimIdentity({ eventId: 'evt-9', credential: 'c' })).toMatchObject({ kind: 'ok' });

    release(reply(200, renewed('u1').body));
    expect(await pending).toEqual({ kind: 'superseded' });
    expect(cached()).toMatchObject({ token: claimed, userId: 'u-canonical', linkedEmail: 'bob@example.com' });
  });

  it('a no-event login that lands while the renewal is in flight wins', async () => {
    session('u1');
    const { release } = deferredFetch();
    const pending = refreshGuestSession('evt-9');

    const loggedIn = jwt({ sub: 'u2', evt: 'evt-9' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe(PublicApi.GUEST_LOGIN);
      return reply(200, { token: loggedIn, exp: FAR, userId: 'u2', eventId: 'evt-9' });
    }));
    expect(await loginNoEvent('cred')).toMatchObject({ kind: 'ok' });

    release(reply(200, renewed('u1').body));
    expect(await pending).toEqual({ kind: 'superseded' });
    expect(cached()).toMatchObject({ token: loggedIn, userId: 'u2' });
  });

  it('a sign-out while the renewal is in flight is not undone', async () => {
    session('u1');
    const { release } = deferredFetch();
    const pending = refreshGuestSession('evt-9');

    clearGuestToken();
    release(reply(200, renewed('u1').body));

    expect(await pending).toEqual({ kind: 'superseded' });
    expect(store.has(TOKEN_KEY)).toBe(false);
  });

  it('another lane that wrote a different session in the meantime wins (no generation bump needed)', async () => {
    session('u1');
    const { release } = deferredFetch();
    const pending = refreshGuestSession('evt-9');

    const fromLink = jwt({ sub: 'u3', evt: 'evt-9' });
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { token: fromLink, exp: FAR })));
    expect(await exchangeInvitationToken('evt-9', 'raw-token')).toMatchObject({ kind: 'ok', userId: 'u3' });

    release(reply(200, renewed('u1').body));
    expect(await pending).toEqual({ kind: 'superseded' });
    expect(cached()).toMatchObject({ token: fromLink, userId: 'u3' });
  });
});

describe('refreshGuestSession and its neighbours keep one another’s writes (shore#395)', () => {
  it('a finished renewal is forgotten: a 503 does not answer the next call', async () => {
    session('u1');
    const { token, body } = renewed('u1');
    const spy = stubFetch(reply(503, {}));
    expect(await refreshGuestSession('evt-9')).toEqual({ kind: 'error' });

    spy.mockImplementation(async () => reply(200, body));
    expect(await refreshGuestSession('evt-9')).toMatchObject({ kind: 'ok', token });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('a claim that re-mints the very same token string is still caught by the generation', async () => {
    const old = session('u1');
    const { release } = deferredFetch();
    const pending = refreshGuestSession('evt-9');

    const refreshFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) =>
      url === GuestEventApi.claim('evt-9')
        ? reply(200, { token: old, exp: FAR, userId: 'u1', claimed: true, linkedEmail: 'bob@example.com' })
        : (refreshFetch as typeof fetch)(url, init)));
    expect(await claimIdentity({ eventId: 'evt-9', credential: 'c' })).toMatchObject({ kind: 'ok' });

    release(reply(200, renewed('u1').body));
    expect(await pending).toEqual({ kind: 'superseded' });
    expect(cached()).toMatchObject({ token: old, linkedEmail: 'bob@example.com' });
  });

  it('a no-event login that re-mints the very same token string is still caught by the generation', async () => {
    const old = session('u1');
    const { release } = deferredFetch();
    const pending = refreshGuestSession('evt-9');

    const refreshFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) =>
      url === PublicApi.GUEST_LOGIN
        ? reply(200, { token: old, exp: FAR - 7, userId: 'u1', eventId: 'evt-9', linkedEmail: 'carol@example.com' })
        : (refreshFetch as typeof fetch)(url, init)));
    expect(await loginNoEvent('cred')).toMatchObject({ kind: 'ok' });
    const afterLogin = cached();

    release(reply(200, renewed('u1').body));
    expect(await pending).toEqual({ kind: 'superseded' });
    expect(cached()).toEqual(afterLogin);
    expect(afterLogin).toMatchObject({ token: old, exp: FAR - 7, linkedEmail: 'carol@example.com' });
  });

  it('an unlink that lands after a renewal keeps the renewed session, not the one it read first', async () => {
    session('u1', 'evt-9', 1);
    let releaseUnlink!: (r: Response) => void;
    const unlinkReply = new Promise<Response>((resolve) => { releaseUnlink = resolve; });
    const { token, body } = renewed('u1');
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === GuestEventApi.unlink('evt-9') ? unlinkReply : reply(200, body)));

    const unlinking = unlinkIdentity('evt-9');
    expect(await refreshGuestSession('evt-9')).toMatchObject({ kind: 'ok', token });
    releaseUnlink(reply(200, {}));

    expect(await unlinking).toEqual({ kind: 'ok' });
    expect(cached()).toEqual({ token, exp: FAR - 1, userId: 'u1', eventId: 'evt-9', linkedEmail: null });
  });

  it('a renewal that lands after an unlink does not write the pre-unlink linkedEmail back', async () => {
    session('u1');
    const { release } = deferredFetch();
    const pending = refreshGuestSession('evt-9');

    const refreshFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) =>
      url === GuestEventApi.unlink('evt-9') ? reply(200, {}) : (refreshFetch as typeof fetch)(url, init)));
    expect(await unlinkIdentity('evt-9')).toEqual({ kind: 'ok' });

    const { token, body } = renewed('u1');
    release(reply(200, body));
    expect(await pending).toMatchObject({ kind: 'ok', token, linkedEmail: null });
    expect(cached()).toMatchObject({ token, linkedEmail: null });
  });
});

describe('the mint lanes pass displayName through (shore#503)', () => {
  it('exchangeInvitationToken', async () => {
    const token = jwt({ sub: 'u1', evt: 'evt-9' });
    stubFetch(reply(200, { token, exp: FAR, linkedEmail: null, displayName: 'Anna' }));
    expect(await exchangeInvitationToken('evt-9', 'raw')).toStrictEqual(
      { kind: 'ok', token, userId: 'u1', displayName: 'Anna' });
  });

  it('exchangeLegacyInvite', async () => {
    const token = jwt({ sub: 'u1', evt: 'evt-9' });
    stubFetch(reply(200, { token, exp: FAR, invitationToken: 'fresh', displayName: 'Anna' }));
    expect(await exchangeLegacyInvite('evt-9', 'u1')).toStrictEqual(
      { kind: 'ok', token, userId: 'u1', invitationToken: 'fresh', displayName: 'Anna' });
  });

  it('claimIdentity', async () => {
    stubFetch(reply(200, {
      token: jwt({ sub: 'u1', evt: 'evt-9' }), exp: FAR, userId: 'u1', claimed: true,
      linkedEmail: 'anna@example.com', displayName: 'Anna',
    }));
    expect(await claimIdentity({ eventId: 'evt-9', credential: 'c' })).toStrictEqual(
      { kind: 'ok', userId: 'u1', claimed: true, linkedEmail: 'anna@example.com', displayName: 'Anna' });
  });

  it('loginNoEvent', async () => {
    stubFetch(reply(200, { token: 'jwt.abc', exp: FAR, userId: 'u1', eventId: 'evt-9', displayName: 'Anna' }));
    expect(await loginNoEvent('cred')).toStrictEqual(
      { kind: 'ok', userId: 'u1', eventId: 'evt-9', displayName: 'Anna' });
  });

  it('a backend that sends none (or a non-string, or empty) leaves the result exactly as before', async () => {
    const token = jwt({ sub: 'u1', evt: 'evt-9' });
    for (const displayName of [undefined, null, '', 42, { first: 'Anna' }]) {
      stubFetch(reply(200, { token, exp: FAR, userId: 'u1', eventId: 'evt-9', claimed: false, displayName }));
      expect(await exchangeInvitationToken('evt-9', 'raw')).toStrictEqual({ kind: 'ok', token, userId: 'u1' });
      expect(await exchangeLegacyInvite('evt-9', 'u1')).toStrictEqual(
        { kind: 'ok', token, userId: 'u1', invitationToken: undefined });
      expect(await claimIdentity({ eventId: 'evt-9', credential: 'c' })).toStrictEqual(
        { kind: 'ok', userId: 'u1', claimed: false, linkedEmail: null });
      expect(await loginNoEvent('cred')).toStrictEqual({ kind: 'ok', userId: 'u1', eventId: 'evt-9' });
    }
  });
});
