import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  claimIdentity,
  ensureGuestToken,
  exchangeInvitationToken,
  exchangeLegacyInvite,
  guestTokenExpiresInSeconds,
  hasGuestSession,
  loginNoEvent,
  refreshGuestSession,
} from './guestAuth';
import { GuestEventApi } from './publicApi';

/**
 * A session's expiry is judged on the device's own clock, from when it was received
 * (shore#530). The server sends `exp` on ITS clock; a device whose clock is an hour or
 * more fast used to read every fresh session as already expired, and one that is slow
 * kept presenting sessions the server had expired. The cache now records the token's
 * lifetime (`exp - iat`) counted from receipt. Hermetic: fetch, sessionStorage and the
 * Date clock are stubbed.
 */

const store = new Map<string, string>();
const SERVER_NOW = 1_800_000_000; // unix seconds on the server's clock
const TTL = 3600;

beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

const b64url = (s: string) =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>) =>
  `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(claims))}.${b64url('sig')}`;
const reply = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

/** A mint as the backend makes one: iat = server now, exp = iat + TTL. */
const mint = (sub = 'uA', evt = 'evA') => {
  const token = jwt({ sub, evt, scope: 'guest', iat: SERVER_NOW, exp: SERVER_NOW + TTL });
  return { token, exp: SERVER_NOW + TTL };
};

/** Put the device clock `offsetS` seconds away from the server's. */
const deviceAt = (offsetS: number) => vi.setSystemTime((SERVER_NOW + offsetS) * 1000);

describe('session expiry follows the device clock from receipt (shore#530)', () => {
  it('a device two hours fast keeps a fresh session: ok, live, and served from the cache', async () => {
    deviceAt(2 * 3600);
    const { token, exp } = mint();
    const spy = vi.fn(async () => reply(200, { token, exp }));
    vi.stubGlobal('fetch', spy);

    expect(await exchangeInvitationToken('evA', 'T')).toMatchObject({ kind: 'ok', userId: 'uA' });
    expect(hasGuestSession('evA', 'uA')).toBe(true);
    expect(await ensureGuestToken('evA', 'uA')).toBe(token);
    expect(spy).toHaveBeenCalledTimes(1); // no second /auth exchange
    expect(guestTokenExpiresInSeconds('evA')).toBe(TTL);
  });

  it('still expires after its lifetime on the device clock, with the 30 s margin kept', async () => {
    deviceAt(2 * 3600);
    const { token, exp } = mint();
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { token, exp })));
    await exchangeInvitationToken('evA', 'T');

    vi.setSystemTime(Date.now() + (TTL - 31) * 1000);
    expect(hasGuestSession('evA', 'uA')).toBe(true);
    vi.setSystemTime(Date.now() + 2000);
    expect(hasGuestSession('evA', 'uA')).toBe(false);
  });

  it('a device two hours slow stops presenting the session when the server expires it', async () => {
    deviceAt(-2 * 3600);
    const { token, exp } = mint();
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { token, exp })));
    await exchangeInvitationToken('evA', 'T');

    // An hour on: the server has expired it, though the device's clock is still before `exp`.
    vi.setSystemTime(Date.now() + TTL * 1000);
    expect(hasGuestSession('evA', 'uA')).toBe(false);
  });

  it('every lane that caches a session times it from receipt', async () => {
    deviceAt(2 * 3600);
    const claimed = mint('uA');
    const loggedIn = mint('uB', 'evB');
    const renewed = mint('uA');
    const legacy = mint('uC', 'evC');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === GuestEventApi.claim('evA')) return reply(200, { ...claimed, userId: 'uA', claimed: true });
      if (url === GuestEventApi.refresh('evA')) return reply(200, renewed);
      if (url === GuestEventApi.exchange('evC')) return reply(200, legacy);
      return reply(200, { ...loggedIn, userId: 'uB', eventId: 'evB' });
    }));

    // The legacy lane, with a usable iat, on the same fast clock (Codex r2 on #197).
    expect(await exchangeLegacyInvite('evC', 'uC')).toMatchObject({ kind: 'ok', token: legacy.token });
    expect(hasGuestSession('evC', 'uC')).toBe(true);
    expect(await ensureGuestToken('evC', 'uC')).toBe(legacy.token);
    expect(JSON.parse(store.get('pdab_guest_token:evC')!).expiresAt).toBe(Date.now() + TTL * 1000);

    await claimIdentity({ eventId: 'evA', credential: 'g' });
    expect(hasGuestSession('evA', 'uA')).toBe(true);
    await loginNoEvent('g');
    expect(hasGuestSession('evB', 'uB')).toBe(true);
    expect(await refreshGuestSession('evA')).toMatchObject({ kind: 'ok' });
    expect(hasGuestSession('evA', 'uA')).toBe(true);
    expect(JSON.parse(store.get('pdab_guest_token:evA')!).expiresAt).toBe(Date.now() + TTL * 1000);
  });

  it('a reload reads the receipt-relative expiry from storage', async () => {
    deviceAt(2 * 3600);
    const { token, exp } = mint();
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { token, exp })));
    await exchangeInvitationToken('evA', 'T');
    const persisted = store.get('pdab_guest_token:evA')!;

    store.clear();
    store.set('pdab_guest_token:evA', persisted);
    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    expect(hasGuestSession('evA', 'uA')).toBe(true);
  });

  it('an entry from before it, or a token with no usable iat, falls back to the server exp', async () => {
    deviceAt(0);
    store.set('pdab_guest_token:evA', JSON.stringify({ token: 't', exp: SERVER_NOW + 60, userId: 'uA', eventId: 'evA' }));
    expect(hasGuestSession('evA', 'uA')).toBe(true);
    expect(guestTokenExpiresInSeconds('evA')).toBe(60);

    // The legacy lane caches even a token whose payload it cannot read (it keeps the URL's id).
    const noIat = [jwt({ sub: 'uA', exp: SERVER_NOW + TTL }), jwt({ sub: 'uA', iat: 'x' }), 'h.e.y'];
    for (const token of noIat) {
      store.clear();
      vi.stubGlobal('fetch', vi.fn(async () => reply(200, { token, exp: SERVER_NOW + TTL })));
      expect(await exchangeLegacyInvite('evA', 'uA')).toMatchObject({ kind: 'ok', token });
      expect(JSON.parse(store.get('pdab_guest_token:evA')!)).not.toHaveProperty('expiresAt');
      expect(guestTokenExpiresInSeconds('evA')).toBe(TTL);
    }
  });
});
