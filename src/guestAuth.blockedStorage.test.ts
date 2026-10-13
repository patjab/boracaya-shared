// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  claimIdentity,
  clearGuestToken,
  ensureGuestToken,
  exchangeInvitationToken,
  guestAuthHeaders,
  guestTokenExpiresInSeconds,
  hasGuestSession,
  loginNoEvent,
  refreshGuestSession,
  unlinkIdentity,
} from './guestAuth';
import { GuestEventApi, PublicApi } from './publicApi';

/**
 * Site data blocked (shore#491): resolving `sessionStorage` itself throws SecurityError
 * (Chrome/Edge "block all site data", some enterprise policies). A session the server
 * minted must still serve the tab it was minted in, and no lane may turn a server success
 * into a failure because it could not be persisted. Hermetic: fetch is stubbed.
 */

const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!;

beforeEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    get() { throw new DOMException('denied', 'SecurityError'); },
  });
});

afterEach(() => {
  clearGuestToken(); // the in-memory sessions belong to this module, not the stubbed storage
  Object.defineProperty(window, 'sessionStorage', original);
});

const b64url = (s: string) =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>) =>
  `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(claims))}.${b64url('sig')}`;

const reply = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
const soon = () => Math.floor(Date.now() / 1000) + 3600;

describe('with site storage blocked, a minted session lives in memory for the tab (shore#491)', () => {
  it('exchange, then the auth headers carry the session — no second exchange, no throw', async () => {
    const token = jwt({ sub: 'u1', evt: 'e1' });
    const spy = vi.fn(async () => reply(200, { token, exp: soon() }));
    vi.stubGlobal('fetch', spy);

    expect(await exchangeInvitationToken('e1', 'tok')).toMatchObject({ kind: 'ok', userId: 'u1' });
    expect(await guestAuthHeaders('e1', 'u1')).toEqual({ Authorization: `Bearer ${token}` });
    expect(await ensureGuestToken('e1', 'u1')).toBe(token);
    expect(hasGuestSession('e1', 'u1')).toBe(true);
    expect(guestTokenExpiresInSeconds('e1')).toBeGreaterThan(3500);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('ensureGuestToken and hasGuestSession never throw with nothing held', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(500, {})));
    expect(hasGuestSession('e1', 'u1')).toBe(false);
    await expect(ensureGuestToken('e1', 'u1')).resolves.toBeNull();
    await expect(guestAuthHeaders('e1', 'u1')).resolves.toEqual({});
    expect(guestTokenExpiresInSeconds()).toBeUndefined();
  });

  it('a Google claim the server accepted is ok, and its session serves the next call', async () => {
    const token = jwt({ sub: 'u-canonical', evt: 'e1' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === GuestEventApi.claim('e1')
      ? reply(200, { token, exp: soon(), userId: 'u-canonical', claimed: true, linkedEmail: 'anna@example.com' })
      : reply(500, {}))));

    expect(await claimIdentity({ eventId: 'e1', credential: 'g', userId: 'u1' }))
      .toMatchObject({ kind: 'ok', userId: 'u-canonical', linkedEmail: 'anna@example.com' });
    expect(await guestAuthHeaders('e1', 'u-canonical')).toEqual({ Authorization: `Bearer ${token}` });
  });

  it('a no-event login the server accepted is ok, and its session serves the next call', async () => {
    const token = jwt({ sub: 'u1', evt: 'e1' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe(PublicApi.GUEST_LOGIN);
      return reply(200, { token, exp: soon(), userId: 'u1', eventId: 'e1' });
    }));
    expect(await loginNoEvent('g')).toMatchObject({ kind: 'ok', userId: 'u1', eventId: 'e1' });
    expect(hasGuestSession('e1', 'u1')).toBe(true);
  });

  it('an unlink the server accepted is ok and keeps the session; a renewal replaces it in memory', async () => {
    const token = jwt({ sub: 'u1', evt: 'e1' });
    const renewed = jwt({ sub: 'u1', evt: 'e1', renewed: true });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === GuestEventApi.guestToken('e1')) return reply(200, { token, exp: soon(), linkedEmail: 'anna@example.com' });
      if (url === GuestEventApi.unlink('e1')) return reply(200, {});
      expect(url).toBe(GuestEventApi.refresh('e1'));
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
      return reply(200, { token: renewed, exp: soon() });
    }));
    await exchangeInvitationToken('e1', 'tok');

    expect(await unlinkIdentity('e1')).toEqual({ kind: 'ok' });
    expect(await ensureGuestToken('e1', 'u1')).toBe(token);
    expect(await refreshGuestSession('e1')).toMatchObject({ kind: 'ok', token: renewed, linkedEmail: null });
    expect(await ensureGuestToken('e1', 'u1')).toBe(renewed);
  });

  it('clearing drops the in-memory session: its own event’s, or every event’s', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const evt = url === GuestEventApi.guestToken('e1') ? 'e1' : 'e2';
      return reply(200, { token: jwt({ sub: 'u1', evt }), exp: soon() });
    }));
    await exchangeInvitationToken('e1', 'tok');
    await exchangeInvitationToken('e2', 'tok');

    clearGuestToken('e1');
    expect(hasGuestSession('e1', 'u1')).toBe(false);
    expect(hasGuestSession('e2', 'u1')).toBe(true);
    clearGuestToken();
    expect(hasGuestSession('e2', 'u1')).toBe(false);
  });
});

describe('storage that comes back (shore#491)', () => {
  it('a write that persists supersedes the in-memory copy', async () => {
    const first = jwt({ sub: 'u1', evt: 'e1', n: 1 });
    const second = jwt({ sub: 'u1', evt: 'e1', n: 2 });
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { token: first, exp: soon() })));
    await exchangeInvitationToken('e1', 'tok');

    Object.defineProperty(window, 'sessionStorage', original);
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { token: second, exp: soon() })));
    await exchangeInvitationToken('e1', 'tok');

    expect(JSON.parse(sessionStorage.getItem('pdab_guest_token:e1')!).token).toBe(second);
    expect(await ensureGuestToken('e1', 'u1')).toBe(second);
    sessionStorage.clear();
    expect(hasGuestSession('e1', 'u1')).toBe(false); // nothing stale left in memory
  });
});
